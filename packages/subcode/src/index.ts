#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { commands } from "./commands";

const main = defineCommand({
	meta: {
		name: "subcode",
		version: "0.1.0",
		description: "CLI for managing subcode skills",
	},
	subCommands: commands,
});

runMain(main);
