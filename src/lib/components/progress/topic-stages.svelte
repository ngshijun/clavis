<script lang="ts">
	import type { Snippet } from 'svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import ListRow from '#lib/components/app/list-row.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Stage, TopicStages } from '#lib/server/practice.js';

	/**
	 * One topic's stages as a classroom's staff read them: a row for each,
	 * in the order students meet them, ending in what the page has to say of
	 * it. Pressing a row picks its stage; the page says what comes of that.
	 */
	let {
		topic,
		summary,
		tail: stageTail,
		onpick,
		pickable = () => true
	}: {
		topic: TopicStages;
		/** A line under the topic's name. */
		summary?: string;
		/** What a stage's row ends in. */
		tail: Snippet<[Stage]>;
		onpick: (stop: Stop) => void;
		/** Whether a stage has anything to open. */
		pickable?: (stage: Stage) => boolean;
	} = $props();
</script>

<ListCard ordered label={m.practice_stages_of({ name: topic.name })}>
	{#snippet header()}
		<Card.Header class="gap-0 rounded-none px-2 pt-2 pb-1">
			<Card.Title class="font-semibold">
				<h2>{topic.name}</h2>
			</Card.Title>
			{#if summary}
				<Card.Description>{summary}</Card.Description>
			{/if}
		</Card.Header>
	{/snippet}
	{#each topic.stages as stage, index (stage.id)}
		<ListRow
			title={stage.name}
			detail={m.count_questions({ count: stage.questionCount })}
			onclick={pickable(stage) ? () => onpick({ topic, stage, number: index + 1 }) : undefined}
			holdsChevron
		>
			{#snippet lead()}
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground tabular-nums"
				>
					{index + 1}
				</span>
			{/snippet}
			{#snippet tail()}
				{@render stageTail(stage)}
			{/snippet}
		</ListRow>
	{/each}
</ListCard>
