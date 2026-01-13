import { defineCommand } from "citty";
import { consola } from "consola";
import { sharedArgs } from "../shared";
import {
	getInstalledSkills,
	isSkillInstalled,
	removeSkill,
} from "../utils/installer";
import { confirm } from "../utils/prompts";
import { resolveSkillName } from "../utils/registry";
import { execCommandSafe } from "../utils/spawn";

async function getRepoRoot(): Promise<string | null> {
	return execCommandSafe("git", ["rev-parse", "--show-toplevel"]);
}

export default defineCommand({
	meta: {
		name: "remove",
		description: "Remove an installed skill",
	},
	args: {
		skill: {
			type: "positional",
			description: "Skill name to remove",
			required: true,
		},
		...sharedArgs,
	},
	async run({ args }) {
		const skillInput = args.skill as string;

		// Check if in git repo
		const repoRoot = await getRepoRoot();
		if (!repoRoot) {
			consola.error("Not inside a git repository.");
			process.exit(1);
		}

		// Resolve skill name
		const skillName = resolveSkillName(skillInput) || skillInput;

		// Check if installed
		if (!isSkillInstalled(repoRoot, skillName)) {
			consola.error(`Skill not installed: ${skillName}`);

			const installed = getInstalledSkills(repoRoot);
			if (installed.length > 0) {
				consola.info("Installed skills:");
				for (const s of installed) {
					consola.info(`  - ${s}`);
				}
			}
			process.exit(1);
		}

		// Confirm removal
		const proceed = await confirm(`Remove skill '${skillName}'?`, false);
		if (!proceed) {
			consola.info("Aborted.");
			return;
		}

		// Remove the skill
		await removeSkill(repoRoot, skillName);
	},
});
