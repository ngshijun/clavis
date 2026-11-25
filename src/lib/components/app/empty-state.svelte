<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';

	/**
	 * A page with nothing on it yet: an icon, what is missing, a sentence
	 * about it, and the way forward when there is one. A search with no match
	 * is the sentence alone: the search field is its way out.
	 */
	let {
		icon: Icon,
		title,
		description,
		children
	}: {
		icon: Component;
		title?: string;
		description: string;
		/** The way forward: the page's main action, or a link to where the thing is set up. */
		children?: Snippet;
	} = $props();
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
	{#if children}
		<Empty.Content>{@render children()}</Empty.Content>
	{/if}
</Empty.Root>
