import { postAction } from '#lib/form-actions.js';
import type { Placement } from '#lib/server/curriculum.js';
import { settle } from './feedback.js';

/** How long rows take to make room for the one being dragged. */
export const FLIP_MS = 150;

/** Saves the order a drag left the rows in, unless it left them where they were. */
export async function saveOrder(
	place: Placement,
	before: { id: string }[],
	after: { id: string }[]
) {
	const ids = after.map((row) => row.id);
	if (ids.join() === before.map((row) => row.id).join()) return;

	const form = new FormData();
	form.set('kind', place.kind);
	if (place.kind !== 'grade') form.set('parentId', place.parentId);
	for (const id of ids) form.append('ids', id);
	await settle(await postAction('?/reorder', form));
}
