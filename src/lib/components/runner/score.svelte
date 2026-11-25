<script lang="ts">
	import { markFigure } from '#lib/items/run.js';
	import { starsOf } from '#lib/items/stars.js';
	import { m } from '#lib/paraglide/messages.js';
	import StarsRow from './stars.svelte';

	/**
	 * What a practice scored, as a row says it: the marks out of the total,
	 * then the stars they earned. Without a score it is a dash and three
	 * empty stars, so a list of them still lines up.
	 */
	let { score }: { score: { marks: number; total: number } | null | undefined } = $props();
</script>

<span class="inline-flex shrink-0 items-center gap-3">
	{#if score}
		<span class="font-semibold tabular-nums">
			<span class="sr-only">
				{m.stars_score({ marks: markFigure(score.marks), total: score.total })}
			</span>
			<span aria-hidden="true">{markFigure(score.marks)}/{score.total}</span>
		</span>
	{:else}
		<span class="text-muted-foreground" aria-hidden="true">—</span>
	{/if}
	<StarsRow count={score ? starsOf(score.marks, score.total) : 0} class="[&_svg]:size-5" />
</span>
