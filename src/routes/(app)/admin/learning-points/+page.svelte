<script lang="ts">
	import { resolve } from '$app/paths';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import ListRow from '#lib/components/app/list-row.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import SearchField from '#lib/components/app/search-field.svelte';
	import LearningPointFormDialog from '#lib/components/learning-points/learning-point-form-dialog.svelte';
	import type { NamedRow } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { listSections, type LearningPointSummary } from '#lib/learning-points.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * The learning points: what the questions of the bank teach. They are
	 * listed subject by subject, in the curriculum's order, each with the
	 * topics that offer it and how many questions are filed under it. One is
	 * created, edited and deleted here; a question is filed under it in the
	 * stage's builder, or by an import.
	 *
	 * A name is stored in small letters and shown with a capital, as a label is.
	 */
	let { data }: PageProps = $props();

	let search = $state('');
	const lists = $derived(listSections(data.grades, data.points, search));
	const none = $derived(lists.sections.length === 0 && lists.unplaced.length === 0);
	/** Whether there is a topic to give a learning point: without one, none can be made. */
	const hasTopics = $derived(
		data.grades.some((grade) => grade.subjects.some((subject) => subject.topics.length > 0))
	);

	let adding = $state(false);
	let editing = $state<LearningPointSummary>();

	type Target = NamedRow & { questionCount: number };
	let deleteDialog = $state<{ request: (target: Target) => void }>();

	/** A name as it is shown: with a capital at its start. */
	const shown = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
</script>

{#snippet addPoint()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{m.learning_points_add()}
	</Button>
{/snippet}

<!-- A learning point's row: its name, a line about where it is offered, and what is done with it. -->
{#snippet row(point: LearningPointSummary, detail: string)}
	<ListRow title={shown(point.name)} {detail}>
		{#snippet tail()}
			<span class="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
				{point.questionCount
					? m.count_questions({ count: point.questionCount })
					: m.practice_no_questions()}
			</span>
			<span class="flex items-center gap-1">
				<IconButton variant="ghost" label={m.action_edit()} onclick={() => (editing = point)}>
					<PencilIcon />
				</IconButton>
				<IconButton
					variant="ghost"
					label={m.action_delete()}
					onclick={() =>
						deleteDialog?.request({
							kind: 'learning-point',
							id: point.id,
							name: shown(point.name),
							questionCount: point.questionCount
						})}
				>
					<Trash2Icon />
				</IconButton>
			</span>
		{/snippet}
	</ListRow>
{/snippet}

{#if data.points.length > 0}
	<PageToolbar>
		<SearchField bind:value={search} placeholder={m.learning_points_search()} />
		{@render addPoint()}
	</PageToolbar>
{/if}

{#if none}
	{#if data.points.length > 0}
		<!-- The search field above is the way out, so a search with no match offers no button. -->
		<EmptyState icon={TagsIcon} description={m.learning_points_none_found()} />
	{:else}
		<EmptyState
			icon={TagsIcon}
			title={m.learning_points_none_title()}
			description={hasTopics ? m.learning_points_none_description() : m.learning_points_no_topics()}
		>
			{#if hasTopics}
				{@render addPoint()}
			{:else}
				<Button href={resolve('admin/curriculum')}>{m.curriculum_go_to()}</Button>
			{/if}
		</EmptyState>
	{/if}
{:else}
	<!-- A second column only where a row still has room for its name beside what it ends in. -->
	<div
		class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,31rem),1fr))] items-start gap-x-4 gap-y-6"
	>
		{#if lists.unplaced.length > 0}
			<ListCard
				title={m.learning_points_unplaced()}
				count={lists.unplaced.length}
				label={m.learning_points_unplaced()}
			>
				{#each lists.unplaced as point (point.id)}
					{@render row(point, m.learning_points_unplaced_note())}
				{/each}
			</ListCard>
		{/if}

		{#each lists.sections as section (section.id)}
			<ListCard
				title={section.subject}
				count={section.grade}
				label={m.learning_points_of({ name: section.subject })}
			>
				{#each section.rows as { point, topics, elsewhere } (point.id)}
					{@render row(
						point,
						[
							...topics,
							...(elsewhere ? [m.learning_point_elsewhere({ count: elsewhere })] : [])
						].join(' · ')
					)}
				{/each}
			</ListCard>
		{/each}
	</div>
{/if}

{#if adding}
	<LearningPointFormDialog tree={data.grades} onclosed={() => (adding = false)} />
{/if}

{#if editing}
	<LearningPointFormDialog
		point={editing}
		tree={data.grades}
		onclosed={() => (editing = undefined)}
	/>
{/if}

<DeleteDialog
	bind:this={deleteDialog}
	title={(target: Target) => m.row_delete_title({ name: target.name })}
	description={(target) =>
		target.questionCount
			? m.learning_point_delete_used({ count: target.questionCount })
			: m.learning_point_delete_unused()}
/>
