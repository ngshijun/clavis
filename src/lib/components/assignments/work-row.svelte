<script lang="ts">
	import type { Snippet } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TargetIcon from '@lucide/svelte/icons/target';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	/**
	 * One assigned stage in a list: the stage and where it is from, a line
	 * about the assignment, and what the page has to say of it at the end.
	 * The whole row leads somewhere when it is given an address or something
	 * to do; otherwise what it ends in holds its own button.
	 */
	let {
		stop,
		done = false,
		href,
		onclick,
		detail,
		tail
	}: {
		stop: Stop;
		/** Whether the work is finished, which its icon says. */
		done?: boolean;
		href?: string;
		onclick?: () => void;
		/** What follows the topic and the number of questions on the row's second line. */
		detail?: Snippet;
		/** What the row ends in. */
		tail: Snippet;
	} = $props();

	const row =
		'flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-2 text-start';
	const pressable =
		'outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted';
</script>

{#snippet content()}
	<span
		class={cn(
			'flex size-9 shrink-0 items-center justify-center rounded-full',
			done ? 'bg-success/10 text-success' : 'bg-accent text-accent-foreground'
		)}
	>
		{#if done}
			<CheckIcon class="size-4.5" strokeWidth={2.5} aria-hidden="true" />
		{:else}
			<TargetIcon class="size-4.5" aria-hidden="true" />
		{/if}
	</span>
	<span class="grid min-w-0 flex-[1_1_14rem] leading-snug">
		<span class="font-medium wrap-break-word">{stop.stage.name}</span>
		<span class="text-xs text-muted-foreground">
			{stop.topic.name} · {m.count_questions({ count: stop.stage.questionCount })}
			{#if detail}
				· {@render detail()}
			{/if}
		</span>
	</span>
	<!-- A narrow card puts what the row ends in on a line of its own, under the name. -->
	<span class="ms-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
		{@render tail()}
	</span>
{/snippet}

<li>
	{#if href}
		<a {href} class={cn(row, pressable)}>{@render content()}</a>
	{:else if onclick}
		<button type="button" class={cn(row, pressable)} {onclick}>{@render content()}</button>
	{:else}
		<div class={row}>{@render content()}</div>
	{/if}
</li>
