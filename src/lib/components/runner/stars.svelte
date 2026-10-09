<script lang="ts">
	import type { Stars } from '#lib/items/stars.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import Star from './star.svelte';

	/**
	 * Three stars in a row, as many of them gold as were earned. It says the
	 * count in words to a reader that cannot see it. The size of a star is
	 * given by the class: `[&_svg]:size-…`.
	 */
	let { count, class: className }: { count: Stars; class?: string } = $props();
</script>

<span
	role="img"
	aria-label={m.stars_count({ count })}
	class={cn('inline-flex shrink-0 gap-0.5 [&_svg]:size-4', className)}
>
	{#each [1, 2, 3] as star (star)}
		<Star earned={star <= count} />
	{/each}
</span>
