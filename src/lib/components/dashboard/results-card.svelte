<script lang="ts">
	import ClassBar, { SHADES } from '#lib/components/progress/class-bar.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { Tally } from '#lib/items/progress.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	/**
	 * Best results on some stages, as the stars they earned: the bar a
	 * classroom's Practice tab draws for one stage, here for many. A teacher's
	 * is every student's best on every stage they have practised; a student's
	 * is their own on every stage, with those they have yet to practise.
	 */
	let {
		tally,
		title,
		description,
		count
	}: {
		tally: Tally;
		title: string;
		description: string;
		/** What stands in the header's corner: how many results the card is of. */
		count?: string;
	} = $props();

	const [none, one, two, three] = $derived(tally.stars);
	const total = $derived(none + one + two + three + tally.unpractised);
	const rows = $derived(
		[
			{ label: m.progress_key_stars({ count: 3 }), count: three },
			{ label: m.progress_key_stars({ count: 2 }), count: two },
			{ label: m.progress_key_stars({ count: 1 }), count: one },
			{ label: m.progress_no_star(), count: none },
			{ label: m.progress_unpractised(), count: tally.unpractised }
		]
			.map((row, index) => ({ ...row, shade: SHADES[index] }))
			// Where every stage counted has been practised, there is no such row to show.
			.filter((row, index) => index < 4 || row.count > 0)
	);
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
		{#if count}
			<Card.Action class="text-xs text-muted-foreground">{count}</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if total === 0}
			<p class="text-muted-foreground">{m.dashboard_practice_empty()}</p>
		{:else}
			<ClassBar {tally} class="w-full" />
			<ul class="flex flex-col gap-1.5">
				{#each rows as row (row.label)}
					<li class="flex items-center gap-2">
						<span class={cn('h-2.5 w-3.5 rounded-full', row.shade)} aria-hidden="true"></span>
						<span class="flex-1">{row.label}</span>
						<span class="font-semibold tabular-nums">{Math.round((row.count / total) * 100)}%</span>
						<span class="w-8 text-end text-xs text-muted-foreground tabular-nums">{row.count}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
