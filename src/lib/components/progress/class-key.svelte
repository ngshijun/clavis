<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { SHADES } from './class-bar.svelte';

	/** What the parts of a class bar stand for, said once for the page. */
	const names = [
		m.progress_key_stars({ count: 3 }),
		m.progress_key_stars({ count: 2 }),
		m.progress_key_stars({ count: 1 }),
		m.progress_no_star(),
		m.progress_unpractised()
	];
</script>

<p class="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-sm text-muted-foreground">
	{m.progress_key()}
	{#each names as name, index (index)}
		<span class="inline-flex items-center gap-1.5">
			<span class={cn('h-2.5 w-3.5 rounded-full', SHADES[index])} aria-hidden="true"></span>
			{name}
		</span>
	{/each}
</p>
