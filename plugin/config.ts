import { z } from "zod";
import { timeout } from "./http";
export const configSchema = z.strictObject({ timeoutMs: timeout });
export type Config = z.infer<typeof configSchema>;
