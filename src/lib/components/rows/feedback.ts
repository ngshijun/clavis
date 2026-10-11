import type { ActionResult } from '$app/forms';
import { toast } from 'svelte-sonner';
import { applyInPlace, unanswered } from '#lib/form-actions.js';
import { m } from '#lib/paraglide/messages.js';

/** How long a toast that has to be read through, or that offers Undo, stays up. */
export const LONG_TOAST = 10_000;

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
 * Says that something on the page did not go through. It stays up longer than
 * a report of success, since it is a sentence to read and may ask for
 * something to be done.
 */
export function toastError(message: string): void {
	toast.error(message, { duration: LONG_TOAST });
}

/**
 * Finishes an edit made in place, and answers whether it went through. Such
 * an edit says nothing when it works, because the page already shows the
 * result. Only a refusal is announced, and so is a request that failed.
 */
export async function settle(result: ActionResult): Promise<boolean> {
	await applyInPlace(result);
	const message = refusal(result);
	if (message) toastError(message);
	return result.type === 'success';
}

export type FieldErrors = Record<string, string[] | undefined>;

/**
 * Finishes a form posted from a dialog, and answers what the dialog is to
 * show when it was not taken: the errors of its fields, and a sentence for
 * whatever no field accounts for. Both are shown in the dialog, which stays
 * open with what was typed, rather than in a toast that would appear behind
 * it and leave on a timer. Null when the form went through.
 */
export async function settleForm(
	result: ActionResult
): Promise<{ errors: FieldErrors; message: string | null } | null> {
	await applyInPlace(result);
	if (result.type === 'success' || result.type === 'redirect') return null;
	const data = result.type === 'failure' ? result.data : undefined;
	const errors = (data?.errors as FieldErrors | undefined) ?? {};
	// Errors the fields show need no sentence above them, unless the server sent one as well.
	const shown = Object.keys(errors).length > 0 && typeof data?.message !== 'string';
	return { errors, message: shown ? null : refusal(result) };
}
