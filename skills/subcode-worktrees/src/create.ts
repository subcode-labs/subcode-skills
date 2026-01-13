#!/usr/bin/env bun
/**
 * Create a new git worktree
 *
 * Usage: bun run src/create.ts --name <name> [--branch <branch>] [--base <base-branch>]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

interface CreateResult {
	name: string;
	path: string;
	branch: string;
	baseBranch: string;
}

interface Result<T = unknown> {
	success: boolean;
	action: string;
	data?: T;
	message: string;
	error?: string;
	nextSteps?: string[];
}

interface SubcodeConfig {
	worktrees?: {
		defaultBaseBranch?: string;
		autoInstallDeps?: boolean;
		copyEnvFiles?: boolean;
		packageManager?: string;
	};
}

function outputJson<T>(result: Result<T>): void {
	console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args: string[]): {
	options: Record<string, string>;
	flags: Record<string, boolean>;
} {
	const options: Record<string, string> = {};
	const flags: Record<string, boolean> = {};

	let i = 0;
	while (i < args.length) {
		const arg = args[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
				options[key] = args[i + 1];
				i += 2;
			} else {
				flags[key] = true;
				i++;
			}
		} else {
			i++;
		}
	}

	return { options, flags };
}

async function getRepoRoot(): Promise<string | null> {
	try {
		const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const text = await new Response(proc.stdout).text();
		return text.trim();
	} catch {
		return null;
	}
}

async function branchExists(branch: string): Promise<boolean> {
	try {
		const proc = Bun.spawn(
			["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		await proc.exited;
		return proc.exitCode === 0;
	} catch {
		return false;
	}
}

function readConfig(repoRoot: string): SubcodeConfig | null {
	const configPath = join(repoRoot, ".subcode", "config.json");
	if (!existsSync(configPath)) return null;

	try {
		return JSON.parse(readFileSync(configPath, "utf-8"));
	} catch {
		return null;
	}
}

function detectPackageManager(dir: string): string {
	if (existsSync(join(dir, "bun.lockb"))) return "bun";
	if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(dir, "yarn.lock"))) return "yarn";
	if (existsSync(join(dir, "package-lock.json"))) return "npm";
	return "bun";
}

async function runInit(repoRoot: string): Promise<void> {
	// Run init script to ensure .subcode exists
	const initScript = join(dirname(import.meta.path), "init.ts");
	const proc = Bun.spawn(["bun", "run", initScript], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	await proc.exited;
}

function copyEnvFiles(repoRoot: string, worktreePath: string): string[] {
	const copied: string[] = [];
	const envFiles = [".env.local", ".env.development.local"];

	// Root env files
	for (const file of envFiles) {
		const src = join(repoRoot, file);
		const dest = join(worktreePath, file);
		if (existsSync(src)) {
			copyFileSync(src, dest);
			copied.push(file);
		}
	}

	// App-specific env files (common patterns)
	const appDirs = ["apps/web", "apps/api", "apps/command", "apps/admin"];
	for (const appDir of appDirs) {
		for (const file of envFiles) {
			const src = join(repoRoot, appDir, file);
			const destDir = join(worktreePath, appDir);
			const dest = join(destDir, file);
			if (existsSync(src)) {
				mkdirSync(destDir, { recursive: true });
				copyFileSync(src, dest);
				copied.push(`${appDir}/${file}`);
			}
		}
	}

	return copied;
}

async function main() {
	const { options, flags } = parseArgs(process.argv.slice(2));

	// Validate required args
	if (!options.name) {
		outputJson({
			success: false,
			action: "create_worktree",
			error: "MISSING_NAME",
			message: "Missing required argument: --name <name>",
		});
		process.exit(1);
	}

	const name = options.name;
	const branch = options.branch || name;

	// Get repo root
	const repoRoot = await getRepoRoot();
	if (!repoRoot) {
		outputJson({
			success: false,
			action: "create_worktree",
			error: "NOT_GIT_REPO",
			message: "Not inside a git repository",
		});
		process.exit(1);
	}

	// Ensure .subcode is initialized
	await runInit(repoRoot);

	// Read config
	const config = readConfig(repoRoot);
	const baseBranch =
		options.base || config?.worktrees?.defaultBaseBranch || "main";
	const autoInstallDeps = config?.worktrees?.autoInstallDeps ?? true;
	const copyEnvFilesEnabled = config?.worktrees?.copyEnvFiles ?? true;
	const configPm = config?.worktrees?.packageManager || "auto";

	// Check if worktree directory already exists
	const worktreePath = join(repoRoot, ".subcode", "worktrees", name);
	if (existsSync(worktreePath)) {
		outputJson({
			success: false,
			action: "create_worktree",
			error: "WORKTREE_EXISTS",
			message: `Worktree '${name}' already exists at .subcode/worktrees/${name}`,
		});
		process.exit(1);
	}

	// Check if branch already exists (we'll create a new one if not)
	const branchExistsAlready = await branchExists(branch);

	// Create the worktree
	console.error(`Creating worktree '${name}' with branch '${branch}'...`);

	let gitArgs: string[];
	if (branchExistsAlready) {
		// Checkout existing branch
		gitArgs = ["worktree", "add", worktreePath, branch];
	} else {
		// Create new branch from base
		gitArgs = ["worktree", "add", "-b", branch, worktreePath, baseBranch];
	}

	const gitProc = Bun.spawn(["git", ...gitArgs], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});

	const stderr = await new Response(gitProc.stderr).text();
	await gitProc.exited;

	if (gitProc.exitCode !== 0) {
		outputJson({
			success: false,
			action: "create_worktree",
			error: "GIT_ERROR",
			message: `Failed to create worktree: ${stderr.trim()}`,
		});
		process.exit(1);
	}

	const nextSteps: string[] = [`cd .subcode/worktrees/${name}`];

	// Install dependencies if enabled
	if (autoInstallDeps && existsSync(join(worktreePath, "package.json"))) {
		const pm = configPm === "auto" ? detectPackageManager(repoRoot) : configPm;
		console.error(`Installing dependencies with ${pm}...`);

		const installProc = Bun.spawn([pm, "install"], {
			cwd: worktreePath,
			stdout: "pipe",
			stderr: "pipe",
		});
		await installProc.exited;

		if (installProc.exitCode !== 0) {
			console.error(
				`Warning: ${pm} install failed, you may need to run it manually`,
			);
			nextSteps.push(`${pm} install`);
		}
	}

	// Copy env files if enabled
	if (copyEnvFilesEnabled) {
		const copied = copyEnvFiles(repoRoot, worktreePath);
		if (copied.length > 0) {
			console.error(`Copied env files: ${copied.join(", ")}`);
		}
	}

	nextSteps.push("Start working on your feature!");

	outputJson<CreateResult>({
		success: true,
		action: "create_worktree",
		data: {
			name,
			path: `.subcode/worktrees/${name}`,
			branch,
			baseBranch: branchExistsAlready ? "(existing branch)" : baseBranch,
		},
		message: `Worktree '${name}' created successfully`,
		nextSteps,
	});
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "create_worktree",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
