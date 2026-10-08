<script lang="ts" module>
	/**
	 * The grid cover cards are laid in: as many to a row as fit at a width a
	 * card reads well at, so two cards do not stretch to fill a wide page.
	 */
	export const coverGrid = 'grid grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] gap-4';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '#lib/components/ui/card/index.js';

	/**
	 * Something with a cover, as the way into it: the cover edge to edge, its
	 * name, and a line or two about it. The whole card is the link. Classrooms
	 * and subjects are both drawn with it, so they read as the same kind of
	 * thing wherever they are listed.
	 */
	let {
		href,
		name,
		cover,
		children,
		actions
	}: {
		/** Where the card leads. */
		href: string;
		name: string;
		/** The picture across the top. Give it `aspect-video w-full`. */
		cover: Snippet;
		/** What stands under the name. */
		children?: Snippet;
		/** Controls laid over the cover's corner. */
		actions?: Snippet;
	} = $props();
</script>

<!-- `gap-0 py-0` so the cover sits flush with the card's top and sides, clipped by its corners. -->
<Card.Root
	class="relative h-full gap-0 py-0 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-lg has-[a:active]:translate-y-px"
>
	{@render cover()}

	<Card.Content class="flex flex-col gap-2 py-5">
		<!-- The link's pseudo-element covers the card, so the whole card is one target. -->
		<a
			{href}
			class="min-w-0 text-base leading-tight font-semibold wrap-break-word outline-none after:absolute after:inset-0"
		>
			{name}
		</a>
		{@render children?.()}
	</Card.Content>

	{#if actions}
		<!--
			10px in from the corner: a 32px round button there turns about the same
			centre as the card's own 26px corner.
		-->
		<div class="absolute end-2.5 top-2.5 flex gap-1.5">
			{@render actions()}
		</div>
	{/if}
</Card.Root>
