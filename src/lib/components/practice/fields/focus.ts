import { tick } from 'svelte';

/** What the keyboard can stand on. */
const FOCUSABLE =
	'input:not(:disabled), textarea:not(:disabled), button:not(:disabled), [role="button"], a[href]';

/** Whether the keyboard's focus is nowhere it can be used from. */
function focusLost(): boolean {
	const active = document.activeElement;
	return (
		!(active instanceof HTMLElement) ||
		active === document.body ||
		!active.isConnected ||
		active.matches(':disabled')
	);
}

/**
 * Takes an entry out of a list in a form, a row or a chip, without dropping
 * the keyboard's focus to the top of the page. If the focus went with what
 * was removed, it goes to the entry that took its place, or to the last one:
 * to its own remove button, so that several can be removed one after another,
 * or else to its first control. With no entry left it goes to `rest`.
 *
 * Entries are the elements marked `data-entry={kind}` inside `scope`, and
 * their remove buttons are marked `data-remove`.
 */
export async function removeKeepingFocus(
	scope: Element | null | undefined,
	kind: 'row' | 'chip',
	remove: () => void,
	rest?: () => HTMLElement | null | undefined
): Promise<void> {
	const entries = () =>
		Array.from(scope?.querySelectorAll<HTMLElement>(`[data-entry="${kind}"]`) ?? []);
	const at = entries().findIndex((entry) => entry.contains(document.activeElement));

	remove();
	await tick();
	if (!focusLost()) return;

	const left = entries();
	const next = left[Math.min(Math.max(at, 0), left.length - 1)];
	const target =
		next?.querySelector<HTMLElement>('[data-remove]:not(:disabled)') ??
		next?.querySelector<HTMLElement>(FOCUSABLE) ??
		rest?.();
	target?.focus();
}
