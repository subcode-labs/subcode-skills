import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { sharedArgs } from "../shared";
import { installSkill, isSkillInstalled } from "../utils/installer";
import { confirm } from "../utils/prompts";
import {
	getAvailableSkills,
	getSkill,
	resolveSkillName,
} from "../utils/registry";
import { execCommandSafe } from "../utils/spawn";

async function getRepoRoot(): Promise<string | null> {
	return execCommandSafe("git", ["rev-parse", "--show-toplevel"]);
}

export default defineCommand({
	meta: {
		name: "add",
		description: "Install a skill",
	},
	args: {
		skill: {
			type: "positional",
			description: "Skill name to install (e.g., worktrees)",
			required: true,
		},
		...sharedArgs,
	},
	async run({ args }) {
		const skillInput = args.skill as string;

		// Resolve skill name (supports shorthand like "worktrees" -> "subcode-worktrees")
		const skillName = resolveSkillName(skillInput);
		if (!skillName) {
			consola.error(`Unknown skill: ${skillInput}`);
			consola.info("Available skills:");
			for (const skill of getAvailableSkills()) {
				consola.info(`  - ${skill.name}: ${skill.description}`);
			}
			process.exit(1);
		}

		const skill = getSkill(skillName);
		if (!skill) {
			consola.error(`Skill not found: ${skillName}`);
			process.exit(1);
		}

		// Check if in git repo
		const repoRoot = await getRepoRoot();
		if (!repoRoot) {
			consola.error("Not inside a git repository.");
			process.exit(1);
		}

		// Check if subcode is initialized
		const configPath = join(repoRoot, ".subcode", "config.json");
		if (!existsSync(configPath)) {
			consola.warn("Subcode is not initialized. Run 'subcode init' first.");
			const init = await confirm("Initialize now?", true);
			if (!init) {
				process.exit(1);
			}
			// Run init command logic would go here, but for simplicity we'll just tell them to run it
			consola.info("Please run 'subcode init' first.");
			process.exit(1);
		}

		// Check if already installed
		if (isSkillInstalled(repoRoot, skillName)) {
			consola.warn(`Skill already installed: ${skillName}`);
			const reinstall = await confirm("Reinstall?", false);
			if (!reinstall) {
				consola.info("Aborted.");
				return;
			}
		}

		// Install the skill
		await installSkill(repoRoot, skill);

		consola.box({
			title: `Skill installed: ${skill.name}`,
			message: `Usage with Claude:
  "Create a new worktree for the auth feature"
  "List my current worktrees"
  "Remove the feature-auth worktree"

Manual commands:
  bun run .claude/skills/${skill.name}/src/create.ts --name <name>
  bun run .claude/skills/${skill.name}/src/list.ts`,
		});
	},
});
