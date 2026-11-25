<script lang="ts">
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import Day from '#lib/components/app/day.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import DueBadge from '#lib/components/assignments/due-badge.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import Score from '#lib/components/runner/score.svelte';
	import { stopsOf } from '#lib/components/runner/stage-path.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { byLatest, sessionsOf, toDoOf, workOf } from '#lib/items/work.js';
	import { classroomSessionPath, classroomStagePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * A student's home: what they have yet to do across their classrooms, the
	 * most pressing first, and what they finished lately. Work to do starts
	 * its run straight from the row; a finished practice opens as they were
	 * shown it marked. A row names its classroom only when they have several.
	 */
	let { data }: PageProps = $props();

	/** As many finished sessions as are shown: a classroom's History has every one. */
	const FEW = 5;

	// Two classrooms of one subject share their stages, so each classroom's work is matched to its own.
	const rooms = $derived(data.rooms.map((room) => ({ ...room, stops: stopsOf(room.topics) })));
	const toDo = $derived(
		toDoOf(
			rooms.flatMap(({ classroom, stops }) =>
				workOf(
					data.assignments.filter((assignment) => assignment.classroomId === classroom.id),
					stops
				).map((each) => ({ ...each, classroom }))
			)
		)
	);
	const lately = $derived(
		rooms
			.flatMap(({ classroom, attempts, stops }) =>
				sessionsOf(attempts, stops).map((each) => ({ ...each, classroom }))
			)
			.sort(byLatest)
			.slice(0, FEW)
	);
	const several = $derived(data.rooms.length > 1);
</script>

{#snippet nothing()}
	<EmptyState
		icon={ClipboardCheckIcon}
		title={m.todo_nothing_title()}
		description={m.todo_nothing_description()}
	/>
{/snippet}

{#if data.rooms.length === 0}
	<EmptyState
		icon={SchoolIcon}
		title={m.classrooms_empty_title()}
		description={m.picker_empty_student()}
	/>
{:else if toDo.length === 0 && lately.length === 0}
	{@render nothing()}
{:else}
	<!-- Two titled lists, so the gap of sections between them rather than the page's own. -->
	<div class="flex flex-col gap-6">
		{#if toDo.length === 0}
			{@render nothing()}
		{:else}
			<ListCard title={m.assignment_to_do()} count={toDo.length}>
				{#each toDo as { assignment, stop, classroom } (assignment.id)}
					{#snippet where()}{classroom.name}{/snippet}
					<WorkRow {stop} detail={several ? where : undefined}>
						{#snippet tail()}
							{#if assignment.dueAt}
								<DueBadge dueAt={assignment.dueAt} />
							{/if}
							<Button size="lg" href={resolvePath(classroomStagePath(classroom.id, stop.stage.id))}>
								{m.practice_start()}
							</Button>
						{/snippet}
					</WorkRow>
				{/each}
			</ListCard>
		{/if}
		{#if lately.length > 0}
			<ListCard title={m.practice_finished_lately()}>
				{#each lately as { attempt, stop, classroom } (attempt.id)}
					<WorkRow {stop} done href={resolvePath(classroomSessionPath(classroom.id, attempt.id))}>
						{#snippet detail()}
							{#if several}{classroom.name} ·{/if}
							<Day at={attempt.completedAt} time />
						{/snippet}
						{#snippet tail()}
							<Score score={attempt} />
						{/snippet}
					</WorkRow>
				{/each}
			</ListCard>
		{/if}
	</div>
{/if}
