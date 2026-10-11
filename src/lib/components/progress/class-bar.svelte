<script lang="ts" module>
	/**
	 * The parts of the bar, in the order they are drawn: three stars to none,
	 * then the students who have not practised. Gold thins as the stars do.
	 */
	export const SHADES = [
		'bg-star',
		'bg-[color-mix(in_oklab,var(--star)_55%,var(--card))]',
		'bg-[color-mix(in_oklab,var(--star)_25%,var(--card))]',
		'bg-border-strong',
		'border-[1.5px] border-border-strong/60'
	];
</script>

<script lang="ts">
	import type { Tally } from '#lib/items/progress.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A class on one stage, as one bar: a part for the students whose best
	 * earns each number of stars and one for those who have not practised it,
	 * each as wide as its share of the class. It says the counts in words to a
	 * reader that cannot see it.
	 */
	let { tally, class: className }: { tally: Tally; class?: string } = $props();

	const [none, one, two, three] = $derived(tally.stars);
	const parts = $derived([three, two, one, none, tally.unpractised]);
</script>

<span
	role="img"
	aria-label={m.progress_tally({ three, two, one, none, unpractised: tally.unpractised })}
	class={cn('flex h-2.5 w-36 shrink-0 gap-0.5', className)}
>
	{#each parts as count, index (index)}
		{#if count > 0}
			<span class={cn('rounded-full', SHADES[index])} style:flex-grow={count}></span>
		{/if}
	{/each}
</span>
