<script lang="ts">
	import type { Snippet } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TargetIcon from '@lucide/svelte/icons/target';
	import ListRow from '#lib/components/app/list-row.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	/**
	 * One stage in a list of work, assigned or finished: the stage and where
	 * it is from, a line about the work, and what the page has to say of it
	 * at the end.
	 * The whole row leads somewhere when it is given an address or something
	 * to do; otherwise what it ends in holds its own button.
	 */
	let {
		stop,
		done = false,
		href,
		onclick,
		detail: more,
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
</script>

<ListRow title={stop.stage.name} {href} {onclick} {tail}>
	{#snippet lead()}
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
	{/snippet}
	{#snippet detail()}
		{stop.topic.name} · {m.count_questions({ count: stop.stage.questionCount })}
		{#if more}
			· {@render more()}
		{/if}
	{/snippet}
</ListRow>
