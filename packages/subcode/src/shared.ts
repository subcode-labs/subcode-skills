import type { ArgsDef } from "citty";

export const sharedArgs = {
	yes: {
		type: "boolean",
		alias: "y",
		description: "Skip confirmation prompts (headless mode)",
		default: false,
	},
	verbose: {
		type: "boolean",
		alias: "v",
		description: "Show detailed output",
		default: false,
	},
} as const satisfies ArgsDef;
