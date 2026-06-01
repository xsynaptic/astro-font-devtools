import * as z from 'zod';

const storageKey = 'astro-font-devtools:state';

const selectionSchema = z.object({
	family: z.string(),
	italic: z.boolean().optional(),
	weight: z.number().optional(),
});

const stateSchema = z.object({
	added: z.array(z.string()),
	selections: z.record(z.string(), selectionSchema),
});

export type Selection = z.infer<typeof selectionSchema>;
type State = z.infer<typeof stateSchema>;

export function addedTargets(): Array<string> {
	return loadState().added;
}

export function getSelection(target: string): Selection | undefined {
	return loadState().selections[target];
}

export function removeSelection(target: string): void {
	const state = loadState();
	if (!(target in state.selections)) return;
	state.selections = Object.fromEntries(
		Object.entries(state.selections).filter(([key]) => key !== target),
	);
	saveState(state);
}

export function setSelection(target: string, selection: Selection): void {
	const state = loadState();
	state.selections[target] = selection;
	saveState(state);
}

// Track user-added targets so picks/adds survive reload; re-keys on edit, drops on delete
export function syncAdded(oldTarget: string, newTarget: string): void {
	const state = loadState();
	state.added = state.added.filter((entry) => entry !== oldTarget);
	if (newTarget && !state.added.includes(newTarget)) state.added.push(newTarget);
	saveState(state);
}

function loadState(): State {
	const fallback: State = { added: [], selections: {} };
	const raw = sessionStorage.getItem(storageKey);
	if (!raw) return fallback;
	try {
		const parsed = stateSchema.safeParse(JSON.parse(raw));

		return parsed.success ? parsed.data : fallback;
	} catch {
		return fallback;
	}
}

function saveState(state: State): void {
	try {
		sessionStorage.setItem(storageKey, JSON.stringify(state));
	} catch {
		/* sessionStorage may be unavailable in some contexts */
	}
}
