<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { cn } from '#lib/utils.js';

	/**
	 * One row of a list: what it starts with, a name with a line under it,
	 * and what it ends in.
	 * The whole row leads somewhere when it is given an address or something
	 * to do, and then ends in a chevron; otherwise what it ends in holds its
	 * own buttons.
	 */
	let {
		title,
		detail,
		href,
		onclick,
		holdsChevron = false,
		lead,
		tail,
		class: className
	}: {
		title: string;
		/** The row's second line. */
		detail?: string | Snippet | null;
		href?: string;
		onclick?: () => void;
		/**
		 * Keeps the chevron's room in a row that leads nowhere, so that what the
		 * rows end in lines up down a list where only some of them open.
		 */
		holdsChevron?: boolean;
		/** What the row starts with: a picture, an icon or a number. */
		lead?: Snippet;
		/** What the row ends in. */
		tail?: Snippet;
		class?: string;
	} = $props();

	const pressable = $derived(Boolean(href || onclick));
	const row = $derived(
		cn(
			'flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-2 text-start',
			pressable &&
				'outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted',
			className
		)
	);
</script>

{#snippet content()}
	{@render lead?.()}
	<span class="grid min-w-0 flex-[1_1_10rem] leading-snug wrap-break-word">
		<span class="font-medium">{title}</span>
		{#if detail}
			<span class="text-xs text-muted-foreground">
				{#if typeof detail === 'string'}{detail}{:else}{@render detail()}{/if}
			</span>
		{/if}
	</span>
	{#if tail || pressable || holdsChevron}
		<!--
			A narrow card puts what the row ends in on a line of its own, under the name. It is
			never squeezed: where a row is kept to one line, the name is what gives way.
		-->
		<span
			class="ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1"
		>
			{@render tail?.()}
			{#if pressable || holdsChevron}
				<ChevronRightIcon
					class={['size-4 shrink-0 text-muted-foreground', !pressable && 'invisible']}
					aria-hidden="true"
				/>
			{/if}
		</span>
	{/if}
{/snippet}

<li>
	{#if href}
		<a {href} class={row}>{@render content()}</a>
	{:else if onclick}
		<button type="button" class={row} {onclick}>{@render content()}</button>
	{:else}
		<div class={row}>{@render content()}</div>
	{/if}
</li>
