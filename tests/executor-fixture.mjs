import assert from "node:assert/strict";

const transaction = {
	object_id: "a".repeat(32),
	status: "SUCCESS",
	tracking_number: "123",
};
const shipment = { object_id: "b".repeat(32), status: "SUCCESS", parcels: [] };
export default async function createFixture() {
	return {
		configuration: {},
		provider: "shippo",
		secret: { secret_apiKey: "synthetic-shippo" },
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(url.origin, "https://api.goshippo.com");
			assert.equal(request.method, "GET");
			assert.equal(
				request.headers.get("authorization"),
				"ShippoToken synthetic-shippo",
			);
			if (url.pathname === "/tracks/usps/123/")
				return Response.json({
					carrier: "usps",
					tracking_number: "123",
					tracking_status: { status: "TRANSIT" },
				});
			const rows = url.pathname.startsWith("/transactions")
				? [transaction]
				: [shipment];
			if (
				url.pathname === `/transactions/${transaction.object_id}/` ||
				url.pathname === `/shipments/${shipment.object_id}/`
			)
				return Response.json(rows[0]);
			assert(
				["/transactions/", "/shipments/"].includes(url.pathname),
				url.pathname,
			);
			return Response.json({ results: rows, next: null, previous: null });
		},
		async run(call) {
			await call("testConnection");
			assert.equal(
				(await call("listTransactions")).results[0].object_id,
				transaction.object_id,
			);
			assert.equal(
				(await call("getTransaction", { id: transaction.object_id })).object_id,
				transaction.object_id,
			);
			assert.equal(
				(await call("listShipments")).results[0].object_id,
				shipment.object_id,
			);
			assert.equal(
				(await call("getShipment", { id: shipment.object_id })).object_id,
				shipment.object_id,
			);
			assert.equal(
				(await call("getTracking", { carrier: "usps", trackingNumber: "123" }))
					.tracking_status.status,
				"TRANSIT",
			);
		},
	};
}
