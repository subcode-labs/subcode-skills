# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Subcode Skills is a collection of portable tools that provide Claude with specialized knowledge and scripts for development tasks. The main package is `@subcode/skills`, installed via `npx @subcode/skills install`.

## Build and Development Commands

```bash
# Install dependencies
bun install

# Build the CLI (required before publishing)
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
npm run lint:fix  # Auto-fix issues

# Version management with changesets
npm run changeset  # Add a changeset for your changes
npm run version    # Apply changesets and bump versions
npm run release    # Build and publish to npm
```

## Architecture

### Monorepo Structure

- **packages/subcode/**: CLI tool for managing skills (uses citty for commands, unbuild for bundling)
- **skills/**: Individual skill packages (currently just `subcode-worktrees`)
- **lib/**: Shared TypeScript utilities used by skills (`lib/utils.ts`)
- **schemas/**: JSON schemas for configuration files

### CLI Commands (packages/subcode)

The CLI is built with [citty](https://github.com/unjs/citty) and provides these commands:
- `install`/`init`: Interactive skill installation
- `add`, `remove`, `list`: Manage installed skills
- `update`, `doctor`: Maintenance commands

Commands are lazy-loaded from `packages/subcode/src/commands/`.

### Skills Architecture

Each skill lives in `skills/<skill-name>/` and contains:
- `SKILL.md`: Claude-readable instructions and command documentation
- `src/`: TypeScript scripts executable via Bun
- `references/`: Additional documentation

Skills output structured JSON for reliable parsing by Claude. The `lib/utils.ts` provides shared utilities including:
- `Result<T>` type with `successResult()`/`errorResult()` helpers
- Git operations (repo detection, worktree management)
- Config file management (`.subcode/config.json`)
- Package manager detection and installation

### Path Alias

TypeScript path alias `@lib/*` maps to `lib/*` (configured in tsconfig.json).

## Code Style

- Uses Biome for linting/formatting with tab indentation
- ESM modules throughout (`"type": "module"`)
- Bun runtime for skill scripts, Node 18+ for CLI
