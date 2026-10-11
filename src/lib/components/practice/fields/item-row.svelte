<script lang="ts">
	import type { Snippet } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { removeKeepingFocus } from './focus.js';
	import Issue from './issue.svelte';

	/**
	 * One row of a list in a form: its controls in a line, a button that
	 * removes it, and beneath them what is wrong with the row and anything that
	 * belongs to it.
	 */
	let {
		children,
		below,
		error,
		removeLabel,
		onremove
	}: {
		/** The row's controls, left to right. */
		children: Snippet;
		/** What sits under the row and belongs to it, such as a wrong option's tip. */
		below?: Snippet;
		/** What is wrong with the row: `editor.issue('options', index, 'text')`. */
		error?: string;
		/** Names the row being removed: "Remove option B". */
		removeLabel: string;
		/** Leave it out for a row that cannot be removed; the button is then disabled. */
		onremove?: () => void;
	} = $props();

	let row = $state<HTMLElement>();
</script>

<div bind:this={row} data-entry="row" class="flex flex-col gap-1">
	<div class="flex items-center gap-1.5">
		{@render children()}
		<IconButton
			variant="ghost"
			data-remove
			label={removeLabel}
			class="shrink-0 text-muted-foreground"
			disabled={!onremove}
			onclick={() =>
				onremove &&
				// The rows of one field are one list: the focus stays among them.
				removeKeepingFocus(row?.closest('[data-slot="field"]'), 'row', onremove)}
		>
			<XIcon />
		</IconButton>
	</div>
	<Issue message={error} />
	{@render below?.()}
</div>
