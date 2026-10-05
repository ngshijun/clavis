import type { ActionResult } from '$app/forms';
import { toast } from 'svelte-sonner';
import { applyInPlace } from '#lib/form-actions.js';
import { m } from '#lib/paraglide/messages.js';

/**
 * Finishes an edit on the curriculum page. Edits are made in place and say
 * nothing when they work, because the page already shows the result. Only a
 * refusal is announced.
 */
export async function settle(result: ActionResult): Promise<void> {
	await applyInPlace(result);
	if (result.type === 'failure') {
		const message = result.data?.message;
		toast.error(typeof message === 'string' ? message : m.error_unexpected());
	}
}
