/**
 * Subcode TypeScript Utilities
 *
 * Shared utilities for all subcode skills
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { $ } from "bun";

// =============================================================================
// Types
// =============================================================================

export interface SubcodeConfig {
	$schema?: string;
	version: string;
	initialized: string;
	worktrees?: WorktreesConfig;
	[key: string]: unknown;
}

export interface WorktreesConfig {
	defaultBaseBranch: string;
	autoInstallDeps: boolean;
	copyEnvFiles: boolean;
	packageManager: "auto" | "bun" | "npm" | "yarn" | "pnpm";
}

export interface Result<T = unknown> {
	success: boolean;
	action: string;
	data?: T;
	message: string;
	error?: string;
	nextSteps?: string[];
}

// =============================================================================
// Console Output
// =============================================================================

const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
};

export const log = {
	info: (msg: string) =>
		console.error(`${colors.blue}[info]${colors.reset} ${msg}`),
	success: (msg: string) =>
		console.error(`${colors.green}[ok]${colors.reset} ${msg}`),
	warn: (msg: string) =>
		console.error(`${colors.yellow}[warn]${colors.reset} ${msg}`),
	error: (msg: string) =>
		console.error(`${colors.red}[error]${colors.reset} ${msg}`),
	dim: (msg: string) => console.error(`${colors.dim}${msg}${colors.reset}`),
};

// =============================================================================
// JSON Output
// =============================================================================

export function outputJson<T>(result: Result<T>): void {
	console.log(JSON.stringify(result, null, 2));
}

export function successResult<T>(
	action: string,
	data: T,
	message: string,
	nextSteps?: string[],
): Result<T> {
	return { success: true, action, data, message, nextSteps };
}

export function errorResult(
	action: string,
	error: string,
	message: string,
): Result {
	return { success: false, action, error, message };
}

// =============================================================================
// Path Utilities
// =============================================================================

export async function getRepoRoot(): Promise<string | null> {
	try {
		const result = await $`git rev-parse --show-toplevel`.text();
		return result.trim();
	} catch {
		return null;
	}
}

export function getSubcodeDir(repoRoot: string): string {
	return join(repoRoot, ".subcode");
}

export function getWorktreesDir(repoRoot: string): string {
	return join(repoRoot, ".subcode", "worktrees");
}

export function getConfigPath(repoRoot: string): string {
	return join(repoRoot, ".subcode", "config.json");
}

// =============================================================================
// Config Management
// =============================================================================

export function readConfig(repoRoot: string): SubcodeConfig | null {
	const configPath = getConfigPath(repoRoot);

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		return JSON.parse(content) as SubcodeConfig;
	} catch {
		return null;
	}
}

export function writeConfig(repoRoot: string, config: SubcodeConfig): void {
	const configPath = getConfigPath(repoRoot);
	const dir = dirname(configPath);

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function getDefaultConfig(defaultBranch = "main"): SubcodeConfig {
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

// =============================================================================
// Git Utilities
// =============================================================================

export async function isGitRepo(): Promise<boolean> {
	try {
		await $`git rev-parse --is-inside-work-tree`.quiet();
		return true;
	} catch {
		return false;
	}
}

export async function getCurrentBranch(): Promise<string | null> {
	try {
		const result = await $`git symbolic-ref --short HEAD`.text();
		return result.trim();
	} catch {
		return null;
	}
}

export async function getDefaultBranch(): Promise<string> {
	try {
		// Try to get from remote HEAD
		const result = await $`git symbolic-ref refs/remotes/origin/HEAD`.text();
		const branch = result.trim().replace("refs/remotes/origin/", "");
		if (branch) return branch;
	} catch {
		// Ignore
	}

	// Check if main exists
	try {
		await $`git show-ref --verify --quiet refs/heads/main`.quiet();
		return "main";
	} catch {
		// Ignore
	}

	// Check if master exists
	try {
		await $`git show-ref --verify --quiet refs/heads/master`.quiet();
		return "master";
	} catch {
		// Ignore
	}

	return "main";
}

export async function listWorktrees(): Promise<
	Array<{ path: string; branch: string; bare: boolean }>
> {
	try {
		const result = await $`git worktree list --porcelain`.text();
		const worktrees: Array<{ path: string; branch: string; bare: boolean }> =
			[];

		let current: { path?: string; branch?: string; bare: boolean } = {
			bare: false,
		};

		for (const line of result.split("\n")) {
			if (line.startsWith("worktree ")) {
				if (current.path) {
					worktrees.push({
						path: current.path,
						branch: current.branch || "(detached)",
						bare: current.bare,
					});
				}
				current = { path: line.replace("worktree ", ""), bare: false };
			} else if (line.startsWith("branch ")) {
				current.branch = line.replace("branch refs/heads/", "");
			} else if (line === "bare") {
				current.bare = true;
			}
		}

		if (current.path) {
			worktrees.push({
				path: current.path,
				branch: current.branch || "(detached)",
				bare: current.bare,
			});
		}

		return worktrees;
	} catch {
		return [];
	}
}

// =============================================================================
// Package Manager Detection
// =============================================================================

export type PackageManager = "bun" | "npm" | "yarn" | "pnpm";

export function detectPackageManager(dir: string): PackageManager {
	if (existsSync(join(dir, "bun.lockb"))) return "bun";
	if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(dir, "yarn.lock"))) return "yarn";
	if (existsSync(join(dir, "package-lock.json"))) return "npm";
	return "bun"; // Default
}

export async function runPackageManagerInstall(
	dir: string,
	pm?: PackageManager,
): Promise<void> {
	const packageManager = pm || detectPackageManager(dir);

	log.info(`Running ${packageManager} install in ${dir}...`);

	const cwd = resolve(dir);

	switch (packageManager) {
		case "bun":
			await $`bun install`.cwd(cwd);
			break;
		case "pnpm":
			await $`pnpm install`.cwd(cwd);
			break;
		case "yarn":
			await $`yarn install`.cwd(cwd);
			break;
		case "npm":
			await $`npm install`.cwd(cwd);
			break;
	}
}

// =============================================================================
// File Utilities
// =============================================================================

export function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

export function fileExists(path: string): boolean {
	return existsSync(path);
}

// =============================================================================
// Argument Parsing
// =============================================================================

export interface ParsedArgs {
	flags: Record<string, boolean>;
	options: Record<string, string>;
	positional: string[];
}

export function parseArgs(args: string[]): ParsedArgs {
	const result: ParsedArgs = {
		flags: {},
		options: {},
		positional: [],
	};

	let i = 0;
	while (i < args.length) {
		const arg = args[i];

		if (arg.startsWith("--")) {
			const key = arg.slice(2);

			// Check if next arg is a value (doesn't start with -)
			if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
				result.options[key] = args[i + 1];
				i += 2;
			} else {
				result.flags[key] = true;
				i++;
			}
		} else if (arg.startsWith("-") && arg.length === 2) {
			const key = arg.slice(1);
			result.flags[key] = true;
			i++;
		} else {
			result.positional.push(arg);
			i++;
		}
	}

	return result;
}
