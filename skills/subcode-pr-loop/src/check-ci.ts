#!/usr/bin/env bun
/**
 * Check CI status for a PR, including detailed failure information
 *
 * Usage: bun run src/check-ci.ts --pr <number> [--wait] [--timeout <seconds>]
 *
 * Options:
 *   --pr        PR number (required, or auto-detected from current branch)
 *   --wait      Wait for CI to complete before returning
 *   --timeout   Max seconds to wait (default: 600)
 */

import { existsSync } from "node:fs";
import type {
	CiJob,
	CiRun,
	CiRunConclusion,
	CiRunStatus,
	CiStatus,
	Result,
	VercelDeployment,
} from "./types";

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

async function getPrHeadSha(prNumber: number): Promise<string | null> {
	const { stdout, exitCode } = await runGh([
		"pr",
		"view",
		String(prNumber),
		"--json",
		"headRefOid",
		"-q",
		".headRefOid",
	]);
	if (exitCode !== 0) return null;
	return stdout.trim() || null;
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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// CI Status Fetching
// =============================================================================

interface GhRunListItem {
	databaseId: number;
	displayTitle: string;
	name: string;
	status: string;
	conclusion: string | null;
	url: string;
	startedAt: string | null;
	completedAt: string | null;
	headSha: string;
	workflowName: string;
}

async function fetchCiRuns(
	owner: string,
	repo: string,
	headSha: string,
): Promise<CiRun[]> {
	const { stdout, exitCode } = await runGh([
		"run",
		"list",
		"--repo",
		`${owner}/${repo}`,
		"--commit",
		headSha,
		"--json",
		"databaseId,displayTitle,name,status,conclusion,url,startedAt,completedAt,headSha,workflowName",
		"--limit",
		"50",
	]);

	if (exitCode !== 0) {
		return [];
	}

	let rawRuns: GhRunListItem[] = [];
	try {
		rawRuns = JSON.parse(stdout) as GhRunListItem[];
	} catch {
		return [];
	}

	return rawRuns.map((r) => ({
		id: r.databaseId,
		name: r.workflowName || r.displayTitle || r.name,
		status: r.status.toLowerCase() as CiRunStatus,
		conclusion: r.conclusion?.toLowerCase() as CiRunConclusion,
		url: r.url,
		startedAt: r.startedAt,
		completedAt: r.completedAt,
		headSha: r.headSha,
	}));
}

async function fetchRunJobs(runId: number): Promise<CiJob[]> {
	const { stdout, exitCode } = await runGh([
		"run",
		"view",
		String(runId),
		"--json",
		"jobs",
	]);

	if (exitCode !== 0) {
		return [];
	}

	try {
		const data = JSON.parse(stdout) as {
			jobs: Array<{
				databaseId: number;
				name: string;
				status: string;
				conclusion: string | null;
				steps: Array<{
					name: string;
					status: string;
					conclusion: string | null;
					number: number;
				}>;
			}>;
		};

		return data.jobs.map((j) => ({
			id: j.databaseId,
			name: j.name,
			status: j.status,
			conclusion: j.conclusion,
			steps: j.steps.map((s) => ({
				name: s.name,
				status: s.status,
				conclusion: s.conclusion,
				number: s.number,
			})),
		}));
	} catch {
		return [];
	}
}

async function fetchRunLogs(runId: number): Promise<string | null> {
	const { stdout, exitCode } = await runGh([
		"run",
		"view",
		String(runId),
		"--log-failed",
	]);

	if (exitCode !== 0) {
		return null;
	}

	// Truncate if too long
	if (stdout.length > 10000) {
		return stdout.slice(-10000) + "\n... (truncated)";
	}

	return stdout || null;
}

// =============================================================================
// Vercel Status (if available)
// =============================================================================

async function checkVercelProject(): Promise<boolean> {
	// Check if vercel.json exists in the repo
	const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const repoRoot = (await new Response(proc.stdout).text()).trim();
	await proc.exited;

	if (!repoRoot) return false;

	return (
		existsSync(`${repoRoot}/vercel.json`) ||
		existsSync(`${repoRoot}/.vercel/project.json`)
	);
}

// Note: Vercel MCP integration would be called by Claude at runtime
// This script just indicates if Vercel might be relevant
async function getVercelStatus(): Promise<{
	available: boolean;
	isVercelProject: boolean;
}> {
	const isVercelProject = await checkVercelProject();
	return {
		available: false, // MCP availability is determined at runtime by Claude
		isVercelProject,
	};
}

// =============================================================================
// Main CI Status Function
// =============================================================================

interface DetailedCiStatus extends CiStatus {
	failedJobs: Array<{
		runId: number;
		runName: string;
		job: CiJob;
		logs?: string;
	}>;
	isVercelProject: boolean;
}

async function getCiStatus(
	owner: string,
	repo: string,
	headSha: string,
	fetchDetails = true,
): Promise<DetailedCiStatus> {
	const runs = await fetchCiRuns(owner, repo, headSha);

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

	// Fetch detailed job info for failed runs
	const failedJobs: DetailedCiStatus["failedJobs"] = [];

	if (fetchDetails && failedRuns.length > 0) {
		for (const run of failedRuns.slice(0, 3)) {
			// Limit to first 3 failed runs
			const jobs = await fetchRunJobs(run.id);
			const failedJobsList = jobs.filter((j) => j.conclusion === "failure");

			for (const job of failedJobsList) {
				const logs = await fetchRunLogs(run.id);
				failedJobs.push({
					runId: run.id,
					runName: run.name,
					job,
					logs: logs || undefined,
				});
			}
		}
	}

	const vercelStatus = await getVercelStatus();

	return {
		allPassed,
		allCompleted,
		runs,
		failedRuns,
		pendingRuns,
		failedJobs,
		isVercelProject: vercelStatus.isVercelProject,
	};
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const { options, flags } = parseArgs(process.argv.slice(2));

	const repoInfo = await getRepoInfo();
	if (!repoInfo) {
		outputJson({
			success: false,
			action: "check_ci",
			error: "NOT_IN_REPO",
			message: "Could not determine repository",
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
			action: "check_ci",
			error: "NO_PR_FOUND",
			message: "No PR found. Use --pr <number> to specify.",
		});
		process.exit(1);
	}

	const headSha = await getPrHeadSha(prNumber);
	if (!headSha) {
		outputJson({
			success: false,
			action: "check_ci",
			error: "NO_HEAD_SHA",
			message: `Could not get head SHA for PR #${prNumber}`,
		});
		process.exit(1);
	}

	const shouldWait = flags.wait;
	const timeout = Number.parseInt(options.timeout || "600", 10) * 1000;
	const startTime = Date.now();

	console.error(
		`Checking CI status for PR #${prNumber} (${headSha.slice(0, 7)})...`,
	);

	let status = await getCiStatus(
		repoInfo.owner,
		repoInfo.repo,
		headSha,
		!shouldWait,
	);

	if (shouldWait && !status.allCompleted) {
		console.error("Waiting for CI to complete...");

		while (!status.allCompleted && Date.now() - startTime < timeout) {
			await sleep(30000); // Check every 30 seconds
			status = await getCiStatus(repoInfo.owner, repoInfo.repo, headSha, false);
			console.error(
				`  ${status.pendingRuns.length} runs pending, ${status.failedRuns.length} failed`,
			);
		}

		// Fetch details after completion
		if (status.allCompleted) {
			status = await getCiStatus(repoInfo.owner, repoInfo.repo, headSha, true);
		}
	}

	const statusMessage = status.allPassed
		? "All CI checks passed"
		: status.allCompleted
			? `CI failed: ${status.failedRuns.length} failed runs`
			: `CI pending: ${status.pendingRuns.length} runs in progress`;

	outputJson<DetailedCiStatus>({
		success: true,
		action: "check_ci",
		data: status,
		message: statusMessage,
		nextSteps: status.allPassed
			? undefined
			: status.allCompleted
				? ["Review failed jobs and fix issues"]
				: shouldWait
					? ["Timeout reached, CI still running"]
					: ["Wait for CI to complete or use --wait flag"],
	});
}

main().catch((err) => {
	outputJson({
		success: false,
		action: "check_ci",
		error: "UNKNOWN_ERROR",
		message: err.message || "An unknown error occurred",
	});
	process.exit(1);
});
