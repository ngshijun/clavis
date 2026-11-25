<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A list's search field. What it says while empty is also its name. It is
	 * sized for a page's toolbar, where it stands first and pushes the rest to
	 * the far end; anywhere else it is given its width.
	 */
	let {
		value = $bindable(),
		placeholder,
		class: className
	}: { value: string; placeholder: string; class?: string } = $props();
</script>

<InputGroup.Root class={cn('me-auto w-80 max-w-full', className)}>
	<InputGroup.Addon>
		<SearchIcon />
	</InputGroup.Addon>
	<InputGroup.Input bind:value type="search" aria-label={placeholder} {placeholder} />
</InputGroup.Root>
