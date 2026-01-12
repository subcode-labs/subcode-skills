# Git Worktree Patterns & Best Practices

This document covers common patterns for using git worktrees effectively.

## Why Worktrees?

Git worktrees allow you to check out multiple branches simultaneously in separate directories. This is useful for:

- **Parallel development**: Work on a feature while keeping main ready for hotfixes
- **PR reviews**: Check out a PR branch without disrupting your current work
- **Comparing implementations**: Run different branches side-by-side
- **Long-running tasks**: Keep a build running in one worktree while developing in another

## Worktree Organization Patterns

### Pattern 1: Sibling Directories (Traditional)

The simplest approach - create worktrees as siblings to your main repo:

```
~/projects/
├── my-repo/              # Main repo (main branch)
├── my-repo-feature/      # Feature worktree
└── my-repo-hotfix/       # Hotfix worktree
```

**Pros**: Simple to set up
**Cons**: Clutters parent directory, hard to track what's related

### Pattern 2: Bare Repository (Clean Architecture)

Clone as a bare repo, then create worktrees for each branch:

```
my-repo/
├── .bare/                # Git database (bare clone)
├── .git                  # Pointer file to .bare
├── main/                 # Worktree: main branch
├── develop/              # Worktree: develop branch
└── feature-auth/         # Worktree: feature branch
```

**Setup:**
```bash
mkdir my-repo && cd my-repo
git clone --bare git@github.com:user/repo.git .bare
echo "gitdir: ./.bare" > .git
git worktree add main
git worktree add develop
```

**Pros**: Everything contained in one directory, clean structure
**Cons**: Requires different initial setup, can't have a "main" working directory

### Pattern 3: Subcode Pattern (Our Approach)

Store worktrees in a dedicated subdirectory:

```
my-repo/
├── .subcode/
│   ├── config.json       # Configuration
│   └── worktrees/        # All worktrees here
│       ├── feature-auth/
│       └── hotfix-123/
├── .git/
├── src/
└── package.json
```

**Pros**:
- Works with existing repos (no re-clone needed)
- Worktrees are clearly separated from main code
- Easy to gitignore
- Consistent location across all projects

**Cons**: Slightly longer paths

## Subcode Worktrees Usage

### Creating a Feature Worktree

```bash
# Create worktree for a new feature
bun run .claude/skills/subcode-worktrees/src/create.ts --name feature-auth

# Create with specific branch name
bun run .claude/skills/subcode-worktrees/src/create.ts --name feature-auth --branch feature/user-authentication

# Create from a specific base branch
bun run .claude/skills/subcode-worktrees/src/create.ts --name feature-auth --base develop
```

### Working with Worktrees

```bash
# Navigate to worktree
cd .subcode/worktrees/feature-auth

# Work on your code...
git add .
git commit -m "Add authentication"
git push -u origin feature/user-authentication

# When done, return to main and clean up
cd ../../..
bun run .claude/skills/subcode-worktrees/src/remove.ts --name feature-auth --delete-branch
```

### Reviewing a Pull Request

```bash
# Create worktree to review PR
bun run .claude/skills/subcode-worktrees/src/create.ts --name pr-review --branch origin/feature-branch

# Navigate and review
cd .subcode/worktrees/pr-review
# ... review code, run tests ...

# Clean up when done
cd ../../..
bun run .claude/skills/subcode-worktrees/src/remove.ts --name pr-review
```

### Recommended Permanent Worktrees

Consider keeping these worktrees permanently:

1. **review** - For checking out PRs
2. **hotfix** - Ready for urgent fixes (always on main/master)

```bash
bun run .claude/skills/subcode-worktrees/src/create.ts --name review
bun run .claude/skills/subcode-worktrees/src/create.ts --name hotfix --branch main
```

## What's Shared vs Independent

### Shared Across All Worktrees
- Git history, branches, commits
- Remote configurations
- Git hooks (in .git/hooks)

### Independent Per Worktree
- Working directory files
- Staged changes
- `node_modules/` - **must run install in each worktree**
- `.env.local` files - **must copy or recreate**
- Build outputs (`dist/`, `.next/`, etc.)
- Running processes (dev servers)

## Common Issues & Solutions

### Issue: "fatal: '<branch>' is already checked out"

Git doesn't allow the same branch to be checked out in multiple worktrees.

**Solution**: Create a new branch or checkout a different one:
```bash
# Instead of:
bun run create.ts --name test --branch main  # Error!

# Do:
bun run create.ts --name test --branch test-feature  # Creates new branch
```

### Issue: Worktree has uncommitted changes

When removing a worktree with changes, git will refuse.

**Solution**: Commit, stash, or use `--force`:
```bash
# Option 1: Commit changes
cd .subcode/worktrees/feature
git add . && git commit -m "WIP"

# Option 2: Force remove (loses changes!)
bun run remove.ts --name feature --force
```

### Issue: Stale worktree references

If you manually delete a worktree directory, git keeps a reference.

**Solution**: Run prune:
```bash
bun run .claude/skills/subcode-worktrees/src/prune.ts
```

### Issue: node_modules missing in worktree

Each worktree needs its own `node_modules/`.

**Solution**: Subcode automatically runs install, but if needed:
```bash
cd .subcode/worktrees/feature
bun install  # or npm/yarn/pnpm
```

### Issue: Environment variables not working

`.env.local` files are not shared between worktrees.

**Solution**: Subcode copies them automatically, but if needed:
```bash
cp ../../.env.local .subcode/worktrees/feature/.env.local
```

## Performance Tips

1. **Don't create too many worktrees** - Each has its own `node_modules/`, which uses disk space
2. **Clean up when done** - Remove worktrees you're not using
3. **Use shallow clones for large repos** - Reduces initial clone time
4. **Consider using the review worktree** - Reuse one worktree for all PR reviews instead of creating new ones

## Git Commands Reference

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

# Clean up stale references
git worktree prune

# Move a worktree
git worktree move <old-path> <new-path>

# Lock a worktree (prevent pruning)
git worktree lock <path>

# Unlock a worktree
git worktree unlock <path>
```

## Further Reading

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Practical Guide to Git Worktree](https://dev.to/yankee/practical-guide-to-git-worktree-58o0)
- [How to use git worktree and in a clean way](https://morgan.cugerone.com/blog/how-to-use-git-worktree-and-in-a-clean-way/)
