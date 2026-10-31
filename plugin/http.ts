import { z } from "zod";

export class PluginError extends Error {
	constructor(public readonly code: string) {
		super(code);
		this.name = "PluginError";
	}
}
export function parse<T>(
	schema: z.ZodType<T>,
	value: unknown,
	code = "INVALID_INPUT",
): T {
	const result = schema.safeParse(value);
	if (!result.success) throw new PluginError(code);
	return result.data;
}
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export const defaultFetch: Fetcher = (url, init) => fetch(url, init);
export async function requestJson(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	fetcher: Fetcher,
): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetcher(url, {
			...init,
			redirect: "error",
			signal: controller.signal,
		});
		if (response.status >= 300 && response.status < 400)
			throw new PluginError("REDIRECT_REJECTED");
		if (!response.ok) {
			await response.body?.cancel();
			const code =
				response.status === 401
					? "AUTHENTICATION_FAILED"
					: response.status === 403
						? "ACCESS_DENIED"
						: response.status === 404
							? "NOT_FOUND"
							: response.status === 429
								? "RATE_LIMITED"
								: "UPSTREAM_ERROR";
			throw new PluginError(code);
		}
		if (Number(response.headers.get("content-length")) > 2_000_000) {
			await response.body?.cancel();
			throw new PluginError("RESPONSE_TOO_LARGE");
		}
		const reader = response.body?.getReader();
		if (!reader) throw new PluginError("INVALID_RESPONSE");
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 2_000_000) {
				await reader.cancel();
				throw new PluginError("RESPONSE_TOO_LARGE");
			}
			chunks.push(value);
		}
		const body = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			body.set(chunk, offset);
			offset += chunk.byteLength;
		}
		let json: unknown;
		try {
			json = JSON.parse(new TextDecoder().decode(body));
		} catch {
			throw new PluginError("INVALID_RESPONSE");
		}
		return parse(z.record(z.string(), z.unknown()), json, "INVALID_RESPONSE");
	} catch (error) {
		if (error instanceof PluginError) throw error;
		throw new PluginError(
			controller.signal.aborted ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
		);
	} finally {
		clearTimeout(timer);
	}
}
export function record(value: unknown) {
	return parse(z.record(z.string(), z.unknown()), value, "INVALID_RESPONSE");
}
export function pick(value: unknown, fields: string[]) {
	const row = record(value);
	return Object.fromEntries(
		fields.filter((key) => key in row).map((key) => [key, row[key]]),
	);
}
export const token = z
	.string()
	.min(1)
	.max(4096)
	.regex(/^[!-~]+$/);
export const timeout = z.number().int().min(100).max(30_000).default(15_000);
export const pageSize = z.number().int().min(1).max(100).default(25);
export const cursor = z.string().min(1).max(2048).optional();
