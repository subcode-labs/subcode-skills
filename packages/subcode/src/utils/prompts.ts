/**
 * Interactive Prompts
 *
 * Wrapper for interactive prompts with headless mode support.
 */

import { consola } from "consola";

export function isHeadless(): boolean {
	return (
		process.env.CI === "true" ||
		process.argv.includes("--yes") ||
		process.argv.includes("-y")
	);
}

export async function confirm(
	message: string,
	defaultValue = true,
): Promise<boolean> {
	if (isHeadless()) {
		return defaultValue;
	}

	return consola.prompt(message, {
		type: "confirm",
		initial: defaultValue,
	}) as Promise<boolean>;
}

export async function select<T extends string>(
	message: string,
	options: { label: string; value: T }[],
): Promise<T> {
	if (isHeadless()) {
		return options[0].value;
	}

	return consola.prompt(message, {
		type: "select",
		options: options.map((o) => ({ label: o.label, value: o.value })),
	}) as Promise<T>;
}

export async function multiselect<T extends string>(
	message: string,
	options: { label: string; value: T; selected?: boolean }[],
): Promise<T[]> {
	if (isHeadless()) {
		// Return all options in headless mode
		return options.map((o) => o.value);
	}

	return consola.prompt(message, {
		type: "multiselect",
		options: options.map((o) => ({
			label: o.label,
			value: o.value,
			initial: o.selected,
		})),
	}) as Promise<T[]>;
}

export async function text(
	message: string,
	defaultValue?: string,
): Promise<string> {
	if (isHeadless() && defaultValue) {
		return defaultValue;
	}

	return consola.prompt(message, {
		type: "text",
		default: defaultValue,
	}) as Promise<string>;
}
