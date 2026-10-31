import { expect, test } from "bun:test";
import { configSchema } from "../plugin/config";
import { createFunctions } from "../plugin/functions";
import type { Fetcher } from "../plugin/http";
import type { Store } from "../plugin/tools";

const credentials = { shippo: { secret_apiKey: "shippo_test_token" } };
const store = { get: async () => ({ value: {} }) } as unknown as Store;
function handler(name: string, fetcher: Fetcher) {
	const fn = createFunctions(store, fetcher).find(
		(entry) => entry.name === name,
	);
	if (!fn) throw new Error("missing tool");
	return fn.handler;
}
test("strict config disallows hosts, accounts and credentials", () => {
	for (const config of [
		{ baseUrl: "https://evil.test" },
		{ accountId: "other" },
		{ apiKey: "secret" },
		{ timeoutMs: 30001 },
	])
		expect(configSchema.safeParse(config).success).toBe(false);
});
test("all tools require named credentials and are readonly", () => {
	for (const fn of createFunctions(store)) {
		expect(fn.calling).toBe("named");
		expect(fn.requiredCredentials).toEqual(["shippo"]);
		expect(fn.metadata?.readonly).toBe(true);
	}
});
test("transaction pagination is fixed host GET with pinned version and no account override", async () => {
	const result = await handler("listTransactions", async (url, init) => {
		expect(url).toBe("https://api.goshippo.com/transactions/?page=2&results=5");
		expect(init.method).toBe("GET");
		const headers = new Headers(init.headers);
		expect(headers.get("Authorization")).toBe("ShippoToken shippo_test_token");
		expect(headers.get("SHIPPO-API-VERSION")).toBe("2018-02-08");
		expect(headers.has("SHIPPO-ACCOUNT-ID")).toBe(false);
		return Response.json({
			results: [
				{
					object_id: "a".repeat(32),
					tracking_number: "123",
					label_url: "PRIVATE",
					rate: {
						object_id: "rate",
						shipment: "shipment",
						provider: "USPS",
						amount: "10",
					},
				},
			],
			next: "https://evil.test",
			count: 7,
		});
	})(credentials, { page: 2, pageSize: 5 });
	expect(result.nextPage).toBe(3);
	expect(result.results[0].label_url).toBeUndefined();
	expect(result.results[0].rate.amount).toBeUndefined();
	expect(result.results[0].rate.shipment).toBe("shipment");
});
test("tracking reads exact references and caps history without exposing address", async () => {
	const result = await handler("getTracking", async (url, init) => {
		expect(url).toBe("https://api.goshippo.com/tracks/usps/123/");
		expect(init.method).toBe("GET");
		return Response.json({
			carrier: "usps",
			tracking_number: "123",
			address_to: { zip: "PRIVATE" },
			tracking_history: Array.from({ length: 101 }, () => ({
				status: "TRANSIT",
				location: { zip: "PRIVATE" },
			})),
		});
	})(credentials, { carrier: "usps", trackingNumber: "123" });
	expect(result.historyTruncated).toBe(true);
	expect(result.tracking_history).toHaveLength(100);
	expect(result.address_to).toBeUndefined();
	expect(result.tracking_history[0].location).toBeUndefined();
});
test("rejects path injection, unbounded pages, missing secrets and reference mismatch", async () => {
	const noFetch: Fetcher = async () => {
		throw new Error("unexpected network");
	};
	await expect(
		handler("getTransaction", noFetch)(credentials, { id: "../../refunds" }),
	).rejects.toThrow("INVALID_INPUT");
	await expect(
		handler("getTracking", noFetch)(credentials, {
			carrier: "usps/../",
			trackingNumber: "123",
		}),
	).rejects.toThrow("INVALID_INPUT");
	await expect(
		handler("listShipments", noFetch)(credentials, { pageSize: 101 }),
	).rejects.toThrow("INVALID_INPUT");
	await expect(handler("testConnection", noFetch)({}, {})).rejects.toThrow(
		"MISSING_CREDENTIALS",
	);
	await expect(
		handler("getTracking", async () =>
			Response.json({ carrier: "ups", tracking_number: "123" }),
		)(credentials, { carrier: "usps", trackingNumber: "123" }),
	).rejects.toThrow("REFERENCE_MISMATCH");
});

test("exact transaction and shipment IDs cannot silently mismatch", async () => {
	for (const name of ["getTransaction", "getShipment"])
		await expect(
			handler(name, async () => Response.json({ object_id: "b".repeat(32) }))(
				credentials,
				{ id: "a".repeat(32) },
			),
		).rejects.toThrow("REFERENCE_MISMATCH");
});

test("page safety ceiling remains explicit instead of returning an unusable cursor", async () => {
	const result = await handler("listShipments", async () =>
		Response.json({
			results: [],
			next: "https://api.goshippo.com/shipments/?page=10001",
		}),
	)(credentials, { page: 10000 });
	expect(result.nextPage).toBeNull();
	expect(result.hasMore).toBe(true);
	expect(result.truncated).toBe(true);
});
