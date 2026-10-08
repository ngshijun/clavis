<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A page's headline numbers as one strip: a single card divided into equal
	 * segments, so the row spans the page whatever the count. Each number sits in
	 * a fixed place under its name, and a zero is a quiet zero, never a message.
	 */
	let { stats }: { stats: { label: string; value: number }[] } = $props();
</script>

<Card.Root class="py-0">
	<dl class="grid divide-y sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
		{#each stats as stat (stat.label)}
			<div class="flex flex-col gap-1 px-6 py-5">
				<dt class="text-sm text-muted-foreground">{stat.label}</dt>
				<dd
					class={cn(
						'text-3xl font-semibold tabular-nums',
						stat.value === 0 && 'text-muted-foreground'
					)}
				>
					{stat.value}
				</dd>
			</div>
		{/each}
	</dl>
</Card.Root>
