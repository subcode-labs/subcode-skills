import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { getInstalledSkills } from "../utils/installer";
import { execCommandSafe } from "../utils/spawn";

interface CheckResult {
	name: string;
	status: "ok" | "warn" | "error";
	message: string;
	fix?: string;
}

async function getRepoRoot(): Promise<string | null> {
	return execCommandSafe("git", ["rev-parse", "--show-toplevel"]);
}

async function checkGit(): Promise<CheckResult> {
	const repoRoot = await getRepoRoot();
	if (!repoRoot) {
		return {
			name: "Git repository",
			status: "error",
			message: "Not inside a git repository",
			fix: "Run from a git repository root",
		};
	}
	return {
		name: "Git repository",
		status: "ok",
		message: repoRoot,
	};
}

async function checkBun(): Promise<CheckResult> {
	const version = await execCommandSafe("bun", ["--version"]);
	if (version) {
		return {
			name: "Bun runtime",
			status: "ok",
			message: `v${version}`,
		};
	}
	return {
		name: "Bun runtime",
		status: "error",
		message: "Bun not found",
		fix: "Install Bun: curl -fsSL https://bun.sh/install | bash",
	};
}

async function checkSubcodeDir(repoRoot: string): Promise<CheckResult> {
	const subcodeDir = join(repoRoot, ".subcode");
	if (!existsSync(subcodeDir)) {
		return {
			name: ".subcode directory",
			status: "error",
			message: "Not found",
			fix: "Run 'subcode init' to initialize",
		};
	}
	return {
		name: ".subcode directory",
		status: "ok",
		message: "Found",
	};
}

async function checkConfig(repoRoot: string): Promise<CheckResult> {
	const configPath = join(repoRoot, ".subcode", "config.json");
	if (!existsSync(configPath)) {
		return {
			name: "Configuration",
			status: "error",
			message: "config.json not found",
			fix: "Run 'subcode init' to create configuration",
		};
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const config = JSON.parse(content);
		if (!config.version) {
			return {
				name: "Configuration",
				status: "warn",
				message: "Missing version field",
				fix: "Run 'subcode init' to recreate configuration",
			};
		}
		return {
			name: "Configuration",
			status: "ok",
			message: `v${config.version}`,
		};
	} catch (e) {
		return {
			name: "Configuration",
			status: "error",
			message: "Invalid JSON in config.json",
			fix: "Run 'subcode init' to recreate configuration",
		};
	}
}

async function checkSkills(repoRoot: string): Promise<CheckResult> {
	const installed = getInstalledSkills(repoRoot);
	if (installed.length === 0) {
		return {
			name: "Installed skills",
			status: "warn",
			message: "No skills installed",
			fix: "Run 'subcode add <skill>' to install a skill",
		};
	}

	// Check each skill has node_modules
	const missingDeps: string[] = [];
	for (const skill of installed) {
		const nodeModulesPath = join(
			repoRoot,
			".claude/skills",
			skill,
			"node_modules",
		);
		if (!existsSync(nodeModulesPath)) {
			missingDeps.push(skill);
		}
	}

	if (missingDeps.length > 0) {
		return {
			name: "Installed skills",
			status: "warn",
			message: `${installed.length} installed, ${missingDeps.length} missing dependencies`,
			fix: `Run 'subcode update ${missingDeps[0]}' to reinstall dependencies`,
		};
	}

	return {
		name: "Installed skills",
		status: "ok",
		message: `${installed.length} installed: ${installed.join(", ")}`,
	};
}

export default defineCommand({
	meta: {
		name: "doctor",
		description: "Diagnose issues with subcode installation",
	},
	args: {
		json: {
			type: "boolean",
			description: "Output as JSON",
			default: false,
		},
	},
	async run({ args }) {
		const results: CheckResult[] = [];

		// Check git
		const gitResult = await checkGit();
		results.push(gitResult);

		const repoRoot = await getRepoRoot();

		// Check bun
		results.push(await checkBun());

		// Only check subcode-specific things if we're in a git repo
		if (repoRoot) {
			results.push(await checkSubcodeDir(repoRoot));
			results.push(await checkConfig(repoRoot));
			results.push(await checkSkills(repoRoot));
		}

		if (args.json) {
			console.log(JSON.stringify(results, null, 2));
			return;
		}

		// Display results
		console.log("");
		consola.info("Subcode Doctor");
		console.log("");

		const statusIcon = {
			ok: "\x1b[32m✓\x1b[0m",
			warn: "\x1b[33m!\x1b[0m",
			error: "\x1b[31m✗\x1b[0m",
		};

		for (const result of results) {
			console.log(
				`  ${statusIcon[result.status]} ${result.name}: ${result.message}`,
			);
			if (result.fix && result.status !== "ok") {
				console.log(`    \x1b[2m→ ${result.fix}\x1b[0m`);
			}
		}

		console.log("");

		const hasErrors = results.some((r) => r.status === "error");
		const hasWarnings = results.some((r) => r.status === "warn");

		if (hasErrors) {
			consola.error("Some checks failed. Please fix the issues above.");
			process.exit(1);
		} else if (hasWarnings) {
			consola.warn("Some checks have warnings.");
		} else {
			consola.success("All checks passed!");
		}
	},
});
