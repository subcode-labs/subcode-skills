#!/usr/bin/env bun
/**
 * List all git worktrees
 *
 * Usage: bun run src/list.ts [--json]
 */

import { existsSync, statSync } from "node:fs";
import { join, basename, relative } from "node:path";

interface WorktreeInfo {
  name: string;
  branch: string;
  path: string;
  absolutePath: string;
  isSubcode: boolean;
  isDirty: boolean;
  isMain: boolean;
}

interface ListResult {
  worktrees: WorktreeInfo[];
  count: number;
  subcodeCount: number;
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

async function getWorktrees(): Promise<Array<{ path: string; branch: string }>> {
  try {
    const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();

    const worktrees: Array<{ path: string; branch: string }> = [];
    let current: { path?: string; branch?: string } = {};

    for (const line of text.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          worktrees.push({
            path: current.path,
            branch: current.branch || "(detached)",
          });
        }
        current = { path: line.replace("worktree ", "") };
      } else if (line.startsWith("branch ")) {
        current.branch = line.replace("branch refs/heads/", "");
      }
    }

    if (current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch || "(detached)",
      });
    }

    return worktrees;
  } catch {
    return [];
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

function formatTable(worktrees: WorktreeInfo[]): string {
  // Calculate column widths
  const nameWidth = Math.max(4, ...worktrees.map((w) => w.name.length));
  const branchWidth = Math.max(6, ...worktrees.map((w) => w.branch.length));
  const pathWidth = Math.max(4, ...worktrees.map((w) => w.path.length));

  const lines: string[] = [];

  // Header
  lines.push(
    `${"NAME".padEnd(nameWidth)}  ${"BRANCH".padEnd(branchWidth)}  ${"PATH".padEnd(pathWidth)}  STATUS`
  );
  lines.push(
    `${"-".repeat(nameWidth)}  ${"-".repeat(branchWidth)}  ${"-".repeat(pathWidth)}  ------`
  );

  // Rows
  for (const wt of worktrees) {
    const status = wt.isDirty ? "dirty" : "clean";
    const marker = wt.isMain ? "*" : " ";
    lines.push(
      `${(marker + wt.name).padEnd(nameWidth + 1)} ${wt.branch.padEnd(branchWidth)}  ${wt.path.padEnd(pathWidth)}  ${status}`
    );
  }

  return lines.join("\n");
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const jsonOutput = flags.json;

  // Get repo root
  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    if (jsonOutput) {
      outputJson({
        success: false,
        action: "list_worktrees",
        error: "NOT_GIT_REPO",
        message: "Not inside a git repository",
      });
    } else {
      console.error("Error: Not inside a git repository");
    }
    process.exit(1);
  }

  // Get worktrees
  const rawWorktrees = await getWorktrees();
  const subcodeWorktreesDir = join(repoRoot, ".subcode", "worktrees");

  const worktrees: WorktreeInfo[] = await Promise.all(
    rawWorktrees.map(async (wt) => {
      const isSubcode = wt.path.startsWith(subcodeWorktreesDir);
      const isMain = wt.path === repoRoot;
      const name = isMain ? basename(repoRoot) : basename(wt.path);
      const relativePath = isMain ? repoRoot : relative(repoRoot, wt.path) || wt.path;
      const isDirty = await isWorktreeDirty(wt.path);

      return {
        name,
        branch: wt.branch,
        path: relativePath,
        absolutePath: wt.path,
        isSubcode,
        isDirty,
        isMain,
      };
    })
  );

  // Sort: main first, then subcode worktrees, then others
  worktrees.sort((a, b) => {
    if (a.isMain) return -1;
    if (b.isMain) return 1;
    if (a.isSubcode && !b.isSubcode) return -1;
    if (!a.isSubcode && b.isSubcode) return 1;
    return a.name.localeCompare(b.name);
  });

  const subcodeCount = worktrees.filter((w) => w.isSubcode).length;

  if (jsonOutput) {
    outputJson<ListResult>({
      success: true,
      action: "list_worktrees",
      data: {
        worktrees,
        count: worktrees.length,
        subcodeCount,
      },
      message: `Found ${worktrees.length} worktrees (${subcodeCount} in .subcode/worktrees/)`,
    });
  } else {
    if (worktrees.length === 0) {
      console.log("No worktrees found");
    } else {
      console.log(formatTable(worktrees));
      console.log("");
      console.log(`Total: ${worktrees.length} worktrees (${subcodeCount} in .subcode/worktrees/)`);
    }
  }
}

main().catch((err) => {
  outputJson({
    success: false,
    action: "list_worktrees",
    error: "UNKNOWN_ERROR",
    message: err.message || "An unknown error occurred",
  });
  process.exit(1);
});
