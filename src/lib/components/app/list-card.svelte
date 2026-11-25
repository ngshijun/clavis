<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '#lib/components/ui/card/index.js';

	/**
	 * A list on a page: a white card of rows with hairlines between them. Its
	 * rows are `ListRow`s. A list that is one section of a page has its name
	 * above the card, with how many are in it; a card that is about one thing
	 * (a topic) is given a header of its own instead, inside it.
	 *
	 * A 22px card with an 8px inset, so a row has 14px corners.
	 */
	let {
		title,
		count,
		label,
		ordered = false,
		header,
		children
	}: {
		/** The section's heading, above the card. */
		title?: string;
		/** What stands muted beside the heading: how many rows, or a word about them. */
		count?: number | string;
		/** The list's name for a reader that cannot see it. */
		label?: string;
		/** Whether the order of the rows means something. */
		ordered?: boolean;
		/** The card's own header, inside it and above the rows. */
		header?: Snippet;
		children: Snippet;
	} = $props();
</script>

{#snippet card()}
	<Card.Root class="gap-1 rounded-3xl p-2">
		{@render header?.()}
		<svelte:element this={ordered ? 'ol' : 'ul'} aria-label={label} class="flex flex-col divide-y">
			{@render children()}
		</svelte:element>
	</Card.Root>
{/snippet}

{#if title}
	<section class="flex flex-col gap-2">
		<h2 class="px-2 text-lg font-semibold">
			{title}
			{#if count !== undefined}
				<span class="ms-1 text-sm font-medium text-muted-foreground tabular-nums">{count}</span>
			{/if}
		</h2>
		{@render card()}
	</section>
{:else}
	{@render card()}
{/if}
