---
name: subcode-pr-loop
description: Autonomous PR improvement agent. Use this skill when the user wants to iterate on a PR until all code review feedback is addressed and CI passes. The agent triages issues, fixes high-priority items, defers low-priority suggestions, and posts /subcode-pr-final-approve when complete.
---

# Subcode PR Loop

Autonomously iterate on a pull request until all high-priority feedback is addressed and CI passes.

## When to Use This Skill

Use this skill when the user wants to:
- Iterate on a PR until it's ready for merge
- Address code review feedback automatically
- Fix CI failures without manual intervention
- Run an autonomous PR improvement loop

## Prerequisites

- `gh` CLI authenticated
- Current branch has an open PR
- For Linear issues: `LINEAR_API_KEY` environment variable set

## Philosophy

**Pragmatic, not nitpicky.** This skill focuses on:
- Real bugs and security issues
- CI failures (build, tests, types)
- Violations of CLAUDE.md guidelines
- Explicit reviewer requests

It does NOT chase every minor suggestion. Low-priority items are captured and deferred to a follow-up issue.

## Available Scripts

### fetch-status.ts
```bash
bun run .claude/skills/subcode-pr-loop/src/fetch-status.ts [--pr <number>]
```
Fetches PR comments, reviews, and CI status. Returns combined `PrStatus` object.

### check-ci.ts
```bash
bun run .claude/skills/subcode-pr-loop/src/check-ci.ts --pr <number> [--wait] [--timeout <seconds>]
```
Checks CI status with detailed failure information. Use `--wait` to block until CI completes.

### post-comment.ts
```bash
bun run .claude/skills/subcode-pr-loop/src/post-comment.ts --pr <number> --body "Comment"
bun run .claude/skills/subcode-pr-loop/src/post-comment.ts --pr <number> --body-file path/to/file.md
```
Posts a comment to the PR.

### create-issue.ts
```bash
bun run .claude/skills/subcode-pr-loop/src/create-issue.ts --pr <number> --tracker github
bun run .claude/skills/subcode-pr-loop/src/create-issue.ts --pr <number> --tracker linear --team-id <id>
```
Creates a follow-up issue from deferred tasks.

## Main Workflow

Execute this workflow autonomously, iterating until complete:

### Step 1: Initialize State Directory

Create the state directory for this PR run:
```bash
mkdir -p .subcode/pr-loop/current-run/pr-<number>
```

### Step 2: Fetch PR Status

```bash
bun run .claude/skills/subcode-pr-loop/src/fetch-status.ts --pr <number>
```

Parse the output to understand:
- Unresolved review threads
- Conversation comments
- Reviews (especially CHANGES_REQUESTED)
- CI status (passed/failed/pending)

### Step 3: Triage Issues

Categorize each issue as HIGH or LOW priority:

**HIGH PRIORITY (Must Fix)**:
- CI failures (build errors, test failures, type errors)
- Bugs identified by reviewers
- Security vulnerabilities
- Violations of CLAUDE.md guidelines
- Breaking changes not documented
- Reviewer explicitly requests changes (blocking)
- Comments from maintainers with merge authority

**LOW PRIORITY (Defer to Follow-up)**:
- Style preferences not codified in guidelines
- "Consider doing X" suggestions
- Refactoring ideas for future
- Performance optimizations (unless critical)
- Documentation improvements
- "Nice to have" features
- Subjective preferences

### Step 4: Validate High-Priority Issues

For each high-priority issue, launch a Task agent to validate:

```
Investigate this code review comment to determine if it's a valid issue:

File: <path>
Line: <line>
Comment: "<comment body>"
Author: @<author>

Check:
1. Is the comment pointing out a real bug or issue?
2. Or is the commenter mistaken / made wrong assumptions?
3. Read the surrounding code context
4. Consider the PR's intent and changes

Return:
- isValid: true/false
- confidence: 0-100
- reasoning: explanation
- suggestedFix: if valid, how to fix
```

Filter to only confirmed valid issues (confidence >= 70).

### Step 5: Implement Fixes

For each validated issue, launch a Task agent to fix:

```
Fix this validated code review issue:

File: <path>
Line: <line>
Issue: "<description>"
Suggested fix: "<suggestedFix>"

Instructions:
1. Read the file and understand the context
2. Implement the fix
3. Ensure the fix doesn't break anything else
4. Return a summary of what was changed
```

Track what was fixed for the summary comment.

### Step 6: Defer Low-Priority Items

Write deferred items to `.subcode/pr-loop/current-run/pr-<number>/deferred.md`:

```markdown
# Deferred Tasks from PR #<number>

> These items were identified during code review but deferred to keep the PR focused.
> Created by subcode-pr-loop on <date>

## Suggestions for Follow-up

### 1. <Category>: <Brief description>
**Source**: @<reviewer> in [comment](<url>)
**Context**: <Why this was deferred - it's a valid suggestion but not blocking>
**Suggested action**: <What to do in follow-up>

### 2. ...

## Refactoring Ideas

### 1. ...

## Documentation Improvements

### 1. ...
```

