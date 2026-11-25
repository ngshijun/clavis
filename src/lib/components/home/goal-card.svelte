<script lang="ts">
	import Star from '#lib/components/runner/star.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { DAILY_STAR_GOAL } from '#lib/items/gains.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * How far a student is towards the day's goal of new stars, as a gauge
	 * that fills, with what is left to earn said under it. Which day it is
	 * depends on where they are, so the count is undefined until the page is
	 * in their browser, and the gauge is empty until then.
	 */
	let { today }: { today: number | undefined } = $props();

	const left = $derived(DAILY_STAR_GOAL - (today ?? 0));
	/** The gauge is a path a hundred long, so a share of it is a length. */
	const filled = $derived(Math.min(((today ?? 0) / DAILY_STAR_GOAL) * 100, 100));
	const arc = 'M10 60A50 50 0 0 1 110 60';
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.home_goal_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col items-center gap-3 text-center">
		<div class="relative w-44 max-w-full">
			<svg
				viewBox="0 0 120 66"
				fill="none"
				stroke-width="10"
				stroke-linecap="round"
				class="w-full"
				aria-hidden="true"
			>
				<path d={arc} class="stroke-muted" />
				{#if filled > 0}
					<path d={arc} pathLength="100" stroke-dasharray="{filled} 100" class="stroke-star" />
				{/if}
			</svg>
			<p class="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-1.5">
				{#if today !== undefined}
					<span class="sr-only">
						{m.home_goal_figure({ count: today, goal: DAILY_STAR_GOAL })}
					</span>
				{/if}
				<span class="text-3xl leading-none font-bold tabular-nums" aria-hidden="true">
					{today ?? '–'}
				</span>
				<span class="text-base font-medium text-muted-foreground tabular-nums" aria-hidden="true">
					/ {DAILY_STAR_GOAL}
				</span>
				<Star earned class="size-5 self-center" />
			</p>
		</div>
		<!-- Holds its place until the count is known, so the card does not grow when it comes. -->
		<p class="text-muted-foreground">
			{#if today === undefined}
				&nbsp;
			{:else if left > 0}
				{m.home_goal_more({ count: left })}
			{:else}
				{m.home_goal_reached()}
			{/if}
		</p>
	</Card.Content>
</Card.Root>
