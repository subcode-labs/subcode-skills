/**
 * Skill Installer
 *
 * Downloads and installs skills from the registry.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { type SkillDefinition, getSkillUrl } from "./registry";
import { spawnInherit } from "./spawn";

const SKILLS_DIR = ".claude/skills";

export function getSkillsDir(repoRoot: string): string {
	return join(repoRoot, SKILLS_DIR);
}

export function getSkillDir(repoRoot: string, skillName: string): string {
	return join(repoRoot, SKILLS_DIR, skillName);
}

export function isSkillInstalled(repoRoot: string, skillName: string): boolean {
	const skillDir = getSkillDir(repoRoot, skillName);
	return existsSync(join(skillDir, "package.json"));
}

export function getInstalledSkills(repoRoot: string): string[] {
	const skillsDir = getSkillsDir(repoRoot);

	if (!existsSync(skillsDir)) {
		return [];
	}

	const entries = readdirSync(skillsDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.filter((entry) => existsSync(join(skillsDir, entry.name, "package.json")))
		.map((entry) => entry.name);
}

async function downloadFile(url: string): Promise<string> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status}`);
	}

	return response.text();
}

export async function installSkill(
	repoRoot: string,
	skill: SkillDefinition,
): Promise<void> {
	const skillDir = getSkillDir(repoRoot, skill.name);

	consola.info(`Installing skill: ${skill.name}`);

	// Create skill directory structure
	mkdirSync(join(skillDir, "src"), { recursive: true });
	mkdirSync(join(skillDir, "references"), { recursive: true });

	// Download each file
	for (const file of skill.files) {
		const url = getSkillUrl(skill.name, file);
		const destPath = join(skillDir, file);

		try {
			const content = await downloadFile(url);

			// Ensure parent directory exists
			const parentDir = dirname(destPath);
			if (!existsSync(parentDir)) {
				mkdirSync(parentDir, { recursive: true });
			}

			writeFileSync(destPath, content);
			consola.success(`  Downloaded: ${file}`);
		} catch (error) {
			consola.warn(`  Failed to download: ${file}`);
		}
	}

	// Run bun install
	if (existsSync(join(skillDir, "package.json"))) {
		consola.info("Installing skill dependencies...");
		await spawnInherit("bun", ["install", "--silent"], skillDir);
	}

	consola.success(`Installed: ${skill.name}`);
}

export async function removeSkill(
	repoRoot: string,
	skillName: string,
): Promise<void> {
	const skillDir = getSkillDir(repoRoot, skillName);

	if (!existsSync(skillDir)) {
		throw new Error(`Skill not installed: ${skillName}`);
	}

	rmSync(skillDir, { recursive: true, force: true });
	consola.success(`Removed: ${skillName}`);
}

export async function updateSkill(
	repoRoot: string,
	skill: SkillDefinition,
): Promise<void> {
	// Simply re-download all files
	await installSkill(repoRoot, skill);
}
