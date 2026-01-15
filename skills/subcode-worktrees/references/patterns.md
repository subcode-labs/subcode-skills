# Git Worktree Organization Patterns

This document covers common patterns for organizing git worktrees.

## Why Worktrees?

Git worktrees allow you to check out multiple branches simultaneously in separate directories. This is useful for:

- **Parallel development**: Work on a feature while keeping main ready for hotfixes
- **PR reviews**: Check out a PR branch without disrupting your current work
- **Comparing implementations**: Run different branches side-by-side
- **Long-running tasks**: Keep a build running in one worktree while developing in another

## Organization Patterns

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

## Recommended Permanent Worktrees

Consider keeping these worktrees permanently:

1. **review** - For checking out PRs
2. **hotfix** - Ready for urgent fixes (always on main/master)

```bash
bun run .claude/skills/subcode-worktrees/scripts/create.ts --name review
bun run .claude/skills/subcode-worktrees/scripts/create.ts --name hotfix --branch main
```
