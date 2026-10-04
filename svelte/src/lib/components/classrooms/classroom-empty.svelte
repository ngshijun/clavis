<script lang="ts">
	import type { Snippet } from 'svelte';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import * as Empty from '#lib/components/ui/empty/index.js';

	let {
		title,
		description,
		children
	}: { title?: string; description: string; children?: Snippet } = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<SchoolIcon />
		</Empty.Media>
		{#if title}
			<Empty.Title>{title}</Empty.Title>
		{/if}
		<Empty.Description>{description}</Empty.Description>
	</Empty.Header>
	{#if children}
		<Empty.Content>{@render children()}</Empty.Content>
	{/if}
</Empty.Root>
