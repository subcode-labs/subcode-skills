/**
 * Cross-platform process spawning
 *
 * Works with both Node.js and Bun runtimes.
 */

import { type SpawnOptions, spawn } from "node:child_process";

export interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export function spawnAsync(
	command: string,
	args: string[],
	options?: SpawnOptions,
): Promise<SpawnResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			...options,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("error", reject);

		proc.on("close", (code) => {
			resolve({
				stdout,
				stderr,
				exitCode: code ?? 0,
			});
		});
	});
}

export async function execCommand(
	command: string,
	args: string[],
	cwd?: string,
): Promise<string> {
	const result = await spawnAsync(command, args, { cwd });
	if (result.exitCode !== 0) {
		throw new Error(
			result.stderr || `Command failed with exit code ${result.exitCode}`,
		);
	}
	return result.stdout.trim();
}

export async function execCommandSafe(
	command: string,
	args: string[],
	cwd?: string,
): Promise<string | null> {
	try {
		return await execCommand(command, args, cwd);
	} catch {
		return null;
	}
}

export function spawnInherit(
	command: string,
	args: string[],
	cwd?: string,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd,
			stdio: "inherit",
		});

		proc.on("error", reject);
		proc.on("close", (code) => resolve(code ?? 0));
	});
}
