<script lang="ts" module>
	/** One of a strip's figures: a number, perhaps out of a total, or the day something happened. */
	export type Stat = { label: string } & (
		{ value: number; of?: number } | { day: string | undefined }
	);
</script>

<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import Day from './day.svelte';

	/**
	 * A page's headline numbers as one strip: a single card divided into equal
	 * segments, so the row spans the page whatever the count. Each number sits in
	 * a fixed place under its name, and a zero is a quiet zero, never a message.
	 * A day that never came is a dash.
	 */
	let { stats }: { stats: Stat[] } = $props();
</script>

<Card.Root class="py-0">
	<dl class="grid divide-y sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
		{#each stats as stat (stat.label)}
			{@const quiet = 'day' in stat ? !stat.day : stat.value === 0}
			<div class="flex flex-col gap-1 px-6 py-5">
				<dt class="text-sm text-muted-foreground">{stat.label}</dt>
				<dd class={cn('text-3xl font-semibold tabular-nums', quiet && 'text-muted-foreground')}>
					{#if 'day' in stat}
						{#if stat.day}
							<Day at={stat.day} class="inline-block first-letter:uppercase" />
						{:else}
							—
						{/if}
					{:else}
						{stat.value}
						{#if stat.of !== undefined}
							<span class="text-base font-medium text-muted-foreground">
								{m.count_of({ count: stat.of })}
							</span>
						{/if}
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</Card.Root>
