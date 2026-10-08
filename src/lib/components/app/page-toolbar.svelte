<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';
	import { scrollRegion, usePinnedToolbar } from './scroll-region.svelte.js';

	/**
	 * A page's toolbar: its search, its filters and its one primary action. It
	 * pins to the top of the scroll region, so the controls stay in reach while
	 * the content scrolls under them, and it carries the scroll edge.
	 */
	let { children }: { children: Snippet } = $props();

	usePinnedToolbar();
</script>

<!-- The bottom margin takes back the page's own gap, so the toolbar's padding is the only space under it. -->
<div
	bind:offsetHeight={scrollRegion.toolbarHeight}
	class={cn(
		'sticky top-0 z-10 -mx-page -mt-page -mb-4 border-b bg-background px-page pt-page pb-4 transition-colors',
		scrollRegion.scrolled ? 'border-border' : 'border-transparent'
	)}
>
	<div class="flex flex-wrap items-center justify-end gap-2">
		{@render children()}
	</div>
</div>
