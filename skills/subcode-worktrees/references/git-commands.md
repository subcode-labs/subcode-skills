# Git Worktree Command Reference

Quick reference for native git worktree commands.

## Basic Commands

```bash
# List all worktrees
git worktree list

# Add a worktree (new branch)
git worktree add <path> -b <new-branch> <base-branch>

# Add a worktree (existing branch)
git worktree add <path> <existing-branch>

# Remove a worktree
git worktree remove <path>

# Force remove (with uncommitted changes)
git worktree remove --force <path>
```

## Maintenance Commands

```bash
# Clean up stale references
git worktree prune

# Move a worktree
git worktree move <old-path> <new-path>

# Lock a worktree (prevent pruning)
git worktree lock <path>

# Unlock a worktree
git worktree unlock <path>
```

## Examples

### Create a feature branch worktree
```bash
git worktree add ../feature-auth -b feature/auth main
```

### Checkout an existing remote branch
```bash
git worktree add ../pr-review origin/feature-branch
```

### List worktrees with details
```bash
git worktree list --porcelain
```

### Remove and prune in one step
```bash
git worktree remove ../feature-auth && git worktree prune
```
