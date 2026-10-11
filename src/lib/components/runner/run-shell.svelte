<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	/**
	 * The frame a run is drawn in, while it is answered and once it is marked:
	 * a rail that says where the pupil stands and numbers every question, and
	 * beside it the questions. Where the two do not fit side by side, the rail
	 * goes on top. The frame is held to a width a question reads well at and
	 * stands in the middle of a wider page.
	 */
	let {
		label,
		wide = false,
		rail,
		children,
		footer
	}: {
		/** What the rail is, for a reader that cannot see it. */
		label: string;
		/** Whether what is shown has two things to read side by side, and so takes more of a wide page. */
		wide?: boolean;
		rail: Snippet;
		children: Snippet;
		/** What stays along the bottom of the page: the way on from what is shown. */
		footer?: Snippet;
	} = $props();

	let footHeight = $state(0);
	// Wide enough for two things side by side: `@7xl/run`, which is what they are laid out by too.
	const width = $derived(cn('mx-auto w-full max-w-280', wide && '@7xl/run:max-w-384'));
</script>

<!-- As tall as the page, so the footer rests on the page's bottom edge under a short question too. -->
<div class="@container/run flex flex-1 flex-col gap-4" style:--foot="{footHeight}px">
	<div class={cn('@container', width)}>
		<div class="grid items-start gap-4 @3xl:grid-cols-[17rem_minmax(0,1fr)]">
			<!--
				Beside the questions the rail stays in view as they scroll, under the
				page's toolbar if it has one. It is never taller than what is in view
				(the window less the 3.5rem bar above the page and the footer below):
				a longer one scrolls in itself, its cards at their own height and with
				room for their edges.
			-->
			<aside
				aria-label={label}
				class="flex min-w-0 flex-col gap-3 [--top:max(var(--pinned-toolbar,0px),1rem)] @3xl:sticky @3xl:top-(--top) @3xl:-m-1 @3xl:max-h-[calc(100svh-3.5rem-var(--top)-var(--foot)-0.5rem)] @3xl:overflow-y-auto @3xl:p-1 @3xl:*:shrink-0"
			>
				{@render rail()}
			</aside>
			<div class="flex min-w-0 flex-col gap-4">
				{@render children()}
			</div>
		</div>
	</div>
	{#if footer}
		<!-- Across the whole page, over its padding, with what it holds in line with the frame above. -->
		<div
			bind:offsetHeight={footHeight}
			class="sticky bottom-0 z-10 -mx-page mt-auto -mb-page border-t bg-background px-page py-3"
		>
			<div class={cn('flex items-center justify-end gap-2', width)}>
				{@render footer()}
			</div>
		</div>
	{/if}
</div>
