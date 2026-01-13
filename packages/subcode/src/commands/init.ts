import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { sharedArgs } from "../shared";
import { installSkill } from "../utils/installer";
import { confirm, multiselect } from "../utils/prompts";
import { getAvailableSkills } from "../utils/registry";
import { execCommandSafe, spawnAsync } from "../utils/spawn";

async function getRepoRoot(): Promise<string | null> {
	return execCommandSafe("git", ["rev-parse", "--show-toplevel"]);
}

async function getDefaultBranch(): Promise<string> {
	// Try to get from remote HEAD
	const remoteHead = await execCommandSafe("git", [
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
	]);
	if (remoteHead) {
		const branch = remoteHead.replace("refs/remotes/origin/", "");
		if (branch) return branch;
	}

	// Check if main exists
	const result = await spawnAsync("git", [
		"show-ref",
		"--verify",
		"--quiet",
		"refs/heads/main",
	]);
	if (result.exitCode === 0) return "main";

	return "main";
}

function createConfig(defaultBranch: string) {
	return {
		$schema:
			"https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/schemas/config.schema.json",
		version: "1.0.0",
		initialized: new Date().toISOString(),
		worktrees: {
			defaultBaseBranch: defaultBranch,
			autoInstallDeps: true,
			copyEnvFiles: true,
			packageManager: "auto",
		},
	};
}

const GITIGNORE_CONTENT = `# Subcode managed files
worktrees/
*.log
.cache/
`;

export default defineCommand({
	meta: {
		name: "init",
		description: "Initialize subcode in current repository",
	},
	args: {
		...sharedArgs,
	},
	async run({ args }) {
		// Check if in git repo
		const repoRoot = await getRepoRoot();
		if (!repoRoot) {
			consola.error(
				"Not inside a git repository. Please run from your project root.",
			);
			process.exit(1);
		}

		consola.success(`Git repository detected: ${repoRoot}`);

		const subcodeDir = join(repoRoot, ".subcode");
		const configPath = join(subcodeDir, "config.json");
		const gitignorePath = join(subcodeDir, ".gitignore");
		const worktreesDir = join(subcodeDir, "worktrees");

		// Check if already initialized
		if (existsSync(configPath)) {
			consola.warn("Subcode is already initialized in this repository.");
			const reinit = await confirm("Reinitialize?", false);
			if (!reinit) {
				consola.info("Aborted.");
				return;
			}
		}

		consola.info("Setting up .subcode directory...");

		// Create directories
		mkdirSync(worktreesDir, { recursive: true });

		// Create .gitignore
		writeFileSync(gitignorePath, GITIGNORE_CONTENT);

		// Create config.json
		const defaultBranch = await getDefaultBranch();
		const config = createConfig(defaultBranch);
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

		consola.success("Created .subcode directory");

		// Ask about installing skills
		const skills = getAvailableSkills();

		if (skills.length > 0) {
			const installSkills = await confirm("Install skills now?", true);

			if (installSkills) {
				const selectedSkills = await multiselect<string>(
					"Select skills to install:",
					skills.map((s) => ({
						label: `${s.name} - ${s.description}`,
						value: s.name,
						selected: true,
					})),
				);

				for (const skillName of selectedSkills) {
					const skill = skills.find((s) => s.name === skillName);
					if (skill) {
						await installSkill(repoRoot, skill);
					}
				}
			}
		}

		// Show success message
		consola.box({
			title: "Subcode initialized!",
			message: `Directory structure:
  .subcode/           - Configuration & data
  .claude/skills/     - Installed Claude skills

Next steps:
  subcode add <skill> - Install a skill
  subcode list        - List available skills
  subcode doctor      - Check setup`,
		});
	},
});
