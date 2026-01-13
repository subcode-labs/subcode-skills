/**
 * Shared TypeScript interfaces for subcode-pr-loop skill
 */

// =============================================================================
// Generic Result Type
// =============================================================================

export interface Result<T = unknown> {
	success: boolean;
	action: string;
	data?: T;
	message: string;
	error?: string;
	nextSteps?: string[];
}

// =============================================================================
// Pull Request Types
// =============================================================================

export interface PullRequest {
	number: number;
	title: string;
	url: string;
	state: string;
	owner: string;
	repo: string;
	headRefName: string;
	baseRefName: string;
	headSha: string;
}

export interface ReviewComment {
	id: string;
	author: string;
	body: string;
	createdAt: string;
	url: string;
}

export interface ReviewThread {
	id: string;
	path: string;
	line: number | null;
	startLine: number | null;
	isResolved: boolean;
	isOutdated: boolean;
	comments: ReviewComment[];
}

export interface ConversationComment {
	id: string;
	author: string;
	body: string;
	createdAt: string;
	url: string;
}

export interface Review {
	id: string;
	author: string;
	state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED, PENDING
	body: string;
	createdAt: string;
	url: string;
}

// =============================================================================
// CI Status Types
// =============================================================================

export type CiRunStatus =
	| "queued"
	| "in_progress"
	| "completed"
	| "waiting"
	| "pending";

export type CiRunConclusion =
	| "success"
	| "failure"
	| "cancelled"
	| "skipped"
	| "timed_out"
	| "action_required"
	| "neutral"
	| null;

export interface CiRun {
	id: number;
	name: string;
	status: CiRunStatus;
	conclusion: CiRunConclusion;
	url: string;
	startedAt: string | null;
	completedAt: string | null;
	headSha: string;
}

export interface CiJobStep {
	name: string;
	status: string;
	conclusion: string | null;
	number: number;
}

export interface CiJob {
	id: number;
	name: string;
	status: string;
	conclusion: string | null;
	steps: CiJobStep[];
}

export interface VercelDeployment {
	id: string;
	url: string;
	state:
		| "BUILDING"
		| "ERROR"
		| "INITIALIZING"
		| "QUEUED"
		| "READY"
		| "CANCELED";
	createdAt: string;
	errorMessage?: string;
}

export interface CiStatus {
	allPassed: boolean;
	allCompleted: boolean;
	runs: CiRun[];
	failedRuns: CiRun[];
	pendingRuns: CiRun[];
	vercel?: {
		available: boolean;
		deployment?: VercelDeployment;
		logs?: string;
	};
}

// =============================================================================
// Combined PR Status
// =============================================================================

export interface PrStatus {
	pullRequest: PullRequest;
	reviewThreads: ReviewThread[];
	conversationComments: ConversationComment[];
	reviews: Review[];
	ci: CiStatus;
	summary: {
		totalThreads: number;
		unresolvedThreads: number;
		totalConversationComments: number;
		totalReviews: number;
		pendingReviews: number;
		changesRequested: boolean;
		ciPassed: boolean;
		ciCompleted: boolean;
	};
}

// =============================================================================
// Issue Triage Types
// =============================================================================

export type IssuePriority = "high" | "low";

export type IssueCategory =
	| "ci_failure"
	| "bug"
	| "security"
	| "guideline_violation"
	| "breaking_change"
	| "explicit_request"
	| "style_preference"
	| "suggestion"
	| "refactoring"
	| "performance"
	| "documentation"
	| "nice_to_have";

export interface ReviewIssue {
	id: string;
	source: "review_thread" | "conversation" | "review" | "ci";
	sourceId: string;
	sourceUrl: string;
	author: string;
	body: string;
	filePath?: string;
	lineNumber?: number;
	priority: IssuePriority;
	category: IssueCategory;
	reasoning?: string;
}

export interface ValidationResult {
	issueId: string;
	isValid: boolean;
	confidence: number; // 0-100
	reasoning: string;
	suggestedFix?: string;
}

// =============================================================================
// Deferred Tasks Types
// =============================================================================

export interface DeferredTask {
	id: string;
	category: IssueCategory;
	description: string;
	sourceAuthor: string;
	sourceUrl: string;
	context: string;
	suggestedAction: string;
}

// =============================================================================
// Iteration Types
// =============================================================================

export interface IterationResult {
	iteration: number;
	timestamp: string;
	issuesFound: number;
	issuesValidated: number;
	issuesFixed: number;
	issuesDeferred: number;
	ciStatus: "passed" | "failed" | "pending";
	commitSha?: string;
	summary: string;
}

// =============================================================================
// Config Types
// =============================================================================

export interface PrLoopConfig {
	issueTracker: "github" | "linear";
	linearTeamId?: string;
	linearProjectId?: string;
	maxIterations: number;
	ciWaitSeconds: number;
	ciRetrySeconds: number;
}

// =============================================================================
// Issue Creation Types
// =============================================================================

export interface CreateIssueResult {
	tracker: "github" | "linear";
	issueId: string;
	issueNumber?: number;
	url: string;
	title: string;
}
