---
name: gh-address-comments
description: Address GitHub PR review comments. Use this skill when the user wants to address, fix, or respond to review comments on their pull request. Fetches comments via gh CLI and guides implementation of fixes.
---

# GitHub Address PR Comments

Help users address review comments on their GitHub pull requests.

## When to Use This Skill

Use this skill when the user wants to:
- Address review comments on a PR
- Fix issues raised by reviewers
- See what feedback their PR has received
- Work through review feedback systematically

## Prerequisites

- **GitHub CLI (`gh`)**: Must be installed and authenticated
- **Current branch must have a PR**: Or user must specify a PR number

If not authenticated, run:
```bash
gh auth login
```

## Workflow

### Step 1: Fetch PR Comments

```bash
bun run .claude/skills/gh-address-comments/src/fetch.ts [--pr <number>]
```

**Arguments:**
- `--pr`: Optional PR number. If not provided, detects PR for current branch.

**Output:**
```json
{
  "success": true,
  "action": "fetch_comments",
  "data": {
    "pullRequest": {
      "number": 123,
      "title": "Add new feature",
      "url": "https://github.com/owner/repo/pull/123",
      "state": "OPEN",
      "owner": "owner",
      "repo": "repo",
      "headRefName": "feature-branch",
      "baseRefName": "main"
    },
    "reviewThreads": [
      {
        "id": "RT_xxx",
        "path": "src/index.ts",
        "line": 42,
        "startLine": 40,
        "isResolved": false,
        "isOutdated": false,
        "comments": [
          {
            "id": "RC_xxx",
            "author": "reviewer",
            "body": "This function should handle the error case",
            "createdAt": "2024-01-15T10:30:00Z",
            "url": "https://github.com/..."
          }
        ]
      }
    ],
    "conversationComments": [...],
    "reviews": [...],
    "summary": {
      "totalThreads": 5,
      "unresolvedThreads": 3,
      "totalConversationComments": 2,
      "totalReviews": 1
    }
  },
  "message": "Found 3 unresolved review threads, 2 conversation comments, and 1 reviews"
}
```

### Step 2: Present Review Threads to User

After fetching, present the **unresolved** review threads in a numbered list:

```
## Unresolved Review Comments

1. **src/index.ts:42** (by @reviewer)
   > This function should handle the error case

2. **src/utils.ts:15-20** (by @reviewer)
   > Consider extracting this into a separate helper function

3. **README.md:10** (by @maintainer)
   > Please add documentation for the new API

Which comments would you like to address? (e.g., "1,2" or "all")
```

**Presentation guidelines:**
- Only show **unresolved** threads (skip `isResolved: true`)
- Skip **outdated** threads (where `isOutdated: true`) unless user asks
- Show file path and line number
- Show the reviewer's username
- Quote the first comment in each thread
- If there are replies, summarize them briefly

### Step 3: User Selects Comments

Wait for user to specify which comments to address:
- `1,2,3` - specific numbered comments
- `all` - all unresolved comments
- `1` - single comment

### Step 4: Implement Fixes

For each selected comment:

1. **Read the relevant file** at the specified location
2. **Understand the feedback** - what change is being requested?
3. **Implement the fix** - make the necessary code changes
4. **Explain what was done** - describe the change to the user

**Implementation guidelines:**
- Read the full context around the line number, not just the specific line
- Consider all comments in a thread, not just the first one
- If unclear what change is needed, ask the user for clarification
- After making changes, suggest the user push and/or resolve the thread

## Error Handling

| Error | Solution |
|-------|----------|
| `GH_CLI_NOT_FOUND` | Install GitHub CLI: https://cli.github.com/ |
| `GH_NOT_AUTHENTICATED` | Run `gh auth login` |
| `NOT_IN_REPO` | Navigate to a git repository with a GitHub remote |
| `NO_PR_FOUND` | Create a PR with `gh pr create` or specify `--pr <number>` |
| `FETCH_FAILED` | Check network connection and GitHub access |

## Example Session

**User:** Address the PR review comments

**Claude:**
1. Runs fetch script to get all comments
2. Presents numbered list of unresolved comments
3. Asks user which to address

**User:** Address 1 and 3

**Claude:**
1. Reads `src/index.ts` around line 42
2. Implements error handling as requested
3. Reads `README.md` around line 10
4. Adds documentation for the new API
5. Summarizes changes made

## Tips

- Run the fetch command again after pushing changes to see updated comment status
- Resolved threads will no longer appear in the unresolved list
- If a reviewer has follow-up comments, they'll appear as additional comments in the thread
