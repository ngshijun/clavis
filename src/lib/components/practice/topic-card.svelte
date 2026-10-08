<script lang="ts">
	import { flip } from 'svelte/animate';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { dragHandleZone } from 'svelte-dnd-action';
	import AddField from '#lib/components/rows/add-field.svelte';
	import DragHandle from '#lib/components/rows/drag-handle.svelte';
	import InlineName from '#lib/components/rows/inline-name.svelte';
	import { FLIP_MS, saveOrder } from '#lib/components/rows/reorder.js';
	import RowDelete from '#lib/components/rows/row-delete.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { TopicStages } from '#lib/server/practice.js';
	import { cn } from '#lib/utils.js';

	/**
	 * One topic and its stages, in the order of the pupil's path. The topic
	 * itself is set up on the curriculum page; here its stages are added,
	 * named, ordered and opened.
	 *
	 * A 22px card with an 8px inset, so a stage's row has 14px corners; the row's
	 * own 4px inset leaves 10px ones for what is in it.
	 */
	let { topic, href }: { topic: TopicStages; href: (stageId: string) => string } = $props();

	// The order on screen follows a drag at once and goes back to the stored one when the page reloads.
	let stages = $derived(topic.stages);

	const summary = $derived(
		[
			m.count_stages({ count: topic.stages.length }),
			m.count_questions({
				count: topic.stages.reduce((sum, stage) => sum + stage.questionCount, 0)
			})
		].join(' · ')
	);
</script>

<!-- The id is what the stage page's breadcrumb points at, to land on this topic. -->
<Card.Root id={topic.id} class="@container scroll-mt-page gap-1 rounded-3xl p-2">
	<Card.Header class="gap-0 rounded-none px-2 pt-2 pb-1">
		<Card.Title class="font-semibold">
			<h2>{topic.name}</h2>
		</Card.Title>
		<Card.Description>{summary}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-1 px-0">
		{#if stages.length === 0}
			<p class="px-2 py-1 text-muted-foreground">{m.practice_no_stages()}</p>
		{/if}
		<ol
			aria-label={m.practice_stages_of({ name: topic.name })}
			class="flex flex-col gap-1"
			use:dragHandleZone={{
				items: stages,
				type: `stages:${topic.id}`,
				flipDurationMs: FLIP_MS,
				dropTargetStyle: {}
			}}
			onconsider={(event) => (stages = event.detail.items)}
			onfinalize={(event) => {
				stages = event.detail.items;
				saveOrder({ kind: 'stage', parentId: topic.id }, topic.stages, stages).then(
					(saved) => saved || (stages = topic.stages)
				);
			}}
		>
			{#each stages as stage, index (stage.id)}
				<li
					aria-label={stage.name}
					class="group/row flex min-h-12 items-center gap-1 rounded-xl p-1 hover:bg-background"
					animate:flip={{ duration: FLIP_MS }}
				>
					<DragHandle label={m.row_reorder({ name: stage.name })} />
					<span
						title={m.practice_stage_position()}
						class="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground"
					>
						{index + 1}
					</span>
					<InlineName
						kind="stage"
						id={stage.id}
						name={stage.name}
						class="flex-1"
						textClass="font-medium"
					/>
					<RowDelete target={{ kind: 'stage', id: stage.id, name: stage.name }} />
					<Button
						variant="ghost"
						size="sm"
						href={href(stage.id)}
						class={cn('shrink-0', !stage.questionCount && 'font-normal text-muted-foreground')}
					>
						<!-- A card too narrow for the words keeps the number alone, and leaves the room to the name. -->
						<span class="@max-[30rem]:sr-only">
							{stage.questionCount
								? m.count_questions({ count: stage.questionCount })
								: m.practice_no_questions()}
						</span>
						{#if stage.questionCount}
							<span aria-hidden="true" class="tabular-nums @[30rem]:hidden"
								>{stage.questionCount}</span
							>
						{/if}
						<ChevronRightIcon data-icon="inline-end" />
					</Button>
				</li>
			{/each}
		</ol>

		<AddField
			place={{ kind: 'stage', parentId: topic.id }}
			placeholder={m.practice_add_stage()}
			label={m.practice_add_stage_to({ name: topic.name })}
			class="m-1"
		/>
	</Card.Content>
</Card.Root>
