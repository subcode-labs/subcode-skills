#!/usr/bin/env bun
/**
 * Fetch PR status including comments, reviews, and CI status
 *
 * Usage: bun run src/fetch-status.ts [--pr <number>]
 *
 * If --pr is not provided, detects PR for current branch using `gh pr view`
 */

import type {
	CiRun,
	CiRunConclusion,
	CiRunStatus,
	CiStatus,
	ConversationComment,
	PrStatus,
	PullRequest,
	Result,
	Review,
	ReviewThread,
} from "./types";

// =============================================================================
// GraphQL Query for PR Data
// =============================================================================

const PR_GRAPHQL_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!, $commentsCursor: String, $reviewsCursor: String, $threadsCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      number
      title
      url
      state
      headRefName
      baseRefName
      headRefOid

      comments(first: 100, after: $commentsCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          author { login }
          body
          createdAt
          url
        }
      }

      reviews(first: 100, after: $reviewsCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          author { login }
          state
          body
          createdAt
          url
        }
      }

      reviewThreads(first: 100, after: $threadsCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          path
          line
          startLine
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              id
              author { login }
              body
              createdAt
              url
            }
          }
        }
      }
    }
  }
}
`;

// =============================================================================
// Utility Functions
// =============================================================================

function outputJson<T>(result: Result<T>): void {
	console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args: string[]): { options: Record<string, string> } {
	const options: Record<string, string> = {};
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
		} else {
			i++;
		}
	}
	return { options };
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

async function checkGhCli(): Promise<boolean> {
	const { exitCode } = await runGh(["--version"]);
	return exitCode === 0;
}

async function checkGhAuth(): Promise<boolean> {
	const { exitCode } = await runGh(["auth", "status"]);
	return exitCode === 0;
}

async function getCurrentPrNumber(): Promise<number | null> {
	const { stdout, exitCode } = await runGh([
		"pr",
		"view",
		"--json",
		"number",
		"-q",
		".number",
	]);
	if (exitCode !== 0) return null;
	const num = Number.parseInt(stdout.trim(), 10);
	return Number.isNaN(num) ? null : num;
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

async function fetchGraphQL(
	query: string,
	variables: Record<string, unknown>,
): Promise<unknown> {
	const args = ["api", "graphql", "-f", `query=${query}`];

	for (const [key, value] of Object.entries(variables)) {
		if (value === null || value === undefined) continue;
		if (typeof value === "number") {
			args.push("-F", `${key}=${value}`);
		} else {
			args.push("-f", `${key}=${value}`);
		}
	}

	const { stdout, stderr, exitCode } = await runGh(args);

	if (exitCode !== 0) {
		throw new Error(`GraphQL query failed: ${stderr || stdout}`);
	}

	return JSON.parse(stdout);
}

// =============================================================================
// PR Data Fetching
// =============================================================================

interface GraphQLResponse {
	data: {
		repository: {
			pullRequest: {
				number: number;
				title: string;
				url: string;
				state: string;
				headRefName: string;
				baseRefName: string;
				headRefOid: string;
				comments: {
					pageInfo: { hasNextPage: boolean; endCursor: string };
					nodes: Array<{
						id: string;
						author: { login: string } | null;
						body: string;
						createdAt: string;
						url: string;
					}>;
				};
				reviews: {
					pageInfo: { hasNextPage: boolean; endCursor: string };
					nodes: Array<{
						id: string;
						author: { login: string } | null;
						state: string;
						body: string;
						createdAt: string;
						url: string;
					}>;
				};
				reviewThreads: {
					pageInfo: { hasNextPage: boolean; endCursor: string };
					nodes: Array<{
						id: string;
						path: string;
						line: number | null;
						startLine: number | null;
						isResolved: boolean;
						isOutdated: boolean;
						comments: {
							nodes: Array<{
								id: string;
								author: { login: string } | null;
								body: string;
								createdAt: string;
								url: string;
							}>;
						};
					}>;
				};
			};
		};
	};
}

async function fetchPrData(
	owner: string,
	repo: string,
	prNumber: number,
): Promise<{
	pullRequest: PullRequest;
	reviewThreads: ReviewThread[];
	conversationComments: ConversationComment[];
	reviews: Review[];
}> {
	const reviewThreads: ReviewThread[] = [];
	const conversationComments: ConversationComment[] = [];
	const reviews: Review[] = [];
	let pullRequest: PullRequest | null = null;

	let commentsCursor: string | null = null;
	let reviewsCursor: string | null = null;
	let threadsCursor: string | null = null;
	let hasMoreComments = true;
	let hasMoreReviews = true;
	let hasMoreThreads = true;

	while (hasMoreComments || hasMoreReviews || hasMoreThreads) {
		const result = (await fetchGraphQL(PR_GRAPHQL_QUERY, {
			owner,
			repo,
			prNumber,
			commentsCursor: hasMoreComments ? commentsCursor : null,
			reviewsCursor: hasMoreReviews ? reviewsCursor : null,
			threadsCursor: hasMoreThreads ? threadsCursor : null,
		})) as GraphQLResponse;

		const pr = result.data.repository.pullRequest;

		if (!pullRequest) {
			pullRequest = {
				number: pr.number,
				title: pr.title,
				url: pr.url,
				state: pr.state,
				owner,
				repo,
				headRefName: pr.headRefName,
				baseRefName: pr.baseRefName,
				headSha: pr.headRefOid,
			};
		}

		if (hasMoreComments) {
			for (const node of pr.comments.nodes) {
				conversationComments.push({
					id: node.id,
					author: node.author?.login ?? "ghost",
					body: node.body,
					createdAt: node.createdAt,
					url: node.url,
				});
			}
			hasMoreComments = pr.comments.pageInfo.hasNextPage;
			commentsCursor = pr.comments.pageInfo.endCursor;
		}

		if (hasMoreReviews) {
			for (const node of pr.reviews.nodes) {
				reviews.push({
					id: node.id,
					author: node.author?.login ?? "ghost",
					state: node.state,
					body: node.body,
					createdAt: node.createdAt,
					url: node.url,
				});
			}
			hasMoreReviews = pr.reviews.pageInfo.hasNextPage;
			reviewsCursor = pr.reviews.pageInfo.endCursor;
		}

		if (hasMoreThreads) {
			for (const node of pr.reviewThreads.nodes) {
				reviewThreads.push({
					id: node.id,
					path: node.path,
					line: node.line,
					startLine: node.startLine,
					isResolved: node.isResolved,
					isOutdated: node.isOutdated,
					comments: node.comments.nodes.map((c) => ({
						id: c.id,
						author: c.author?.login ?? "ghost",
						body: c.body,
						createdAt: c.createdAt,
						url: c.url,
					})),
				});
			}
			hasMoreThreads = pr.reviewThreads.pageInfo.hasNextPage;
			threadsCursor = pr.reviewThreads.pageInfo.endCursor;
		}
	}

	if (!pullRequest) {
		throw new Error("Failed to fetch PR data");
	}

	return { pullRequest, reviewThreads, conversationComments, reviews };
}

// =============================================================================
// CI Status Fetching
// =============================================================================

interface GhRunListItem {
	databaseId: number;
	displayTitle: string;
	status: string;
	conclusion: string | null;
	url: string;
	startedAt: string | null;
	completedAt: string | null;
	headSha: string;
}

async function fetchCiStatus(
	owner: string,
	repo: string,
	headSha: string,
): Promise<CiStatus> {
	const { stdout, exitCode } = await runGh([
		"run",
		"list",
		"--repo",
		`${owner}/${repo}`,
		"--commit",
		headSha,
		"--json",
		"databaseId,displayTitle,status,conclusion,url,startedAt,completedAt,headSha",
		"--limit",
		"50",
	]);

	if (exitCode !== 0) {
		return {
			allPassed: false,
			allCompleted: false,
			runs: [],
			failedRuns: [],
			pendingRuns: [],
		};
	}

	let rawRuns: GhRunListItem[] = [];
	try {
		rawRuns = JSON.parse(stdout) as GhRunListItem[];
	} catch {
		return {
			allPassed: false,
			allCompleted: false,
			runs: [],
			failedRuns: [],
			pendingRuns: [],
		};
	}

	const runs: CiRun[] = rawRuns.map((r) => ({
		id: r.databaseId,
		name: r.displayTitle,
		status: r.status.toLowerCase() as CiRunStatus,
		conclusion: r.conclusion?.toLowerCase() as CiRunConclusion,
		url: r.url,
		startedAt: r.startedAt,
		completedAt: r.completedAt,
		headSha: r.headSha,
	}));

	const failedRuns = runs.filter(
		(r) =>
			r.conclusion === "failure" ||
			r.conclusion === "cancelled" ||
			r.conclusion === "timed_out",
	);

	const pendingRuns = runs.filter(
		(r) =>
			r.status === "queued" ||
			r.status === "in_progress" ||
			r.status === "waiting" ||
			r.status === "pending",
	);

	const allCompleted = runs.length > 0 && pendingRuns.length === 0;
	const allPassed = allCompleted && failedRuns.length === 0;

	return {
		allPassed,
		allCompleted,
		runs,
		failedRuns,
		pendingRuns,
	};
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const { options } = parseArgs(process.argv.slice(2));

	if (!(await checkGhCli())) {
		outputJson({
			success: false,
			action: "fetch_status",
			error: "GH_CLI_NOT_FOUND",
			message:
				"GitHub CLI (gh) is not installed or not in PATH. Install it from https://cli.github.com/",
		});
		process.exit(1);
	}

	if (!(await checkGhAuth())) {
		outputJson({
			success: false,
			action: "fetch_status",
			error: "GH_NOT_AUTHENTICATED",
			message: "Not authenticated with GitHub CLI. Run: gh auth login",
			nextSteps: ["Run 'gh auth login' to authenticate"],
		});
		process.exit(1);
	}

	const repoInfo = await getRepoInfo();
	if (!repoInfo) {
		outputJson({
			success: false,
			action: "fetch_status",
			error: "NOT_IN_REPO",
			message:
				"Could not determine repository. Are you in a git repository with a GitHub remote?",
		});
		process.exit(1);
	}

	let prNumber: number | null = options.pr
		? Number.parseInt(options.pr, 10)
		: null;
	if (!prNumber) {
		prNumber = await getCurrentPrNumber();
	}

	if (!prNumber) {
		outputJson({
			success: false,
			action: "fetch_status",
			error: "NO_PR_FOUND",
			message:
				"No PR found for current branch. Use --pr <number> to specify a PR, or ensure your branch has an open PR.",
			nextSteps: [
				"Create a PR with: gh pr create",
				"Or specify a PR number: bun run src/fetch-status.ts --pr 123",
			],
		});
		process.exit(1);
	}

	console.error(`Fetching status for PR #${prNumber}...`);

	try {
		const { pullRequest, reviewThreads, conversationComments, reviews } =
			await fetchPrData(repoInfo.owner, repoInfo.repo, prNumber);

		console.error("Fetching CI status...");
		const ci = await fetchCiStatus(
			repoInfo.owner,
			repoInfo.repo,
			pullRequest.headSha,
		);

		const unresolvedThreads = reviewThreads.filter((t) => !t.isResolved);
		const pendingReviews = reviews.filter((r) => r.state === "PENDING");
		const changesRequested = reviews.some(
			(r) => r.state === "CHANGES_REQUESTED",
		);

		const prStatus: PrStatus = {
			pullRequest,
			reviewThreads,
			conversationComments,
			reviews,
			ci,
			summary: {
				totalThreads: reviewThreads.length,
				unresolvedThreads: unresolvedThreads.length,
				totalConversationComments: conversationComments.length,
				totalReviews: reviews.length,
				pendingReviews: pendingReviews.length,
				changesRequested,
				ciPassed: ci.allPassed,
				ciCompleted: ci.allCompleted,
			},
		};

		outputJson<PrStatus>({
			success: true,
			action: "fetch_status",
			data: prStatus,
			message: `PR #${prNumber}: ${unresolvedThreads.length} unresolved threads, CI ${ci.allPassed ? "passed" : ci.allCompleted ? "failed" : "pending"}`,
		});
	} catch (err) {
		outputJson({
			success: false,
			action: "fetch_status",
			error: "FETCH_FAILED",
			message: err instanceof Error ? err.message : "Failed to fetch PR status",
		});
		process.exit(1);
	}
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "fetch_status",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
