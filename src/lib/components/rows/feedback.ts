import type { ActionResult } from '$app/forms';
import { toast } from 'svelte-sonner';
import { applyInPlace, unanswered } from '#lib/form-actions.js';
import { m } from '#lib/paraglide/messages.js';

/** Why an action did not do what was asked, in words for the person; null when it did. */
export function refusal(result: ActionResult): string | null {
	if (result.type === 'failure') {
		const message = result.data?.message;
		return typeof message === 'string' ? message : m.error_unexpected();
	}
	if (result.type === 'error')
		return unanswered(result) ? m.error_unreachable() : m.error_unexpected();
	return null;
}

/**
 * Finishes an edit made in place, and answers whether it went through. Such
 * an edit says nothing when it works, because the page already shows the
 * result. Only a refusal is announced, and so is a request that failed.
 */
export async function settle(result: ActionResult): Promise<boolean> {
	await applyInPlace(result);
	const message = refusal(result);
	if (message) toast.error(message);
	return result.type === 'success';
}
