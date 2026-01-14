/**
 * Demo utility file with intentional issues for testing pr-loop skill
 */

// Intentional: unused variable (lint issue)
const unusedVar = "this should trigger a lint warning";

// Intentional: any type (could be flagged in review)
export function processData(data: any) {
	return data.value;
}

// Intentional: missing return type annotation
export function calculateTotal(items: number[]) {
	let total = 0;
	for (const item of items) {
		total += item;
	}
	return total;
}

// Intentional: console.log left in code
export function debugHelper(msg: string) {
	console.log("DEBUG:", msg);
	return msg.toUpperCase();
}
