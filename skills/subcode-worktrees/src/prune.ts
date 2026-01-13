#!/usr/bin/env bun
/**
 * Prune stale git worktree references
 *
 * Usage: bun run src/prune.ts [--dry-run]
 */

interface PruneResult {
	pruned: number;
	dryRun: boolean;
}

interface Result<T = unknown> {
	success: boolean;
	action: string;
	data?: T;
	message: string;
	error?: string;
}

function outputJson<T>(result: Result<T>): void {
	console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args: string[]): { flags: Record<string, boolean> } {
	const flags: Record<string, boolean> = {};

	for (const arg of args) {
		if (arg.startsWith("--")) {
			flags[arg.slice(2)] = true;
		}
	}

	return { flags };
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

async function main() {
	const { flags } = parseArgs(process.argv.slice(2));
	const dryRun = flags["dry-run"] || false;

	// Get repo root
	const repoRoot = await getRepoRoot();
	if (!repoRoot) {
		outputJson({
			success: false,
			action: "prune_worktrees",
			error: "NOT_GIT_REPO",
			message: "Not inside a git repository",
		});
		process.exit(1);
	}

	// First, check what would be pruned
	const checkProc = Bun.spawn(["git", "worktree", "prune", "--dry-run", "-v"], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});

	const checkOutput = await new Response(checkProc.stdout).text();
	await checkProc.exited;

	// Count prunable entries
	const lines = checkOutput
		.trim()
		.split("\n")
		.filter((l) => l.length > 0);
	const prunableCount = lines.length;

	if (dryRun) {
		outputJson<PruneResult>({
			success: true,
			action: "prune_worktrees",
			data: {
				pruned: prunableCount,
				dryRun: true,
			},
			message:
				prunableCount > 0
					? `Would prune ${prunableCount} stale worktree reference(s)`
					: "No stale worktree references to prune",
		});
		return;
	}

	// Actually prune
	const pruneProc = Bun.spawn(["git", "worktree", "prune", "-v"], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});

	const pruneOutput = await new Response(pruneProc.stdout).text();
	const pruneStderr = await new Response(pruneProc.stderr).text();
	await pruneProc.exited;

	if (pruneProc.exitCode !== 0) {
		outputJson({
			success: false,
			action: "prune_worktrees",
			error: "GIT_ERROR",
			message: `Failed to prune worktrees: ${pruneStderr.trim()}`,
		});
		process.exit(1);
	}

	// Count actually pruned
	const prunedLines = pruneOutput
		.trim()
		.split("\n")
		.filter((l) => l.length > 0);
	const prunedCount = prunedLines.length;

	outputJson<PruneResult>({
		success: true,
		action: "prune_worktrees",
		data: {
			pruned: prunedCount,
			dryRun: false,
		},
		message:
			prunedCount > 0
				? `Pruned ${prunedCount} stale worktree reference(s)`
				: "No stale worktree references to prune",
	});
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "prune_worktrees",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
