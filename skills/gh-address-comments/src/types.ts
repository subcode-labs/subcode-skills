/**
 * Shared TypeScript interfaces for gh-address-comments skill
 */

// Result type (matches existing pattern from lib/utils.ts)
export interface Result<T = unknown> {
	success: boolean;
	action: string;
	data?: T;
	message: string;
	error?: string;
	nextSteps?: string[];
}

// PR metadata
export interface PullRequest {
	number: number;
	title: string;
	url: string;
	state: string;
	owner: string;
	repo: string;
	headRefName: string;
	baseRefName: string;
}

// Individual comment in a review thread
export interface ReviewComment {
	id: string;
	author: string;
	body: string;
	createdAt: string;
	url: string;
}

// Review thread (inline comments on specific code)
export interface ReviewThread {
	id: string;
	path: string;
	line: number | null;
	startLine: number | null;
	isResolved: boolean;
	isOutdated: boolean;
	comments: ReviewComment[];
}

// Top-level PR conversation comment
export interface ConversationComment {
	id: string;
	author: string;
	body: string;
	createdAt: string;
	url: string;
}

// Review submission (Approve/Request Changes/Comment)
export interface Review {
	id: string;
	author: string;
	state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED
	body: string;
	createdAt: string;
	url: string;
}

// Complete fetch result
export interface FetchResult {
	pullRequest: PullRequest;
	reviewThreads: ReviewThread[];
	conversationComments: ConversationComment[];
	reviews: Review[];
	summary: {
		totalThreads: number;
		unresolvedThreads: number;
		totalConversationComments: number;
		totalReviews: number;
	};
}
