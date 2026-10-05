import { applyAction, deserialize, type ActionResult } from '$app/forms';
import { refreshAll } from '$app/navigation';

/**
 * Posts to a form action without a form on the page, for a change made by a
 * gesture rather than by typing, such as a drag.
 */
export async function postAction(action: string, body: FormData): Promise<ActionResult> {
	const response = await fetch(action, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	return deserialize(await response.text());
}

/**
 * Brings the page up to date with an action's result for an edit made in
 * place. SvelteKit's own `update` behaves like a page load and takes the focus
 * back to the top of the document, which would pull the cursor out of the
 * field the person is typing a list into. Here the data is loaded again and
 * the focus is left alone. It is loaded again after a refusal too, so the page
 * shows what is stored rather than what was attempted.
 */
export async function applyInPlace(result: ActionResult): Promise<void> {
	if (result.type === 'success' || result.type === 'failure') await refreshAll();
	else await applyAction(result);
}
