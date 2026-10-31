import type { PluginContext, PluginFactory } from "@orgsdk/plugins";
import { configSchema } from "./config";
import { createFunctions } from "./functions";

const createPlugin: PluginFactory = (context: PluginContext) => ({
	safeFunctions: createFunctions(context.stores.config),
	config: {
		title: "Shippo connection",
		description:
			"Configure the account; attach secrets through OrgSDK credentials.",
		schema: configSchema,
	},
});
export default createPlugin;
