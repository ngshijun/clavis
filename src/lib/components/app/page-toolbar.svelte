<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';
	import { scrollRegion, usePinned } from './scroll-region.svelte.js';

	/**
	 * A page's toolbar: its search, its filters and its one primary action. It
	 * pins to the top of the scroll region, or under a classroom's tab row where
	 * there is one, so the controls stay in reach while the content scrolls under
	 * them, and it carries the scroll edge.
	 */
	let { children }: { children: Snippet } = $props();

	usePinned();
	onDestroy(() => (scrollRegion.toolbarHeight = 0));
</script>

<!-- The bottom margin takes back the page's own gap, so the toolbar's padding is the only space under it. -->
<div
	bind:offsetHeight={scrollRegion.toolbarHeight}
	style:top="{scrollRegion.tabsHeight}px"
	class={cn(
		'sticky z-10 -mx-gutter -mt-page -mb-4 border-b bg-background px-gutter pt-page pb-4 transition-colors',
		scrollRegion.toolbarStuck ? 'border-border' : 'border-transparent'
	)}
>
	<div class="flex flex-wrap items-center justify-end gap-2">
		{@render children()}
	</div>
</div>
