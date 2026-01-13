// biome-ignore lint/suspicious/noExplicitAny: citty's CommandDef types are complex with generics
type LazyCommand = () => Promise<any>;

export const commands: Record<string, LazyCommand> = {
	init: () => import("./init").then((m) => m.default),
	add: () => import("./add").then((m) => m.default),
	remove: () => import("./remove").then((m) => m.default),
	list: () => import("./list").then((m) => m.default),
	update: () => import("./update").then((m) => m.default),
	doctor: () => import("./doctor").then((m) => m.default),
};
