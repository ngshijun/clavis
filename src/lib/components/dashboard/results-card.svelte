<script lang="ts">
	import ClassBar, { SHADES } from '#lib/components/progress/class-bar.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { Tally } from '#lib/items/progress.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	/**
	 * Every student's best on every stage they have practised, as the stars
	 * it earned: the bar a classroom's Practice tab draws for one stage, here
	 * for all of them.
	 */
	let { tally }: { tally: Tally } = $props();

	const [none, one, two, three] = $derived(tally.stars);
	const total = $derived(none + one + two + three);
	const rows = $derived([
		{ label: m.progress_key_stars({ count: 3 }), count: three },
		{ label: m.progress_key_stars({ count: 2 }), count: two },
		{ label: m.progress_key_stars({ count: 1 }), count: one },
		{ label: m.progress_no_star(), count: none }
	]);
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.progress_best_results()}</Card.Title>
		<Card.Description>{m.dashboard_results_description()}</Card.Description>
		{#if total > 0}
			<Card.Action class="text-xs text-muted-foreground">
				{m.dashboard_results_count({ count: total })}
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if total === 0}
			<p class="text-muted-foreground">{m.dashboard_practice_empty()}</p>
		{:else}
			<ClassBar {tally} class="w-full" />
			<ul class="flex flex-col gap-1.5">
				{#each rows as row, index (row.label)}
					<li class="flex items-center gap-2">
						<span class={cn('h-2.5 w-3.5 rounded-full', SHADES[index])} aria-hidden="true"></span>
						<span class="flex-1">{row.label}</span>
						<span class="font-semibold tabular-nums">{Math.round((row.count / total) * 100)}%</span>
						<span class="w-8 text-end text-xs text-muted-foreground tabular-nums">{row.count}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
