<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import LearningPointFormDialog from '#lib/components/learning-points/learning-point-form-dialog.svelte';
	import type { NamedRow } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
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
	<li class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-2">
		<span class="grid min-w-0 flex-[1_1_14rem] leading-snug">
			<span class="font-medium wrap-break-word first-letter:uppercase">{point.name}</span>
			<span class="text-xs text-muted-foreground">{detail}</span>
		</span>
		<span class="ms-auto flex items-center gap-1">
			<span class="me-2 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
				{point.questionCount
					? m.count_questions({ count: point.questionCount })
					: m.practice_no_questions()}
			</span>
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
	</li>
{/snippet}

{#if data.points.length > 0}
	<PageToolbar>
		<InputGroup.Root class="me-auto w-80 max-w-full">
			<InputGroup.Addon>
				<SearchIcon />
			</InputGroup.Addon>
			<InputGroup.Input
				bind:value={search}
				type="search"
				aria-label={m.learning_points_search()}
				placeholder={m.learning_points_search()}
			/>
		</InputGroup.Root>
		{@render addPoint()}
	</PageToolbar>
{/if}

{#if none}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<TagsIcon />
			</Empty.Media>
			{#if data.points.length > 0}
				<!-- The search field above is the way out, so a search with no match offers no button. -->
				<Empty.Description>{m.learning_points_none_found()}</Empty.Description>
			{:else}
				<Empty.Title>{m.learning_points_none_title()}</Empty.Title>
				<Empty.Description>
					{hasTopics ? m.learning_points_none_description() : m.learning_points_no_topics()}
				</Empty.Description>
			{/if}
		</Empty.Header>
		{#if data.points.length === 0 && hasTopics}
			<Empty.Content>{@render addPoint()}</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<!--
		A 22px card with an 8px inset, so a row has 14px corners. A second column only where a
		row still has room for its name beside what it ends in.
	-->
	<div
		class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,31rem),1fr))] items-start gap-x-4 gap-y-6"
	>
		{#if lists.unplaced.length > 0}
			<section class="flex flex-col gap-2">
				<h2 class="px-2 font-semibold">
					{m.learning_points_unplaced()}
					<span class="ms-1 text-sm font-medium text-muted-foreground tabular-nums">
						{lists.unplaced.length}
					</span>
				</h2>
				<Card.Root class="rounded-3xl p-2">
					<ul aria-label={m.learning_points_unplaced()} class="flex flex-col divide-y">
						{#each lists.unplaced as point (point.id)}
							{@render row(point, m.learning_points_unplaced_note())}
						{/each}
					</ul>
				</Card.Root>
			</section>
		{/if}

		{#each lists.sections as section (section.id)}
			<section class="flex flex-col gap-2">
				<h2 class="px-2 font-semibold">
					{section.subject}
					<span class="ms-1 text-sm font-medium text-muted-foreground">{section.grade}</span>
				</h2>
				<Card.Root class="rounded-3xl p-2">
					<ul
						aria-label={m.learning_points_of({ name: section.subject })}
						class="flex flex-col divide-y"
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
					</ul>
				</Card.Root>
			</section>
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
