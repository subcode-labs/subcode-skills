#!/usr/bin/env bun
/**
 * Initialize the .subcode directory
 *
 * Usage: bun run src/init.ts
 *
 * This script is idempotent - safe to run multiple times.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Import from lib (path relative to repo root when installed)
const libPath = "../../../lib/utils.ts";

interface InitResult {
  status: "newly_initialized" | "already_initialized";
  path: string;
  configPath: string;
}

interface Result<T = unknown> {
  success: boolean;
  action: string;
  data?: T;
  message: string;
  error?: string;
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

async function getDefaultBranch(): Promise<string> {
  // Try to get from remote HEAD
  try {
    const proc = Bun.spawn(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    const branch = text.trim().replace("refs/remotes/origin/", "");
    if (branch) return branch;
  } catch {
    // Ignore
  }

  // Check if main exists
  try {
    const proc = Bun.spawn(["git", "show-ref", "--verify", "--quiet", "refs/heads/main"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    if (proc.exitCode === 0) return "main";
  } catch {
    // Ignore
  }

  return "main";
}

function outputJson<T>(result: Result<T>): void {
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  // Check we're in a git repo
  const repoRoot = await getRepoRoot();

  if (!repoRoot) {
    outputJson({
      success: false,
      action: "init",
      error: "NOT_GIT_REPO",
      message: "Not inside a git repository. Please run this from your project root.",
    });
    process.exit(1);
  }

  const subcodeDir = join(repoRoot, ".subcode");
  const worktreesDir = join(subcodeDir, "worktrees");
  const configPath = join(subcodeDir, "config.json");
  const gitignorePath = join(subcodeDir, ".gitignore");

  // Check if already initialized
  if (existsSync(configPath)) {
    outputJson<InitResult>({
      success: true,
      action: "init",
      data: {
        status: "already_initialized",
        path: ".subcode",
        configPath: ".subcode/config.json",
      },
      message: "Subcode directory already initialized",
    });
    return;
  }

  // Create directories
  mkdirSync(worktreesDir, { recursive: true });

  // Create .gitignore
  const gitignoreContent = `# Subcode managed files
worktrees/
*.log
.cache/
`;
  writeFileSync(gitignorePath, gitignoreContent);

  // Get default branch for config
  const defaultBranch = await getDefaultBranch();

  // Create config.json
  const config = {
    $schema: "https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/schemas/config.schema.json",
    version: "1.0.0",
    initialized: new Date().toISOString(),
    worktrees: {
      defaultBaseBranch: defaultBranch,
      autoInstallDeps: true,
      copyEnvFiles: true,
      packageManager: "auto",
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  outputJson<InitResult>({
    success: true,
    action: "init",
    data: {
      status: "newly_initialized",
      path: ".subcode",
      configPath: ".subcode/config.json",
    },
    message: "Subcode directory initialized successfully",
  });
}

main().catch((err) => {
  outputJson({
    success: false,
    action: "init",
    error: "UNKNOWN_ERROR",
    message: err.message || "An unknown error occurred",
  });
  process.exit(1);
});
