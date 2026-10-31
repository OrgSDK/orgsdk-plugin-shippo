import { z } from "zod";
import type { Config } from "./config";
import { defaultFetch, type Fetcher, parse, requestJson, token } from "./http";
export async function get(
	config: Config,
	credentials: unknown,
	path: string,
	parameters: Record<string, string | number | undefined> = {},
	fetcher: Fetcher = defaultFetch,
) {
	const bundle = parse(
		z.object({ shippo: z.object({ secret_apiKey: token }) }),
		credentials,
		"MISSING_CREDENTIALS",
	);
	const url = new URL(`https://api.goshippo.com${path}`);
	for (const [key, value] of Object.entries(parameters))
		if (value !== undefined) url.searchParams.set(key, String(value));
	return requestJson(
		url.toString(),
		{
			method: "GET",
			headers: {
				Authorization: `ShippoToken ${bundle.shippo.secret_apiKey}`,
				"SHIPPO-API-VERSION": "2018-02-08",
				Accept: "application/json",
			},
		},
		config.timeoutMs,
		fetcher,
	);
}
