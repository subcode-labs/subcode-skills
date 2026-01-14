#!/usr/bin/env bun
/**
 * Post a comment to a PR
 *
 * Usage:
 *   bun run src/post-comment.ts --pr <number> --body "Comment text"
 *   bun run src/post-comment.ts --pr <number> --body-file path/to/file.md
 *
 * Options:
 *   --pr         PR number (required, or auto-detected from current branch)
 *   --body       Comment body text
 *   --body-file  Path to file containing comment body
 *   --dry-run    Print comment but don't post
 */

import { readFileSync } from "node:fs";
import type { Result } from "./types";

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

// =============================================================================
// Post Comment
// =============================================================================

interface PostCommentResult {
	prNumber: number;
	commentUrl: string;
	bodyPreview: string;
}

async function postComment(
	prNumber: number,
	body: string,
): Promise<PostCommentResult> {
	const { stdout, stderr, exitCode } = await runGh([
		"pr",
		"comment",
		String(prNumber),
		"--body",
		body,
	]);

	if (exitCode !== 0) {
		throw new Error(`Failed to post comment: ${stderr || stdout}`);
	}

	// gh pr comment returns the URL of the comment
	const commentUrl = stdout.trim();

	return {
		prNumber,
		commentUrl,
		bodyPreview: body.slice(0, 100) + (body.length > 100 ? "..." : ""),
	};
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const { options, flags } = parseArgs(process.argv.slice(2));

	let prNumber: number | null = options.pr
		? Number.parseInt(options.pr, 10)
		: null;
	if (!prNumber) {
		prNumber = await getCurrentPrNumber();
	}

	if (!prNumber) {
		outputJson({
			success: false,
			action: "post_comment",
			error: "NO_PR_FOUND",
			message: "No PR found. Use --pr <number> to specify.",
		});
		process.exit(1);
	}

	let body: string | null = null;

	if (options.body) {
		body = options.body;
	} else if (options["body-file"]) {
		try {
			body = readFileSync(options["body-file"], "utf-8");
		} catch (err) {
			outputJson({
				success: false,
				action: "post_comment",
				error: "FILE_READ_ERROR",
				message: `Could not read file: ${options["body-file"]}`,
			});
			process.exit(1);
		}
	}

	if (!body) {
		outputJson({
			success: false,
			action: "post_comment",
			error: "NO_BODY",
			message: "No comment body provided. Use --body or --body-file.",
		});
		process.exit(1);
	}

	if (flags["dry-run"]) {
		console.error("=== DRY RUN - Would post comment: ===");
		console.error(body);
		console.error("=== END DRY RUN ===");

		outputJson<{ prNumber: number; body: string }>({
			success: true,
			action: "post_comment",
			data: { prNumber, body },
			message: `[DRY RUN] Would post comment to PR #${prNumber}`,
		});
		return;
	}

	console.error(`Posting comment to PR #${prNumber}...`);

	try {
		const result = await postComment(prNumber, body);

		outputJson<PostCommentResult>({
			success: true,
			action: "post_comment",
			data: result,
			message: `Comment posted to PR #${prNumber}`,
		});
	} catch (err) {
		outputJson({
			success: false,
			action: "post_comment",
			error: "POST_FAILED",
			message: err instanceof Error ? err.message : "Failed to post comment",
		});
		process.exit(1);
	}
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "post_comment",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
