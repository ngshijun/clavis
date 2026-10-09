<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import Day from '#lib/components/app/day.svelte';
	import DueBadge from '#lib/components/assignments/due-badge.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import WorkSection from '#lib/components/assignments/work-section.svelte';
	import { stopsOf } from '#lib/components/runner/stage-path.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { byDue } from '#lib/items/assignments.js';
	import { assignmentPath, classroomPracticePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * A classroom's first page for its teacher: what has been assigned there
	 * and how far each assignment has got. One is in progress until every
	 * student it was given to has done it. Assigning starts from a stage on
	 * the Practice tab, so this page has no button for it.
	 */
	let { data, params }: PageProps = $props();

	const stops = $derived(stopsOf(data.topics));
	// An assignment of a stage that has since lost its every question cannot be done, and is not listed.
	const work = $derived(
		data.assignments.flatMap((assignment) => {
			const stop = stops[assignment.stageId];
			if (!stop) return [];
			const done = assignment.students.filter((student) => student.doneAt).length;
			return [{ assignment, stop, done, count: assignment.students.length }];
		})
	);
	const open = $derived(
		work.filter((each) => each.done < each.count).sort((a, b) => byDue(a.assignment, b.assignment))
	);
	const finished = $derived(work.filter((each) => each.done === each.count));
</script>

{#snippet row({ assignment, stop, done, count }: (typeof work)[number])}
	<WorkRow
		{stop}
		done={done === count}
		href={resolvePath(assignmentPath(params.classroomId, assignment.id))}
	>
		{#snippet detail()}
			<Day at={assignment.assignedAt} say={(day) => m.assignment_assigned({ day })} />
		{/snippet}
		{#snippet tail()}
			{#if done === count}
				<Badge variant="secondary">{m.assignment_everyone_done()}</Badge>
			{:else if assignment.dueAt}
				<DueBadge dueAt={assignment.dueAt} />
			{/if}
			<Progress value={done} max={count} class="h-2 w-20" aria-hidden="true" />
			<span class="w-24 text-end text-muted-foreground tabular-nums">
				{m.assignment_done_of({ done, count })}
			</span>
			<ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		{/snippet}
	</WorkRow>
{/snippet}

{#if work.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<ClipboardListIcon />
			</Empty.Media>
			<Empty.Title>{m.assignment_none_title()}</Empty.Title>
			<Empty.Description>{m.assignment_none_teacher()}</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={resolvePath(classroomPracticePath('teacher', params.classroomId))}>
				{m.assignment_go_practice()}
			</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	{#if open.length > 0}
		<WorkSection title={m.assignment_in_progress()} count={open.length}>
			{#each open as each (each.assignment.id)}
				{@render row(each)}
			{/each}
		</WorkSection>
	{/if}
	{#if finished.length > 0}
		<WorkSection title={m.assignment_finished()} count={finished.length}>
			{#each finished as each (each.assignment.id)}
				{@render row(each)}
			{/each}
		</WorkSection>
	{/if}
{/if}
