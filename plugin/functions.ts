import { z } from "zod";
import { get } from "./client";
import {
	defaultFetch,
	type Fetcher,
	PluginError,
	pageSize,
	parse,
	pick,
	record,
} from "./http";
import { empty, idParameter, type Store, tools } from "./tools";

const id = z.string().regex(/^[a-f0-9]{32}$/);
const page = z.strictObject({
	page: z.number().int().min(1).max(10_000).default(1),
	pageSize,
});
const parameters = [
	{ name: "page", type: "number", optional: true },
	{ name: "pageSize", type: "number", optional: true },
];
const transactionFields = [
	"object_id",
	"object_created",
	"object_updated",
	"status",
	"test",
	"metadata",
	"order",
	"parcel",
	"rate",
	"tracking_number",
	"tracking_status",
	"tracking_url_provider",
];
const shipmentFields = [
	"object_id",
	"object_created",
	"object_updated",
	"object_status",
	"status",
	"test",
	"metadata",
	"order",
	"shipment_date",
];
function exact(value: Record<string, unknown>, id: string) {
	if (value.object_id !== id) throw new PluginError("REFERENCE_MISMATCH");
	return value;
}
function projectTransaction(value: unknown) {
	const result = pick(value, transactionFields);
	if (result.rate && typeof result.rate === "object")
		result.rate = pick(result.rate, [
			"object_id",
			"shipment",
			"provider",
			"servicelevel_name",
			"servicelevel_token",
		]);
	return result;
}
function pageResult(
	data: Record<string, unknown>,
	currentPage: number,
	limit: number,
	project: (row: unknown) => unknown,
) {
	const results = parse(
		z.array(z.unknown()).max(limit),
		data.results,
		"INVALID_RESPONSE",
	);
	return {
		results: results.map(project),
		nextPage: data.next && currentPage < 10_000 ? currentPage + 1 : null,
		hasMore: !!data.next,
		truncated: !!data.next && currentPage === 10_000,
		count: data.count ?? null,
	};
}
export function createFunctions(store: Store, fetcher: Fetcher = defaultFetch) {
	const tool = tools(store);
	const read = (
		config: Parameters<typeof get>[0],
		credentials: unknown,
		path: string,
		params: Record<string, string | number | undefined> = {},
	) => get(config, credentials, path, params, fetcher);
	return [
		tool(
			"testConnection",
			"Verify transaction read access with a one-record request. Does not establish an account owner identity.",
			empty,
			[],
			async (config, credentials) => {
				await read(config, credentials, "/transactions/", { results: 1 });
				return {
					connected: true,
					apiVersion: "2018-02-08",
					identityVerified: false,
				};
			},
		),
		tool(
			"listTransactions",
			"Read one numbered page of existing shipping-label transactions; never purchase a label.",
			page,
			parameters,
			async (config, credentials, input) =>
				pageResult(
					await read(config, credentials, "/transactions/", {
						page: input.page,
						results: input.pageSize,
					}),
					input.page,
					input.pageSize,
					projectTransaction,
				),
		),
		tool(
			"getTransaction",
			"Read an exact transaction with order, rate and tracking references. Excludes label download URLs.",
			z.strictObject({ id }),
			[idParameter],
			async (config, credentials, input) =>
				projectTransaction(
					exact(
						await read(config, credentials, `/transactions/${input.id}/`),
						input.id,
					),
				),
		),
		tool(
			"listShipments",
			"Read one page of existing shipment references; no addresses, parcel creation or rate shopping.",
			page,
			parameters,
			async (config, credentials, input) =>
				pageResult(
					await read(config, credentials, "/shipments/", {
						page: input.page,
						results: input.pageSize,
					}),
					input.page,
					input.pageSize,
					(row) => pick(row, shipmentFields),
				),
		),
		tool(
			"getShipment",
			"Read an existing shipment's correlation references, excluding recipient addresses and rates.",
			z.strictObject({ id }),
			[idParameter],
			async (config, credentials, input) =>
				pick(
					exact(
						await read(config, credentials, `/shipments/${input.id}/`),
						input.id,
					),
					shipmentFields,
				),
		),
		tool(
			"getTracking",
			"GET tracking evidence for an exact carrier token and tracking number. Does not register tracking webhooks.",
			z.strictObject({
				carrier: z.string().regex(/^[a-z0-9_]{1,64}$/),
				trackingNumber: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
			}),
			[
				{ name: "carrier", type: "string" },
				{ name: "trackingNumber", type: "string" },
			],
			async (config, credentials, input) => {
				const data = await read(
					config,
					credentials,
					`/tracks/${input.carrier}/${input.trackingNumber}/`,
				);
				if (
					data.carrier !== input.carrier ||
					data.tracking_number !== input.trackingNumber
				)
					throw new PluginError("REFERENCE_MISMATCH");
				const result = pick(data, [
					"carrier",
					"tracking_number",
					"transaction",
					"eta",
					"original_eta",
					"tracking_status",
					"tracking_history",
				]);
				const history = parse(
					z.array(z.unknown()),
					result.tracking_history ?? [],
					"INVALID_RESPONSE",
				);
				result.tracking_history = history
					.slice(-100)
					.map((event) =>
						pick(event, [
							"object_id",
							"status",
							"status_details",
							"status_date",
							"substatus",
						]),
					);
				if (result.tracking_status)
					result.tracking_status = pick(record(result.tracking_status), [
						"object_id",
						"status",
						"status_details",
						"status_date",
						"substatus",
					]);
				return { ...result, historyTruncated: history.length > 100 };
			},
		),
	];
}
