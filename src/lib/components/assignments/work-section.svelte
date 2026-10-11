<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '#lib/components/ui/card/index.js';

	/**
	 * One list of assigned work under its name, with how many are in it. Its
	 * rows are `WorkRow`s.
	 *
	 * A 22px card with an 8px inset, so a row has 14px corners.
	 */
	let { title, count, children }: { title: string; count: number; children: Snippet } = $props();
</script>

<section class="flex flex-col gap-2">
	<h2 class="px-2 font-semibold">
		{title}
		<span class="ms-1 text-sm font-medium text-muted-foreground tabular-nums">{count}</span>
	</h2>
	<Card.Root class="rounded-3xl p-2">
		<ul class="flex flex-col divide-y">
			{@render children()}
		</ul>
	</Card.Root>
</section>
