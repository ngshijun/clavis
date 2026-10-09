<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import Day from '#lib/components/app/day.svelte';
	import DueBadge from '#lib/components/assignments/due-badge.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import WorkSection from '#lib/components/assignments/work-section.svelte';
	import StageDialog from '#lib/components/runner/stage-dialog.svelte';
	import { stopsOf, type Stop } from '#lib/components/runner/stage-path.svelte';
	import StarsRow from '#lib/components/runner/stars.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { byDue, isLate, sinceAssigned } from '#lib/items/assignments.js';
	import { markFigure } from '#lib/items/run.js';
	import { bestOf, starsOf } from '#lib/items/stars.js';
	import { classroomPracticePath, classroomStagePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * A classroom's first page for a student: what their teacher has assigned
	 * them there, the most pressing first, and what they have done of it.
	 * Finishing a stage once does its assignment. Either list opens the
	 * dialog a stage on the path opens, and the run starts from there.
	 */
	let { data, params }: PageProps = $props();

	const stops = $derived(stopsOf(data.topics));
	// An assignment of a stage that has since lost its every question cannot be done, and is not listed.
	const work = $derived(
		data.assignments.flatMap((assignment) => {
			const stop = stops[assignment.stageId];
			return stop ? [{ assignment, stop }] : [];
		})
	);
	const toDo = $derived(
		work.filter((each) => !each.assignment.doneAt).sort((a, b) => byDue(a.assignment, b.assignment))
	);
	// The latest done first.
	const done = $derived(
		work
			.filter((each) => each.assignment.doneAt)
			.sort((a, b) => Date.parse(b.assignment.doneAt ?? '') - Date.parse(a.assignment.doneAt ?? ''))
	);

	/** The best the student has scored on an assignment's stage since it was assigned. */
	const bestSince = ({ assignment }: (typeof work)[number]) =>
		bestOf(sinceAssigned(data.attempts[assignment.stageId] ?? [], assignment.assignedAt));

	// The stage whose dialog is open. It is kept when the dialog closes, so the dialog
	// does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);

	function pick(stop: Stop) {
		picked = stop;
		open = true;
	}
</script>

{#if work.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<ClipboardListIcon />
			</Empty.Media>
			<Empty.Title>{m.assignment_none_title()}</Empty.Title>
			<Empty.Description>{m.assignment_none_student()}</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={resolvePath(classroomPracticePath('student', params.classroomId))}>
				{m.assignment_go_practice()}
			</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	{#if toDo.length > 0}
		<WorkSection title={m.assignment_to_do()} count={toDo.length}>
			{#each toDo as { assignment, stop } (assignment.id)}
				<WorkRow {stop}>
					{#snippet tail()}
						{#if assignment.dueAt}
							<DueBadge dueAt={assignment.dueAt} />
						{/if}
						<Button size="sm" onclick={() => pick(stop)}>{m.practice_start()}</Button>
					{/snippet}
				</WorkRow>
			{/each}
		</WorkSection>
	{/if}
	{#if done.length > 0}
		<WorkSection title={m.assignment_done()} count={done.length}>
			{#each done as each (each.assignment.id)}
				{@const { assignment, stop } = each}
				{@const best = bestSince(each)}
				<WorkRow {stop} done onclick={() => pick(stop)}>
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
							<span class="font-semibold tabular-nums">
								<span class="sr-only">
									{m.stars_score({ marks: markFigure(best.marks), total: best.total })}
								</span>
								<span aria-hidden="true">{markFigure(best.marks)}/{best.total}</span>
							</span>
							<StarsRow count={starsOf(best.marks, best.total)} class="[&_svg]:size-5" />
						{/if}
						<ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					{/snippet}
				</WorkRow>
			{/each}
		</WorkSection>
	{/if}
{/if}

{#if picked}
	<StageDialog
		bind:open
		stop={picked}
		attempts={data.attempts[picked.stage.id] ?? []}
		href={resolvePath(classroomStagePath(params.classroomId, picked.stage.id))}
	/>
{/if}
