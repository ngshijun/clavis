import { createContext } from 'svelte';

/**
 * Rows edited where they stand: named, renamed, reordered, given a cover and
 * deleted without leaving the page. A row is addressed by its kind and its id,
 * and the page it is on answers with the form actions `add`, `rename`,
 * `reorder`, `cover` and `delete`, which read those two fields.
 */

/** A kind of row and, where rows of that kind sit under another row, that row. */
export interface Placement {
	kind: string;
	parentId?: string;
}

/** What a delete is asked of: the row the page's `delete` action is told to remove. */
export interface DeleteTarget {
	kind: string;
	id: string;
}

/** A row that has a name, which the confirmation of its delete says. */
export interface NamedRow extends DeleteTarget {
	name: string;
}

/**
 * Asks the page to confirm a delete. Every row can be deleted, at any depth,
 * and one dialog on the page answers for all of them.
 */
export const [getRequestDelete, setRequestDelete] = createContext<(target: NamedRow) => void>();
