# Worktree Troubleshooting Guide

Common issues and solutions when working with git worktrees.

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
bun run .claude/skills/subcode-worktrees/scripts/prune.ts
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

## Further Reading

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Practical Guide to Git Worktree](https://dev.to/yankee/practical-guide-to-git-worktree-58o0)
- [How to use git worktree and in a clean way](https://morgan.cugerone.com/blog/how-to-use-git-worktree-and-in-a-clean-way/)
