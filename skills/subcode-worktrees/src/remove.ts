#!/usr/bin/env bun
/**
 * Remove a git worktree
 *
 * Usage: bun run src/remove.ts --name <name> [--delete-branch] [--force]
 */

import { existsSync } from "node:fs";
import { join, basename } from "node:path";

interface RemoveResult {
  name: string;
  path: string;
  branch?: string;
  branchDeleted: boolean;
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

function parseArgs(args: string[]): { options: Record<string, string>; flags: Record<string, boolean> } {
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

async function getWorktreeBranch(worktreePath: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();

    let currentPath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of text.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (currentPath === worktreePath && currentBranch) {
          return currentBranch;
        }
        currentPath = line.replace("worktree ", "");
        currentBranch = null;
      } else if (line.startsWith("branch ")) {
        currentBranch = line.replace("branch refs/heads/", "");
      }
    }

    if (currentPath === worktreePath && currentBranch) {
      return currentBranch;
    }

    return null;
  } catch {
    return null;
  }
}

async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    return text.trim().length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const { options, flags } = parseArgs(process.argv.slice(2));

  // Validate required args
  if (!options.name) {
    outputJson({
      success: false,
      action: "remove_worktree",
      error: "MISSING_NAME",
      message: "Missing required argument: --name <name>",
    });
    process.exit(1);
  }

  const name = options.name;
  const deleteBranch = flags["delete-branch"] || false;
  const force = flags.force || false;

  // Get repo root
  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    outputJson({
      success: false,
      action: "remove_worktree",
      error: "NOT_GIT_REPO",
      message: "Not inside a git repository",
    });
    process.exit(1);
  }

  // Check if worktree exists
  const worktreePath = join(repoRoot, ".subcode", "worktrees", name);
  if (!existsSync(worktreePath)) {
    outputJson({
      success: false,
      action: "remove_worktree",
      error: "WORKTREE_NOT_FOUND",
      message: `Worktree '${name}' not found at .subcode/worktrees/${name}`,
    });
    process.exit(1);
  }

  // Get branch name before removing
  const branch = await getWorktreeBranch(worktreePath);

  // Check for uncommitted changes
  if (!force) {
    const isDirty = await isWorktreeDirty(worktreePath);
    if (isDirty) {
      outputJson({
        success: false,
        action: "remove_worktree",
        error: "HAS_UNCOMMITTED_CHANGES",
        message: `Worktree '${name}' has uncommitted changes. Use --force to remove anyway.`,
      });
      process.exit(1);
    }
  }

  // Remove the worktree
  console.error(`Removing worktree '${name}'...`);

  const removeArgs = force ? ["worktree", "remove", "--force", worktreePath] : ["worktree", "remove", worktreePath];

  const removeProc = Bun.spawn(["git", ...removeArgs], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(removeProc.stderr).text();
  await removeProc.exited;

  if (removeProc.exitCode !== 0) {
    outputJson({
      success: false,
      action: "remove_worktree",
      error: "GIT_ERROR",
      message: `Failed to remove worktree: ${stderr.trim()}`,
    });
    process.exit(1);
  }

  // Delete branch if requested
  let branchDeleted = false;
  if (deleteBranch && branch) {
    console.error(`Deleting branch '${branch}'...`);

    const deleteProc = Bun.spawn(["git", "branch", "-D", branch], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    await deleteProc.exited;
    branchDeleted = deleteProc.exitCode === 0;

    if (!branchDeleted) {
      console.error(`Warning: Could not delete branch '${branch}'`);
    }
  }

  // Run prune to clean up any stale references
  await Bun.spawn(["git", "worktree", "prune"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  }).exited;

  outputJson<RemoveResult>({
    success: true,
    action: "remove_worktree",
    data: {
      name,
      path: `.subcode/worktrees/${name}`,
      branch: branch || undefined,
      branchDeleted,
    },
    message: `Worktree '${name}' removed successfully${branchDeleted ? ` (branch '${branch}' deleted)` : ""}`,
  });
}

main().catch((err) => {
  outputJson({
    success: false,
    action: "remove_worktree",
    error: "UNKNOWN_ERROR",
    message: err.message || "An unknown error occurred",
  });
  process.exit(1);
});
