/**
 * Demo utility file with intentional issues for testing pr-loop skill
 */

interface DataWithValue {
	value: unknown;
}

export function processData(data: DataWithValue): unknown {
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
