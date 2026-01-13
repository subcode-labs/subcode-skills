# Changesets

This folder manages version bumps and changelog entries for @subcode/skills.

## Adding a Changeset

After making changes, run:

```bash
npm run changeset
```

Select the bump type:
- **patch**: Bug fixes, minor improvements
- **minor**: New features (backwards compatible)
- **major**: Breaking changes

Write a clear summary that will appear in the CHANGELOG.

## How It Works

1. Changeset files are committed with your PR
2. When merged to main, GitHub Actions creates a "Version Packages" PR
3. When that PR is merged, the package is published to npm

## More Info

- [Changesets documentation](https://github.com/changesets/changesets)
- [Common questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
