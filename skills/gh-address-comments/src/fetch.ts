#!/usr/bin/env bun
/**
 * Fetch all PR review comments and threads
 *
 * Usage: bun run src/fetch.ts [--pr <number>]
 *
 * If --pr is not provided, detects PR for current branch using `gh pr view`
 */

import type {
	ConversationComment,
	FetchResult,
	PullRequest,
	Result,
	Review,
	ReviewThread,
} from "./types";

// GraphQL query for fetching all PR review data
const GRAPHQL_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!, $commentsCursor: String, $reviewsCursor: String, $threadsCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      number
      title
      url
      state
      headRefName
      baseRefName

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

async function fetchAllData(
	owner: string,
	repo: string,
	prNumber: number,
): Promise<FetchResult> {
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

	// Paginate through all data
	while (hasMoreComments || hasMoreReviews || hasMoreThreads) {
		const result = (await fetchGraphQL(GRAPHQL_QUERY, {
			owner,
			repo,
			prNumber,
			commentsCursor: hasMoreComments ? commentsCursor : null,
			reviewsCursor: hasMoreReviews ? reviewsCursor : null,
			threadsCursor: hasMoreThreads ? threadsCursor : null,
		})) as GraphQLResponse;

		const pr = result.data.repository.pullRequest;

		// Set PR info on first fetch
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
			};
		}

		// Process conversation comments
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

		// Process reviews
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

		// Process review threads
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

	return {
		pullRequest,
		reviewThreads,
		conversationComments,
		reviews,
		summary: {
			totalThreads: reviewThreads.length,
			unresolvedThreads: reviewThreads.filter((t) => !t.isResolved).length,
			totalConversationComments: conversationComments.length,
			totalReviews: reviews.length,
		},
	};
}

async function main() {
	const { options } = parseArgs(process.argv.slice(2));

	// Check if gh CLI is available
	if (!(await checkGhCli())) {
		outputJson({
			success: false,
			action: "fetch_comments",
			error: "GH_CLI_NOT_FOUND",
			message:
				"GitHub CLI (gh) is not installed or not in PATH. Install it from https://cli.github.com/",
		});
		process.exit(1);
	}

	// Check authentication
	if (!(await checkGhAuth())) {
		outputJson({
			success: false,
			action: "fetch_comments",
			error: "GH_NOT_AUTHENTICATED",
			message: "Not authenticated with GitHub CLI. Run: gh auth login",
			nextSteps: ["Run 'gh auth login' to authenticate"],
		});
		process.exit(1);
	}

	// Get repo info
	const repoInfo = await getRepoInfo();
	if (!repoInfo) {
		outputJson({
			success: false,
			action: "fetch_comments",
			error: "NOT_IN_REPO",
			message:
				"Could not determine repository. Are you in a git repository with a GitHub remote?",
		});
		process.exit(1);
	}

	// Get PR number
	let prNumber: number | null = options.pr
		? Number.parseInt(options.pr, 10)
		: null;
	if (!prNumber) {
		prNumber = await getCurrentPrNumber();
	}

	if (!prNumber) {
		outputJson({
			success: false,
			action: "fetch_comments",
			error: "NO_PR_FOUND",
			message:
				"No PR found for current branch. Use --pr <number> to specify a PR, or ensure your branch has an open PR.",
			nextSteps: [
				"Create a PR with: gh pr create",
				"Or specify a PR number: bun run src/fetch.ts --pr 123",
			],
		});
		process.exit(1);
	}

	// Fetch all PR data
	console.error(`Fetching comments for PR #${prNumber}...`);

	try {
		const data = await fetchAllData(repoInfo.owner, repoInfo.repo, prNumber);

		outputJson<FetchResult>({
			success: true,
			action: "fetch_comments",
			data,
			message: `Found ${data.summary.unresolvedThreads} unresolved review threads, ${data.summary.totalConversationComments} conversation comments, and ${data.summary.totalReviews} reviews`,
		});
	} catch (err) {
		outputJson({
			success: false,
			action: "fetch_comments",
			error: "FETCH_FAILED",
			message:
				err instanceof Error ? err.message : "Failed to fetch PR comments",
		});
		process.exit(1);
	}
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "fetch_comments",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
