import { createContext } from 'svelte';
import type { Kind } from '#lib/server/curriculum.js';

export interface DeleteTarget {
	kind: Kind;
	id: string;
	name: string;
}

/**
 * Asks the page to confirm a delete. Every row can be deleted, at three levels
 * of nesting, and one dialog on the page answers for all of them.
 */
export const [getRequestDelete, setRequestDelete] = createContext<(target: DeleteTarget) => void>();
