<script lang="ts">
	import type { Component } from 'svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';

	/** A page whose place is settled and whose content has not been built yet. */
	let {
		icon: Icon,
		title,
		description
	}: { icon: Component; title?: string; description: string } = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon />
		</Empty.Media>
		{#if title}
			<Empty.Title>{title}</Empty.Title>
		{/if}
		<Empty.Description>{description}</Empty.Description>
	</Empty.Header>
</Empty.Root>
