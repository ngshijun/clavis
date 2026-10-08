<script lang="ts">
	import { resolve } from '$app/paths';
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import TopicCard from '#lib/components/practice/topic-card.svelte';
	import { setRequestDelete, type NamedRow } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { practiceStagePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * A subject's practice: its topics in the curriculum's order, each with its
	 * stages in the order pupils meet them. A stage is edited where it stands
	 * and opened for its questions.
	 */
	let { data, params }: PageProps = $props();

	let deleteDialog = $state<{ request: (target: NamedRow) => void }>();
	setRequestDelete((target) => deleteDialog?.request(target));
</script>

{#if data.subject.topics.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<ListTreeIcon />
			</Empty.Media>
			<Empty.Title>{m.practice_no_topics_title()}</Empty.Title>
			<Empty.Description>{m.practice_no_topics_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<!--
		A second column only where a card is still wide enough for a stage's name
		to stay on one line beside its controls; until then the cards are stacked.
	-->
	<div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,31rem),1fr))] items-start gap-4">
		{#each data.subject.topics as topic (topic.id)}
			<TopicCard
				{topic}
				href={(stageId) => resolve(practiceStagePath(params.subjectId, stageId))}
			/>
		{/each}
	</div>
{/if}

<DeleteDialog
	bind:this={deleteDialog}
	title={(target: NamedRow) => m.row_delete_title({ name: target.name })}
	description={() => m.practice_delete_stage()}
/>
