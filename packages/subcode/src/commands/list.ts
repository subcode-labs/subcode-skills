import { defineCommand } from "citty";
import { consola } from "consola";
import { getInstalledSkills } from "../utils/installer";
import { getAvailableSkills } from "../utils/registry";
import { execCommandSafe } from "../utils/spawn";

async function getRepoRoot(): Promise<string | null> {
	return execCommandSafe("git", ["rev-parse", "--show-toplevel"]);
}

export default defineCommand({
	meta: {
		name: "list",
		description: "List installed and available skills",
	},
	args: {
		available: {
			type: "boolean",
			alias: "a",
			description: "Show available skills from registry",
			default: false,
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
			default: false,
		},
	},
	async run({ args }) {
		const repoRoot = await getRepoRoot();
		const installedSkills = repoRoot ? getInstalledSkills(repoRoot) : [];
		const availableSkills = getAvailableSkills();

		if (args.json) {
			console.log(
				JSON.stringify(
					{
						installed: installedSkills,
						available: availableSkills.map((s) => ({
							name: s.name,
							description: s.description,
							version: s.version,
							installed: installedSkills.includes(s.name),
						})),
					},
					null,
					2,
				),
			);
			return;
		}

		// Show installed skills
		consola.info("Installed skills:");
		if (installedSkills.length === 0) {
			consola.info("  (none)");
		} else {
			for (const skill of installedSkills) {
				const def = availableSkills.find((s) => s.name === skill);
				if (def) {
					consola.info(`  - ${skill}: ${def.description}`);
				} else {
					consola.info(`  - ${skill}`);
				}
			}
		}

		// Show available skills if requested or if nothing is installed
		if (args.available || installedSkills.length === 0) {
			console.log("");
			consola.info("Available skills:");
			for (const skill of availableSkills) {
				const installed = installedSkills.includes(skill.name);
				const status = installed ? " (installed)" : "";
				consola.info(`  - ${skill.name}: ${skill.description}${status}`);
			}
		}

		if (!args.available && installedSkills.length > 0) {
			console.log("");
			consola.info("Use --available to see all available skills.");
		}
	},
});
