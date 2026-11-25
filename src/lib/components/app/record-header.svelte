<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { initials } from '#lib/initials.js';

	/**
	 * What heads a page about one record, a student or an assignment: its
	 * name, a line about it, and what can be done to it at the far end. A
	 * person's starts with their initials, where a picture would be.
	 */
	let {
		name,
		avatar = false,
		detail,
		actions
	}: {
		name: string;
		/** Whether the record is a person, who is shown by their initials. */
		avatar?: boolean;
		/** The line under the name. */
		detail?: string | Snippet | null;
		/** The record's own actions: the rare ones, in a More menu. */
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-2">
	{#if avatar}
		<Avatar.Root class="size-12">
			<Avatar.Fallback>{initials(name)}</Avatar.Fallback>
		</Avatar.Root>
	{/if}
	<div class="grid min-w-0 flex-[1_1_12rem]">
		<h2 class="text-xl font-semibold wrap-break-word">{name}</h2>
		{#if detail}
			<p class="text-sm wrap-break-word text-muted-foreground">
				{#if typeof detail === 'string'}{detail}{:else}{@render detail()}{/if}
			</p>
		{/if}
	</div>
	{@render actions?.()}
</div>
