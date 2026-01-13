#!/usr/bin/env bun
/**
 * Create a follow-up issue from deferred tasks
 *
 * Usage:
 *   bun run src/create-issue.ts --pr <number> --tracker github
 *   bun run src/create-issue.ts --pr <number> --tracker linear --team-id <id>
 *
 * Options:
 *   --pr          PR number (required)
 *   --tracker     Issue tracker: "github" or "linear" (default: github)
 *   --team-id     Linear team ID (required for Linear)
 *   --project-id  Linear project ID (optional)
 *   --title       Custom issue title
 *   --body        Issue body (or reads from .subcode/pr-loop/current-run/pr-N/deferred.md)
 *   --body-file   Path to file containing issue body
 *   --dry-run     Print issue but don't create
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CreateIssueResult, Result } from "./types";

// =============================================================================
// Utility Functions
// =============================================================================

function outputJson<T>(result: Result<T>): void {
	console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args: string[]): {
	options: Record<string, string>;
	flags: Record<string, boolean>;
} {
	const options: Record<string, string> = {};
	const flags: Record<string, boolean> = {};
	let i = 0;
	while (i < args.length) {
		const arg = args[i];
		if (
			arg.startsWith("--") &&
			i + 1 < args.length &&
			!args[i + 1].startsWith("-")
		) {
			options[arg.slice(2)] = args[i + 1];
			i += 2;
		} else if (arg.startsWith("--")) {
			flags[arg.slice(2)] = true;
			i++;
		} else {
			i++;
		}
	}
	return { options, flags };
}

async function runGh(
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["gh", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	await proc.exited;
	return { stdout, stderr, exitCode: proc.exitCode ?? 1 };
}

async function getRepoRoot(): Promise<string | null> {
	const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	await proc.exited;
	return stdout.trim() || null;
}

async function getRepoInfo(): Promise<{ owner: string; repo: string } | null> {
	const { stdout, exitCode } = await runGh([
		"repo",
		"view",
		"--json",
		"owner,name",
	]);
	if (exitCode !== 0) return null;

	try {
		const data = JSON.parse(stdout) as {
			owner: { login: string };
			name: string;
		};
		return { owner: data.owner.login, repo: data.name };
	} catch {
		return null;
	}
}

async function getPrInfo(
	prNumber: number,
): Promise<{ title: string; url: string } | null> {
	const { stdout, exitCode } = await runGh([
		"pr",
		"view",
		String(prNumber),
		"--json",
		"title,url",
	]);
	if (exitCode !== 0) return null;

	try {
		return JSON.parse(stdout) as { title: string; url: string };
	} catch {
		return null;
	}
}

// =============================================================================
// GitHub Issue Creation
// =============================================================================

async function createGithubIssue(
	title: string,
	body: string,
): Promise<CreateIssueResult> {
	const { stdout, stderr, exitCode } = await runGh([
		"issue",
		"create",
		"--title",
		title,
		"--body",
		body,
	]);

	if (exitCode !== 0) {
		throw new Error(`Failed to create GitHub issue: ${stderr || stdout}`);
	}

	// gh issue create returns the URL
	const url = stdout.trim();
	const issueNumber = Number.parseInt(url.split("/").pop() || "", 10);

	return {
		tracker: "github",
		issueId: String(issueNumber),
		issueNumber,
		url,
		title,
	};
}

// =============================================================================
// Linear Issue Creation
// =============================================================================

async function createLinearIssue(
	title: string,
	body: string,
	teamId: string,
	projectId?: string,
): Promise<CreateIssueResult> {
	const apiKey = process.env.LINEAR_API_KEY;
	if (!apiKey) {
		throw new Error(
			"LINEAR_API_KEY environment variable not set. Set it to create Linear issues.",
		);
	}

	const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
          title
        }
      }
    }
  `;

	const variables: {
		input: {
			title: string;
			description: string;
			teamId: string;
			projectId?: string;
		};
	} = {
		input: {
			title,
			description: body,
			teamId,
		},
	};

	if (projectId) {
		variables.input.projectId = projectId;
	}

	const response = await fetch("https://api.linear.app/graphql", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: apiKey,
		},
		body: JSON.stringify({ query: mutation, variables }),
	});

	if (!response.ok) {
		throw new Error(
			`Linear API error: ${response.status} ${response.statusText}`,
		);
	}

	const data = (await response.json()) as {
		data?: {
			issueCreate: {
				success: boolean;
				issue: {
					id: string;
					identifier: string;
					url: string;
					title: string;
				};
			};
		};
		errors?: Array<{ message: string }>;
	};

	if (data.errors && data.errors.length > 0) {
		throw new Error(`Linear API error: ${data.errors[0].message}`);
	}

	if (!data.data?.issueCreate.success) {
		throw new Error("Linear issue creation failed");
	}

	const issue = data.data.issueCreate.issue;
	return {
		tracker: "linear",
		issueId: issue.id,
		url: issue.url,
		title: issue.title,
	};
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const { options, flags } = parseArgs(process.argv.slice(2));

	const prNumber = options.pr ? Number.parseInt(options.pr, 10) : null;
	if (!prNumber) {
		outputJson({
			success: false,
			action: "create_issue",
			error: "NO_PR_NUMBER",
			message: "PR number required. Use --pr <number>.",
		});
		process.exit(1);
	}

	const tracker = (options.tracker || "github") as "github" | "linear";

	// Get issue body
	let body: string | null = null;

	if (options.body) {
		body = options.body;
	} else if (options["body-file"]) {
		try {
			body = readFileSync(options["body-file"], "utf-8");
		} catch {
			outputJson({
				success: false,
				action: "create_issue",
				error: "FILE_READ_ERROR",
				message: `Could not read file: ${options["body-file"]}`,
			});
			process.exit(1);
		}
	} else {
		// Try to read from default deferred.md location
		const repoRoot = await getRepoRoot();
		if (repoRoot) {
			const deferredPath = join(
				repoRoot,
				".subcode",
				"pr-loop",
				"current-run",
				`pr-${prNumber}`,
				"deferred.md",
			);
			if (existsSync(deferredPath)) {
				body = readFileSync(deferredPath, "utf-8");
			}
		}
	}

	if (!body) {
		outputJson({
			success: false,
			action: "create_issue",
			error: "NO_BODY",
			message:
				"No issue body found. Provide --body, --body-file, or create .subcode/pr-loop/current-run/pr-N/deferred.md",
		});
		process.exit(1);
	}

	// Get PR info for title
	const prInfo = await getPrInfo(prNumber);
	const title =
		options.title ||
		`Follow-up from PR #${prNumber}: ${prInfo?.title || "Deferred tasks"}`;

	if (flags["dry-run"]) {
		console.error(`=== DRY RUN - Would create ${tracker} issue: ===`);
		console.error(`Title: ${title}`);
		console.error(`Body:\n${body}`);
		console.error("=== END DRY RUN ===");

		outputJson<{ tracker: string; title: string; body: string }>({
			success: true,
			action: "create_issue",
			data: { tracker, title, body },
			message: `[DRY RUN] Would create ${tracker} issue`,
		});
		return;
	}

	console.error(`Creating ${tracker} issue for PR #${prNumber}...`);

	try {
		let result: CreateIssueResult;

		if (tracker === "linear") {
			const teamId = options["team-id"];
			if (!teamId) {
				outputJson({
					success: false,
					action: "create_issue",
					error: "NO_TEAM_ID",
					message: "Linear team ID required. Use --team-id <id>.",
				});
				process.exit(1);
			}
			result = await createLinearIssue(
				title,
				body,
				teamId,
				options["project-id"],
			);
		} else {
			result = await createGithubIssue(title, body);
		}

		outputJson<CreateIssueResult>({
			success: true,
			action: "create_issue",
			data: result,
			message: `Created ${tracker} issue: ${result.url}`,
		});
	} catch (err) {
		outputJson({
			success: false,
			action: "create_issue",
			error: "CREATE_FAILED",
			message: err instanceof Error ? err.message : "Failed to create issue",
		});
		process.exit(1);
	}
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "create_issue",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
