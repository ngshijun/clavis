<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The frame a run is drawn in, while it is answered and once it is marked:
	 * a rail that says where the pupil stands and numbers every question, and
	 * beside it the questions. Where the two do not fit side by side, the rail
	 * goes on top.
	 */
	let {
		label,
		rail,
		children
	}: {
		/** What the rail is, for a reader that cannot see it. */
		label: string;
		rail: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="@container mx-auto w-full max-w-280">
	<div class="grid items-start gap-4 @3xl:grid-cols-[17rem_minmax(0,1fr)]">
		<!--
			Beside the questions the rail stays in view as they scroll, under the
			page's toolbar if it has one. It is never taller than what is in view
			(the window less the 3.5rem bar above the page): a longer one scrolls
			in itself, its cards at their own height and with room for their edges.
		-->
		<aside
			aria-label={label}
			class="flex min-w-0 flex-col gap-3 [--top:max(var(--pinned-toolbar,0px),1rem)] @3xl:sticky @3xl:top-(--top) @3xl:-m-1 @3xl:max-h-[calc(100svh-3.5rem-var(--top)-0.5rem)] @3xl:overflow-y-auto @3xl:p-1 @3xl:*:shrink-0"
		>
			{@render rail()}
		</aside>
		<div class="flex min-w-0 flex-col gap-4">
			{@render children()}
		</div>
	</div>
</div>
