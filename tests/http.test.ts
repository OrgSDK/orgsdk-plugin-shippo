import { describe, expect, test } from "bun:test";
import { requestJson } from "../plugin/http";

describe("bounded secret-safe transport", () => {
	test("uses redirect error and a timeout signal", async () => {
		await requestJson(
			"https://example.invalid",
			{ method: "GET" },
			1000,
			async (_url, init) => {
				expect(init.redirect).toBe("error");
				expect(init.signal).toBeInstanceOf(AbortSignal);
				return Response.json({ ok: true });
			},
		);
	});
	test("rejects redirects and never echoes upstream bodies", async () => {
		for (const [status, code] of [
			[302, "REDIRECT_REJECTED"],
			[401, "AUTHENTICATION_FAILED"],
			[403, "ACCESS_DENIED"],
			[404, "NOT_FOUND"],
			[429, "RATE_LIMITED"],
			[500, "UPSTREAM_ERROR"],
		] as const) {
			await expect(
				requestJson(
					"https://example.invalid",
					{},
					1000,
					async () => new Response("PRIVATE TOKEN", { status }),
				),
			).rejects.toThrow(code);
		}
	});
	test("rejects oversized declared and streamed responses", async () => {
		await expect(
			requestJson(
				"https://example.invalid",
				{},
				1000,
				async () =>
					new Response("{}", { headers: { "Content-Length": "2000001" } }),
			),
		).rejects.toThrow("RESPONSE_TOO_LARGE");
		await expect(
			requestJson(
				"https://example.invalid",
				{},
				1000,
				async () => new Response(new Uint8Array(2_000_001)),
			),
		).rejects.toThrow("RESPONSE_TOO_LARGE");
	});
	test("rejects malformed JSON and network exception details", async () => {
		await expect(
			requestJson(
				"https://example.invalid",
				{},
				1000,
				async () => new Response("not json"),
			),
		).rejects.toThrow("INVALID_RESPONSE");
		await expect(
			requestJson("https://example.invalid", {}, 1000, async () => {
				throw new Error("PRIVATE TOKEN");
			}),
		).rejects.toThrow("NETWORK_ERROR");
	});
	test("maps aborts to a safe timeout", async () => {
		await expect(
			requestJson(
				"https://example.invalid",
				{},
				10,
				async (_url, init) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener("abort", () =>
							reject(new Error("PRIVATE TOKEN")),
						);
					}),
			),
		).rejects.toThrow("REQUEST_TIMEOUT");
	});
});
