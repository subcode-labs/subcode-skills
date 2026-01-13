import { defineCommand } from "citty";
import { consola } from "consola";
import { sharedArgs } from "../shared";
import {
	getInstalledSkills,
	isSkillInstalled,
	updateSkill,
} from "../utils/installer";
import { confirm } from "../utils/prompts";
import { getSkill, resolveSkillName } from "../utils/registry";
import { execCommandSafe } from "../utils/spawn";

async function getRepoRoot(): Promise<string | null> {
	return execCommandSafe("git", ["rev-parse", "--show-toplevel"]);
}

export default defineCommand({
	meta: {
		name: "update",
		description: "Update installed skills",
	},
	args: {
		skill: {
			type: "positional",
			description: "Specific skill to update (updates all if omitted)",
			required: false,
		},
		...sharedArgs,
	},
	async run({ args }) {
		// Check if in git repo
		const repoRoot = await getRepoRoot();
		if (!repoRoot) {
			consola.error("Not inside a git repository.");
			process.exit(1);
		}

		const installedSkills = getInstalledSkills(repoRoot);
		if (installedSkills.length === 0) {
			consola.warn("No skills installed.");
			consola.info("Run 'subcode add <skill>' to install a skill.");
			return;
		}

		let skillsToUpdate: string[] = [];

		if (args.skill) {
			// Update specific skill
			const skillInput = args.skill as string;
			const skillName = resolveSkillName(skillInput) || skillInput;

			if (!isSkillInstalled(repoRoot, skillName)) {
				consola.error(`Skill not installed: ${skillName}`);
				process.exit(1);
			}

			skillsToUpdate = [skillName];
		} else {
			// Update all skills
			skillsToUpdate = installedSkills;
		}

		// Confirm update
		const skillList = skillsToUpdate.join(", ");
		const proceed = await confirm(
			`Update ${skillsToUpdate.length} skill(s): ${skillList}?`,
			true,
		);
		if (!proceed) {
			consola.info("Aborted.");
			return;
		}

		// Update each skill
		let updated = 0;
		for (const skillName of skillsToUpdate) {
			const skill = getSkill(skillName);
			if (!skill) {
				consola.warn(`Skill not found in registry: ${skillName}`);
				continue;
			}

			await updateSkill(repoRoot, skill);
			updated++;
		}

		consola.success(`Updated ${updated} skill(s).`);
	},
});
