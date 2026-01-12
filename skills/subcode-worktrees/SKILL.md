---
name: subcode-worktrees
description: Git worktree management with best practices. Use this skill when the user wants to create, list, remove, or manage git worktrees. This skill stores worktrees in .subcode/worktrees/ for clean organization and provides structured JSON output for reliable parsing.
---

# Subcode Worktrees

Manage git worktrees with best practices, storing them in a centralized `.subcode/worktrees/` directory.

## When to Use This Skill

Use this skill when the user wants to:
- Create a new worktree for parallel development
- List existing worktrees and their status
- Remove a worktree (with or without deleting the branch)
- Clean up stale worktree references
- Work on multiple branches simultaneously

## Available Commands

All commands are TypeScript scripts executed with Bun. They output structured JSON for reliable parsing.

### Initialize Subcode Directory

```bash
bun run .claude/skills/subcode-worktrees/src/init.ts
```

Creates the `.subcode/` directory structure if it doesn't exist. This is called automatically by other commands.

**Output:**
```json
{
  "success": true,
  "action": "init",
  "data": { "status": "newly_initialized", "path": ".subcode" },
  "message": "Subcode directory initialized"
}
```

### Create a Worktree

```bash
bun run .claude/skills/subcode-worktrees/src/create.ts --name <name> [--branch <branch>] [--base <base-branch>]
```

**Arguments:**
- `--name` (required): Name for the worktree directory
- `--branch`: Branch name (defaults to `<name>` if not provided)
- `--base`: Base branch to create from (defaults to config's `defaultBaseBranch`)

**Example:**
```bash
bun run .claude/skills/subcode-worktrees/src/create.ts --name feature-auth --branch feature/authentication
```

**Output:**
```json
{
  "success": true,
  "action": "create_worktree",
  "data": {
    "name": "feature-auth",
    "path": ".subcode/worktrees/feature-auth",
    "branch": "feature/authentication",
    "baseBranch": "main"
  },
  "message": "Worktree created successfully",
  "nextSteps": [
    "cd .subcode/worktrees/feature-auth",
    "Start working on your feature!"
  ]
}
```

### List Worktrees

```bash
bun run .claude/skills/subcode-worktrees/src/list.ts [--json]
```

**Arguments:**
- `--json`: Output as JSON (default is formatted table)

**Example Output (table):**
```
NAME            BRANCH              PATH                           STATUS
main            main                /path/to/repo                  clean
feature-auth    feature/auth        .subcode/worktrees/feature-auth dirty
```

**Example Output (JSON):**
```json
{
  "success": true,
  "action": "list_worktrees",
  "data": {
    "worktrees": [
      { "name": "main", "branch": "main", "path": "/path/to/repo", "isSubcode": false, "isDirty": false },
      { "name": "feature-auth", "branch": "feature/auth", "path": ".subcode/worktrees/feature-auth", "isSubcode": true, "isDirty": true }
    ],
    "count": 2,
    "subcodeCount": 1
  },
  "message": "Found 2 worktrees (1 in .subcode/worktrees/)"
}
```

### Remove a Worktree

```bash
bun run .claude/skills/subcode-worktrees/src/remove.ts --name <name> [--delete-branch] [--force]
```

**Arguments:**
- `--name` (required): Name of the worktree to remove
- `--delete-branch`: Also delete the associated branch
- `--force`: Force removal even with uncommitted changes

**Example:**
```bash
bun run .claude/skills/subcode-worktrees/src/remove.ts --name feature-auth --delete-branch
```

**Output:**
```json
{
  "success": true,
  "action": "remove_worktree",
  "data": {
    "name": "feature-auth",
    "path": ".subcode/worktrees/feature-auth",
    "branchDeleted": true
  },
  "message": "Worktree 'feature-auth' removed successfully"
}
```

### Prune Stale Worktrees

```bash
bun run .claude/skills/subcode-worktrees/src/prune.ts
```

Cleans up stale worktree references (worktrees that were manually deleted without using `git worktree remove`).

**Output:**
```json
{
  "success": true,
  "action": "prune_worktrees",
  "data": { "pruned": 2 },
  "message": "Pruned 2 stale worktree references"
}
```

## Configuration

Configuration is stored in `.subcode/config.json`:

```json
{
  "worktrees": {
    "defaultBaseBranch": "main",
    "autoInstallDeps": true,
    "copyEnvFiles": true,
    "packageManager": "auto"
  }
}
```

**Options:**
- `defaultBaseBranch`: Branch to create new worktrees from (default: "main")
- `autoInstallDeps`: Run package manager install in new worktrees (default: true)
- `copyEnvFiles`: Copy .env.local files to new worktrees (default: true)
- `packageManager`: Package manager to use - "auto", "bun", "npm", "yarn", "pnpm" (default: "auto")

## Directory Structure

After using this skill, your repository will have:

```
your-repo/
├── .subcode/
│   ├── .gitignore           # Ignores worktrees/, logs
│   ├── config.json          # Subcode configuration
│   └── worktrees/           # Git worktrees stored here
│       ├── feature-auth/
│       └── hotfix-123/
└── ...your code
```

## Common Workflows

### Creating a Feature Branch Worktree

1. Create worktree: `bun run .claude/skills/subcode-worktrees/src/create.ts --name feature-auth`
2. Navigate to it: `cd .subcode/worktrees/feature-auth`
3. Work on your feature
4. When done, remove: `bun run .claude/skills/subcode-worktrees/src/remove.ts --name feature-auth`

### Reviewing a PR

1. Create worktree: `bun run .claude/skills/subcode-worktrees/src/create.ts --name pr-review --branch origin/feature-branch`
2. Review the code
3. Remove when done: `bun run .claude/skills/subcode-worktrees/src/remove.ts --name pr-review`

## Error Handling

All commands return structured JSON with error information:

```json
{
  "success": false,
  "action": "create_worktree",
  "error": "WORKTREE_EXISTS",
  "message": "Worktree 'feature-auth' already exists at .subcode/worktrees/feature-auth"
}
```

Common error codes:
- `NOT_GIT_REPO`: Current directory is not a git repository
- `WORKTREE_EXISTS`: Worktree with this name already exists
- `WORKTREE_NOT_FOUND`: Specified worktree does not exist
- `BRANCH_EXISTS`: Branch already exists (when creating)
- `HAS_UNCOMMITTED_CHANGES`: Worktree has uncommitted changes (use --force to override)

## Reference Documentation

For more details on git worktree patterns and best practices, see:
- [worktree-patterns.md](references/worktree-patterns.md)
