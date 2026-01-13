# Subcode Skills

> Portable Claude skills for enhanced developer experience

```bash
# Install subcode skills in your repository
npx subcode-skills install
```

---

## What is this?

Subcode Skills is a collection of portable tools designed to supercharge your development workflow with Claude. Each skill provides Claude with specialized knowledge, scripts, and best practices for specific tasks.

**Read the full vision:** [VISION.md](VISION.md)

## Quick Start

### Interactive Installation
```bash
npx subcode-skills install
```

### Headless/CI Installation
```bash
npx subcode-skills install --yes
```

The installer will:
1. Check for required dependencies (Bun)
2. Let you select which skills to install
3. Set up the `.subcode/` directory in your repo
4. Install selected Claude skills to `.claude/skills/`

## Available Skills

### subcode-worktrees

Git worktree management with best practices.

**Features:**
- Create worktrees in a standardized location (`.subcode/worktrees/`)
- Auto-install dependencies in new worktrees
- Copy environment files automatically
- List, remove, and prune worktrees
- Structured JSON output for Claude integration

**Commands:**
```bash
# Create a new worktree
bun run .claude/skills/subcode-worktrees/src/create.ts --name feature-auth

# List all worktrees
bun run .claude/skills/subcode-worktrees/src/list.ts

# Remove a worktree
bun run .claude/skills/subcode-worktrees/src/remove.ts --name feature-auth

# Clean up stale worktrees
bun run .claude/skills/subcode-worktrees/src/prune.ts
```

## Requirements

- **Bun** (will be installed automatically if missing)
- **Git** (for worktree operations)
- **gum** (optional, for fancy UI - falls back to simple prompts)

## How It Works

### Directory Structure

After installation, your repo will have:

```
your-repo/
├── .subcode/                    # Subcode tooling directory
│   ├── .gitignore               # Ignores worktrees, logs, etc.
│   ├── config.json              # Subcode configuration
│   └── worktrees/               # Git worktrees live here
│       └── feature-branch/
├── .claude/
│   └── skills/
│       └── subcode-worktrees/   # Installed skill
└── ...your code
```

### Configuration

`.subcode/config.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/schemas/config.schema.json",
  "version": "1.0.0",
  "worktrees": {
    "defaultBaseBranch": "main",
    "autoInstallDeps": true,
    "packageManager": "auto"
  }
}
```

## Using with Claude

Once installed, Claude will automatically use these skills when relevant. Just ask:

- "Create a new worktree for the auth feature"
- "List my current worktrees"
- "Clean up old worktrees"
- "Remove the feature-auth worktree"

Claude will use the skill scripts and follow best practices automatically.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)

---

**[Read the full vision](VISION.md)** | **[Report an issue](https://github.com/subcode-labs/subcode-skills/issues)**
