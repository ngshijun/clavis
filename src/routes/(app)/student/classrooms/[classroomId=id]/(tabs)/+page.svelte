<script lang="ts">
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import Day from '#lib/components/app/day.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import DueBadge from '#lib/components/assignments/due-badge.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import Score from '#lib/components/runner/score.svelte';
	import StageDialog from '#lib/components/runner/stage-dialog.svelte';
	import { stopsOf, type Stop } from '#lib/components/runner/stage-path.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { isLate, sinceAssigned } from '#lib/items/assignments.js';
	import { bestOf } from '#lib/items/stars.js';
	import { toDoOf, workOf } from '#lib/items/work.js';
	import {
		classroomPracticePath,
		classroomSessionPath,
		classroomStagePath
	} from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * A classroom's first page for a student: what their teacher has assigned
	 * them there, the most pressing first, and what they have done of it.
	 * Finishing a stage once does its assignment. Work to do starts its run
	 * straight from the row, which has already said what it is; work done
	 * opens the session its score is from.
	 */
	let { data, params }: PageProps = $props();

	const work = $derived(workOf(data.assignments, stopsOf(data.topics)));
	const toDo = $derived(toDoOf(work));
	// The latest done first.
	const done = $derived(
		work
			.filter((each) => each.assignment.doneAt)
			.sort((a, b) => Date.parse(b.assignment.doneAt ?? '') - Date.parse(a.assignment.doneAt ?? ''))
	);

	/** The best the student has scored on an assignment's stage since it was assigned. */
	const bestSince = ({ assignment }: (typeof work)[number]) =>
		bestOf(sinceAssigned(data.attempts[assignment.stageId] ?? [], assignment.assignedAt));

	// The stage whose dialog is open: that of work done whose session cannot be found. It is
	// kept when the dialog closes, so the dialog does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);

	function pick(stop: Stop) {
		picked = stop;
		open = true;
	}
</script>

{#if work.length === 0}
	<EmptyState
		icon={ClipboardListIcon}
		title={m.assignment_none_title()}
		description={m.assignment_none_student()}
	>
		<Button size="lg" href={resolvePath(classroomPracticePath('student', params.classroomId))}>
			{m.assignment_go_practice()}
		</Button>
	</EmptyState>
{:else}
	<!-- Two titled lists, so the gap of sections between them rather than the page's own. -->
	<div class="flex flex-col gap-6">
		{#if toDo.length > 0}
			<ListCard title={m.assignment_to_do()} count={toDo.length}>
				{#each toDo as { assignment, stop } (assignment.id)}
					<WorkRow {stop}>
						{#snippet tail()}
							{#if assignment.dueAt}
								<DueBadge dueAt={assignment.dueAt} />
							{/if}
							<Button
								size="lg"
								href={resolvePath(classroomStagePath(params.classroomId, stop.stage.id))}
							>
								{m.practice_start()}
							</Button>
						{/snippet}
					</WorkRow>
				{/each}
			</ListCard>
		{/if}
		{#if done.length > 0}
			<ListCard title={m.assignment_done()} count={done.length}>
				{#each done as each (each.assignment.id)}
					{@const { assignment, stop } = each}
					{@const best = bestSince(each)}
					<!-- It opens the session the row's score is from: the best since it was assigned. -->
					<WorkRow
						{stop}
						done
						href={best ? resolvePath(classroomSessionPath(params.classroomId, best.id)) : undefined}
						onclick={() => pick(stop)}
					>
						{#snippet detail()}
							{#if assignment.doneAt}
								<Day at={assignment.doneAt} say={(day) => m.assignment_finished_on({ day })} />
							{/if}
						{/snippet}
						{#snippet tail()}
							{#if assignment.doneAt && isLate(assignment.doneAt, assignment.dueAt)}
								<Badge variant="outline">{m.assignment_late()}</Badge>
							{/if}
							{#if best}
								<Score score={best} />
							{/if}
						{/snippet}
					</WorkRow>
				{/each}
			</ListCard>
		{/if}
	</div>
{/if}

{#if picked}
	<StageDialog
		bind:open
		stop={picked}
		attempts={data.attempts[picked.stage.id] ?? []}
		href={resolvePath(classroomStagePath(params.classroomId, picked.stage.id))}
		attemptHref={(attempt) => resolvePath(classroomSessionPath(params.classroomId, attempt.id))}
	/>
{/if}
