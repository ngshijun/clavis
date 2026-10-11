<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Stage, TopicStages } from '#lib/server/practice.js';

	/**
	 * One topic's stages as a teacher reads them: a row for each, in the
	 * order students meet them, ending in what the page has to say of it.
	 * Pressing a row picks its stage; the page says what comes of that.
	 *
	 * A 22px card with an 8px inset, so a row has 14px corners.
	 */
	let {
		topic,
		summary,
		tail,
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

<Card.Root class="gap-1 rounded-3xl p-2">
	<Card.Header class="gap-0 rounded-none px-2 pt-2 pb-1">
		<Card.Title class="font-semibold">
			<h2>{topic.name}</h2>
		</Card.Title>
		{#if summary}
			<Card.Description>{summary}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content class="px-0">
		<ol aria-label={m.practice_stages_of({ name: topic.name })} class="flex flex-col divide-y">
			{#each topic.stages as stage, index (stage.id)}
				{@const open = pickable(stage)}
				<li>
					<!-- A narrow card puts what the row ends in on a line of its own, under the name. -->
					<button
						type="button"
						disabled={!open}
						class="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-2 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-background enabled:active:bg-muted"
						onclick={() => onpick({ topic, stage, number: index + 1 })}
					>
						<span
							class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground tabular-nums"
						>
							{index + 1}
						</span>
						<span class="grid min-w-0 flex-[1_1_10rem] leading-snug">
							<span class="font-medium wrap-break-word">{stage.name}</span>
							<span class="text-xs text-muted-foreground">
								{m.count_questions({ count: stage.questionCount })}
							</span>
						</span>
						<span class="ms-auto flex items-center gap-3">
							{@render tail(stage)}
							<ChevronRightIcon
								class={['size-4 shrink-0 text-muted-foreground', !open && 'invisible']}
								aria-hidden="true"
							/>
						</span>
					</button>
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
