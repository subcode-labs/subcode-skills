/**
 * Skill Registry
 *
 * Hardcoded skill definitions for MVP. Can be expanded to fetch from remote.
 */

export interface SkillDefinition {
	name: string;
	description: string;
	version: string;
	files: string[];
}

export const SKILL_REGISTRY: Record<string, SkillDefinition> = {
	"subcode-worktrees": {
		name: "subcode-worktrees",
		description: "Git worktree management with best practices",
		version: "0.1.0",
		files: [
			"SKILL.md",
			"package.json",
			"src/init.ts",
			"src/create.ts",
			"src/remove.ts",
			"src/list.ts",
			"src/prune.ts",
			"references/worktree-patterns.md",
		],
	},
	"gh-address-comments": {
		name: "gh-address-comments",
		description: "Address GitHub PR review comments",
		version: "0.1.0",
		files: ["SKILL.md", "package.json", "src/fetch.ts", "src/types.ts"],
	},
	"subcode-pr-loop": {
		name: "subcode-pr-loop",
		description: "Autonomous PR improvement agent",
		version: "0.1.0",
		files: [
			"SKILL.md",
			"package.json",
			"src/types.ts",
			"src/fetch-status.ts",
			"src/check-ci.ts",
			"src/post-comment.ts",
			"src/create-issue.ts",
		],
	},
};

export const REPO_BASE_URL =
	"https://raw.githubusercontent.com/subcode-labs/subcode-skills/main";

export function getSkillUrl(skillName: string, file: string): string {
	return `${REPO_BASE_URL}/skills/${skillName}/${file}`;
}

export function getAvailableSkills(): SkillDefinition[] {
	return Object.values(SKILL_REGISTRY);
}

export function getSkill(name: string): SkillDefinition | undefined {
	// Support shorthand names (e.g., "worktrees" -> "subcode-worktrees")
	if (SKILL_REGISTRY[name]) {
		return SKILL_REGISTRY[name];
	}

	const prefixedName = `subcode-${name}`;
	if (SKILL_REGISTRY[prefixedName]) {
		return SKILL_REGISTRY[prefixedName];
	}

	return undefined;
}

export function resolveSkillName(name: string): string | undefined {
	if (SKILL_REGISTRY[name]) {
		return name;
	}

	const prefixedName = `subcode-${name}`;
	if (SKILL_REGISTRY[prefixedName]) {
		return prefixedName;
	}

	return undefined;
}
