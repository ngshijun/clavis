import { applyAction, deserialize, type ActionResult } from '$app/forms';
import { refreshAll } from '$app/navigation';

/**
 * Posts to a form action without a form on the page, for a change made by a
 * gesture rather than by typing, such as a drag.
 *
 * It always answers, with a result shaped as `use:enhance` shapes its own. A
 * refusal or an error the server answered with carries the answer's status. A
 * request that got no answer, because the connection dropped or what came
 * back was not an action's result, is an error with no status, so whoever
 * posted can put the page right and say so instead of waiting for ever.
 */
export async function postAction(action: string, body: FormData): Promise<ActionResult> {
	try {
		const response = await fetch(action, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'error' || result.type === 'failure') result.status = response.status;
		return result;
	} catch {
		return { type: 'error', error: { status: 500, message: 'The request was not answered' } };
	}
}

/** Whether an action's result is of a request the server never answered. */
export function unanswered(result: ActionResult): boolean {
	return result.type === 'error' && result.status === undefined;
}

/**
 * Brings the page up to date with an action's result for an edit made in
 * place. SvelteKit's own `update` behaves like a page load and takes the focus
 * back to the top of the document, which would pull the cursor out of the
 * field the person is typing a list into, and it replaces the page with the
 * error page when the action failed, which would throw away what is being
 * written. Here the data is loaded again and the page and its focus are left
 * alone. It is loaded again after a refusal too, so the page shows what is
 * stored rather than what was attempted; only when the server could not be
 * reached is there nothing to load.
 */
export async function applyInPlace(result: ActionResult): Promise<void> {
	if (result.type === 'redirect') await applyAction(result);
	else if (!unanswered(result)) await refreshAll();
}