### Step 7: Run Quality Checks

Run the repository's standard checks:

```bash
# Detect and run appropriate checks
npm run typecheck 2>/dev/null || bun run typecheck 2>/dev/null || true
npm run lint 2>/dev/null || bun run lint 2>/dev/null || true
```

If checks fail, fix the issues before proceeding.

### Step 8: Commit and Push

```bash
git add -A
git commit -m "Address PR feedback (iteration <N>)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```

### Step 9: Post Progress Comment

Post a comment summarizing the iteration:

```markdown
### PR Loop - Iteration <N>

**Issues addressed**: <count>
**Issues deferred**: <count>

#### Changes Made
- <change 1>
- <change 2>
- ...

#### Deferred to Follow-up
- <deferred item 1>
- ...

---
*Automated by subcode-pr-loop*
```

### Step 10: Wait for CI

```bash
# Wait 5 minutes for CI to start processing
sleep 300

# Check CI status
bun run .claude/skills/subcode-pr-loop/src/check-ci.ts --pr <number>
```

If CI is still running, wait 2 more minutes and check again.

### Step 11: Check for New Comments

Fetch status again to see if:
- New comments were added during the iteration
- CI has new failures
- Reviewers have responded

### Step 12: Loop or Exit

**Continue looping if**:
- CI failed (go back to Step 3)
- New unresolved comments exist (go back to Step 3)
- Not yet reached max iterations (default: 5)

**Exit loop if**:
- CI passed AND no unresolved high-priority issues
- Reached max iterations (exit with warning)

### Step 13: Create Follow-up Issue (if deferred items exist)

```bash
bun run .claude/skills/subcode-pr-loop/src/create-issue.ts \
  --pr <number> \
  --tracker github \
  --body-file .subcode/pr-loop/current-run/pr-<number>/deferred.md
```

Or for Linear:
```bash
bun run .claude/skills/subcode-pr-loop/src/create-issue.ts \
  --pr <number> \
  --tracker linear \
  --team-id <team-id>
```

### Step 14: Post Final Comment

Post the final summary with the approval signal:

```markdown
### PR Loop Complete

**Total iterations**: <N>
**Issues addressed**: <total>
**Issues deferred**: <total>

#### Summary of Changes
- <all changes made across iterations>

#### Follow-up Issue
Created <#issue-number or Linear link> for deferred items.

/subcode-pr-final-approve

---
*Automated by [subcode-pr-loop](https://github.com/subcode-labs/subcode-skills)*
```

The `/subcode-pr-final-approve` signal indicates:
- All high-priority issues have been addressed
- CI is passing
- The PR is ready for final human review and merge

## Configuration

Configure in `.subcode/config.json`:

```json
{
  "prLoop": {
    "issueTracker": "github",
    "linearTeamId": "TEAM_ID",
    "linearProjectId": "PROJECT_ID",
    "maxIterations": 5,
    "ciWaitSeconds": 300,
    "ciRetrySeconds": 120
  }
}
```

## Vercel Integration

If the repository has a `vercel.json` or `.vercel/project.json`:
- The skill will detect it's a Vercel project
- If Vercel MCP server is available, use it for detailed deployment logs
- Otherwise, rely on GitHub CI status for Vercel checks

To use Vercel MCP:
1. Ensure the Vercel MCP server is configured in your Claude setup
2. When CI fails with Vercel-related issues, query the MCP for deployment details

## Error Recovery

If the loop encounters an unrecoverable error:
1. Post a comment explaining what went wrong
2. Do NOT post `/subcode-pr-final-approve`
3. Let the user know manual intervention is needed

## Safety Limits

- **Max iterations**: 5 (configurable) - prevents infinite loops
- **Max fixes per iteration**: 10 - prevents overwhelming changes
- **CI timeout**: 10 minutes - doesn't wait forever for CI

## Example Session

**User**: Run the PR loop on my current PR

**Claude**:
1. Detects PR #42 from current branch
2. Fetches status: 3 unresolved threads, CI failing
3. Triages: 2 high-priority (bug, CI failure), 1 low-priority (style suggestion)
4. Validates high-priority issues with sub-agents
5. Fixes: type error in `src/api.ts`, missing null check in `src/utils.ts`
6. Defers: style suggestion to follow-up
7. Runs typecheck - passes
8. Commits and pushes
9. Waits 5 minutes
10. CI passes, no new comments
11. Creates GitHub issue #43 for deferred items
12. Posts final comment with `/subcode-pr-final-approve`

## Tips

- The skill is intentionally opinionated about what to fix vs defer
- Trust the triage - don't second-guess on every minor suggestion
- If unsure about a fix, err on the side of caution and defer
- The follow-up issue ensures nothing is lost, just deprioritized
