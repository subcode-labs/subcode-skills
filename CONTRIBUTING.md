# Contributing to Subcode Skills

Thanks for your interest in contributing! This document covers the development workflow, including how we manage versions and releases.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/subcode-labs/subcode-skills.git
   cd subcode-skills
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Build the CLI:
   ```bash
   npm run build
   ```

## Project Structure

```
subcode-skills/
├── packages/
│   └── subcode/          # CLI tool (private, bundled with main package)
├── skills/
│   └── subcode-worktrees/ # Git worktree skill (private, bundled)
├── lib/                   # Shared library code
├── schemas/               # JSON schemas
└── .changeset/            # Changeset files for versioning
```

## Versioning and Releases

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

### Adding a Changeset

When you make a change that should be included in the changelog (bug fixes, features, breaking changes), add a changeset:

```bash
npm run changeset
```

This will prompt you to:
1. Select the type of change (patch, minor, major)
2. Write a summary of the change

A markdown file will be created in `.changeset/` - commit this with your PR.

### When to Add a Changeset

**Do add a changeset for:**
- Bug fixes
- New features
- Breaking changes
- Significant refactors that affect users

**Don't add a changeset for:**
- Documentation-only changes
- Internal refactors with no user impact
- CI/tooling changes

### Release Process

Releases are automated via GitHub Actions:

1. When PRs with changesets are merged to `main`, a "Version Packages" PR is automatically created/updated
2. This PR bumps versions and updates CHANGELOG.md
3. When the "Version Packages" PR is merged, the package is automatically published to npm

### Manual Release (Maintainers)

If you need to release manually:

```bash
# Apply changesets and bump versions
npm run version

# Build and publish
npm run release
```

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Make your changes
3. Add a changeset if appropriate (`npm run changeset`)
4. Submit a PR against `main`
5. Ensure CI passes

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

## Testing

```bash
# Type check
npm run typecheck
```

## Questions?

Open an issue if you have questions or need help getting started.
