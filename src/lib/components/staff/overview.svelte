<script lang="ts">
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Day from '#lib/components/app/day.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import AssignDialog from '#lib/components/assignments/assign-dialog.svelte';
	import DueBadge from '#lib/components/assignments/due-badge.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import { stopsOf } from '#lib/components/runner/stage-path.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { byDue } from '#lib/items/assignments.js';
	import { workOf } from '#lib/items/work.js';
	import { assignmentPath, type StaffRole } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { OverviewRead } from '#lib/server/staff.js';

	/**
	 * A classroom's first page for its staff: what has been assigned there
	 * and how far each assignment has got. One is in progress until every
	 * student it was given to has done it. A teacher assigns more from here;
	 * a manager reads it. The page it is on answers a teacher with the form
	 * action `assign`.
	 */
	let { role, data }: { role: StaffRole; data: OverviewRead & { classroom: Classroom } } = $props();

	// Only a teacher assigns, and with no student to give it to, or no stage to give, there is nothing to assign.
	const assignable = $derived(
		role === 'teacher' && data.students.length > 0 && data.topics.length > 0
	);
	let assigning = $state(false);

	const work = $derived(
		workOf(data.assignments, stopsOf(data.topics)).map(({ assignment, stop }) => ({
			assignment,
			stop,
			done: assignment.students.filter((student) => student.doneAt).length,
			count: assignment.students.length
		}))
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
		href={resolvePath(assignmentPath(role, data.classroom.id, assignment.id))}
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
		{/snippet}
	</WorkRow>
{/snippet}

{#snippet assign()}
	<Button onclick={() => (assigning = true)}>
		<PlusIcon data-icon="inline-start" />
		{m.assignment_assign()}
	</Button>
{/snippet}

{#if assignable}
	<PageToolbar>{@render assign()}</PageToolbar>
{/if}

{#if work.length === 0}
	<EmptyState
		icon={ClipboardListIcon}
		title={m.assignment_none_title()}
		description={role === 'teacher' ? m.assignment_none_teacher() : m.assignment_none_manager()}
	>
		{#if assignable}
			{@render assign()}
		{/if}
	</EmptyState>
{:else}
	<!-- Two titled lists, so the gap of sections between them rather than the page's own. -->
	<div class="flex flex-col gap-6">
		{#if open.length > 0}
			<ListCard title={m.assignment_in_progress()} count={open.length}>
				{#each open as each (each.assignment.id)}
					{@render row(each)}
				{/each}
			</ListCard>
		{/if}
		{#if finished.length > 0}
			<ListCard title={m.assignment_finished()} count={finished.length}>
				{#each finished as each (each.assignment.id)}
					{@render row(each)}
				{/each}
			</ListCard>
		{/if}
	</div>
{/if}

{#if assigning}
	<AssignDialog
		topics={data.topics}
		students={data.students}
		standings={data.standings}
		onclosed={() => (assigning = false)}
	/>
{/if}
