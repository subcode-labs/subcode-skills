# Subcode Skills - Vision & Philosophy

## What is Subcode?

**Subcode** is a collection of portable developer experience tools designed to work seamlessly with AI coding assistants like Claude. Each tool is packaged as a "skill" - a self-contained module that provides Claude with specialized knowledge, scripts, and workflows for specific development tasks.

## Why Subcode?

Modern development increasingly involves AI pair programming. While Claude is incredibly capable, it benefits from structured guidance for complex, repetitive tasks. Subcode bridges this gap by providing:

1. **Portable Skills**: Install once, use everywhere. Skills work across any repository.
2. **Best Practices Built-in**: Each skill encodes battle-tested patterns and workflows.
3. **Claude-Native Design**: Skills are designed specifically for how Claude works - structured outputs, clear instructions, executable scripts.
4. **Open Source**: Community-driven development means skills improve over time.

## Core Philosophy

### Easy Adoption
```bash
# One command to install
curl -fsSL https://raw.githubusercontent.com/subcode-labs/subcode-skills/main/install.sh | bash
```

No complex setup. No configuration files to learn. Just install and start using.

### Convention Over Configuration

Subcode establishes the `.subcode/` directory as a standard location in repositories:

```
your-repo/
├── .subcode/           # Subcode tooling lives here
│   ├── config.json     # Shared configuration
│   └── worktrees/      # Git worktrees (managed by subcode-worktrees skill)
├── .claude/
│   └── skills/         # Claude skills installed here
└── ...your code
```

This convention means:
- Tools know where to find their data
- Configuration is centralized
- Git ignores are predictable
- Teams share the same structure

### Structured Output

All Subcode scripts output structured JSON, making them ideal for Claude to parse and act upon:

```json
{
  "success": true,
  "action": "create_worktree",
  "data": { "name": "feature-auth", "path": ".subcode/worktrees/feature-auth" },
  "message": "Worktree created successfully",
  "nextSteps": ["cd .subcode/worktrees/feature-auth", "Start coding!"]
}
```

### TypeScript/Bun First

Skills are written in TypeScript and executed with Bun for:
- Type safety and better error handling
- Fast execution (Bun is quick!)
- Cross-platform compatibility
- Easy contribution (everyone knows TypeScript)

## Available Skills

| Skill | Description |
|-------|-------------|
| `subcode-worktrees` | Git worktree management with best practices |

*More skills coming soon...*

## Future Direction

### Planned Skills
- **subcode-env**: Environment variable management across worktrees
- **subcode-branch**: Smart branch naming and management
- **subcode-review**: PR review helpers and templates
- **subcode-deps**: Dependency update workflows

### Ecosystem Growth
- Skill marketplace for community contributions
- Skill composition (skills that build on other skills)
- IDE integrations (VS Code, Cursor)
- Team configuration sharing

## Contributing

We welcome contributions! Whether it's:
- Bug fixes and improvements to existing skills
- New skills that solve common developer pain points
- Documentation improvements
- Testing and feedback

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## The Name

**Sub** (below, supporting) + **Code** = tools that work beneath your code, supporting your workflow without getting in the way.

---

*Built with love for developers who appreciate good tooling.*
