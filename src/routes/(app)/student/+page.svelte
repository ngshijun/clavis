<script lang="ts">
	import { onMount } from 'svelte';
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import DueBadge from '#lib/components/assignments/due-badge.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import ResultsCard from '#lib/components/dashboard/results-card.svelte';
	import ClassroomTile from '#lib/components/home/classroom-tile.svelte';
	import GoalCard from '#lib/components/home/goal-card.svelte';
	import Star from '#lib/components/runner/star.svelte';
	import { stopsOf } from '#lib/components/runner/stage-path.svelte';
	import StarsRow from '#lib/components/runner/stars.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { startOfDay, startOfWeek } from '#lib/dates.js';
	import { starsSince, streakOf } from '#lib/items/gains.js';
	import { standingOf, summaryOf, tallyOf } from '#lib/items/progress.js';
	import { toDoOf, workOf } from '#lib/items/work.js';
	import { classroomPath, classroomStagePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * A student's home: what they have yet to do across their classrooms, how
	 * far they are towards the day's goal of new stars, where they stand on
	 * every stage, and each classroom with what they have earned there. Work
	 * to do starts its run straight from the row.
	 */
	let { data }: PageProps = $props();

	/** Work due within this long, or already late, is due soon. */
	const SOON = 2 * 86_400_000;

	/**
	 * Today, this week and a run of days are told by the reader's own clock,
	 * which the server does not have: they are worked out once the page is in
	 * their browser.
	 */
	let now = $state<Date>();
	onMount(() => {
		now = new Date();
	});

	// Two classrooms of one subject share their stages, so each classroom's work is matched to its own.
	const rooms = $derived(
		data.rooms.map(({ classroom, topics, attempts: every }) => {
			const stops = stopsOf(topics);
			// A stage that has lost its every question is on no path, and what was earned on it is not counted.
			const attempts = Object.fromEntries(
				Object.entries(every).filter(([stageId]) => stageId in stops)
			);
			const standings = Object.keys(stops).map((stageId) => standingOf(attempts[stageId] ?? []));
			return { classroom, stops, attempts, standings, summary: summaryOf(standings) };
		})
	);
	const several = $derived(rooms.length > 1);

	const due = $derived(
		toDoOf(
			rooms.flatMap(({ classroom, stops, attempts }) =>
				workOf(
					data.assignments.filter((assignment) => assignment.classroomId === classroom.id),
					stops
				).map((each) => ({
					...each,
					classroom,
					stars: standingOf(attempts[each.stop.stage.id] ?? [])?.stars ?? 0
				}))
			)
		)
	);
	let sort = $state<'deadline' | 'classroom'>('deadline');
	const sorts = $derived({
		deadline: m.home_sort_deadline(),
		classroom: m.home_sort_classroom()
	});
	// Within a classroom the most pressing stays first: the sort keeps the order of what ties.
	const toDo = $derived(
		sort === 'classroom'
			? due.toSorted((a, b) => a.classroom.name.localeCompare(b.classroom.name))
			: due
	);
	const dueSoon = $derived(
		due.filter(
			({ assignment }) => assignment.dueAt && Date.parse(assignment.dueAt) < Date.now() + SOON
		).length
	);

	const stars = $derived(rooms.reduce((sum, room) => sum + room.summary.stars, 0));
	const tally = $derived(tallyOf(rooms.flatMap((room) => room.standings)));
	const today = $derived.by(() => {
		if (!now) return undefined;
		const since = startOfDay(now);
		return rooms.reduce((sum, room) => sum + starsSince(room.attempts, since), 0);
	});
	const streak = $derived(
		now &&
			streakOf(
				rooms.flatMap((room) =>
					Object.values(room.attempts).flatMap((sessions) =>
						sessions.map((session) => session.completedAt)
					)
				),
				now
			)
	);

	const pill = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm';
</script>

{#snippet heading()}
	<div class="flex min-h-10 flex-wrap items-center gap-2 px-2 pt-1">
		<h2 class="me-auto text-lg font-semibold">
			{m.assignment_to_do()}
			{#if toDo.length > 0}
				<span class="ms-1 text-sm font-medium text-muted-foreground tabular-nums">
					{toDo.length}
				</span>
			{/if}
		</h2>
		{#if several && toDo.length > 1}
			<Select.Root type="single" bind:value={sort}>
				<Select.Trigger size="sm" aria-label={m.home_sort()}>{sorts[sort]}</Select.Trigger>
				<Select.Content align="end">
					<Select.Group>
						{#each Object.entries(sorts) as [value, label] (value)}
							<Select.Item {value} {label} />
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		{/if}
	</div>
{/snippet}

{#if rooms.length === 0}
	<EmptyState
		icon={SchoolIcon}
		title={m.classrooms_empty_title()}
		description={m.picker_empty_student()}
	/>
{:else}
	<header class="flex flex-wrap items-center gap-x-3 gap-y-2 px-2">
		<h1 class="text-2xl font-bold">{m.home_greeting({ name: data.user.name })}</h1>
		{#if dueSoon > 0}
			<p class="text-muted-foreground">{m.home_due_soon({ count: dueSoon })}</p>
		{/if}
		<p class="ms-auto flex flex-wrap gap-2">
			<span class={[pill, 'bg-card shadow-xs']}>
				{m.home_total_stars()}
				<span class="font-semibold tabular-nums">{stars}</span>
				<Star earned class="size-4" />
			</span>
			<span class={[pill, 'bg-star/30']}>
				{m.home_streak()}
				<span class="font-semibold tabular-nums">
					{streak === undefined ? '–' : m.home_streak_days({ count: streak })}
				</span>
				<FlameIcon class="size-4 text-star-edge" aria-hidden="true" />
			</span>
		</p>
	</header>

	<!--
		Two columns that each stack their own, so a short card never leaves a hole
		beside a tall one. Where the page is narrow they give way and everything
		lines up one under another, what is to do first and the goal after it.
	-->
	<div
		class="grid grid-cols-1 gap-4 @4xl/page:grid-cols-[minmax(0,1fr)_18rem] @4xl/page:items-start"
	>
		<div class="contents @4xl/page:flex @4xl/page:flex-col @4xl/page:gap-6">
			<div class="order-1 @4xl/page:order-none">
				{#if toDo.length === 0}
					<Card.Root class="gap-1 rounded-3xl p-2">
						{@render heading()}
						<EmptyState
							icon={ClipboardCheckIcon}
							title={m.todo_nothing_title()}
							description={m.todo_nothing_description()}
						/>
					</Card.Root>
				{:else}
					<ListCard header={heading}>
						{#each toDo as { assignment, stop, classroom, stars: best } (assignment.id)}
							{#snippet where()}{classroom.name}{/snippet}
							<WorkRow {stop} detail={several ? where : undefined}>
								{#snippet tail()}
									{#if assignment.dueAt}
										<DueBadge dueAt={assignment.dueAt} />
									{/if}
									<StarsRow count={best} class="[&_svg]:size-5" />
									<Button
										size="lg"
										href={resolvePath(classroomStagePath(classroom.id, stop.stage.id))}
									>
										{m.practice_start()}
									</Button>
								{/snippet}
							</WorkRow>
						{/each}
					</ListCard>
				{/if}
			</div>
			<section class="order-3 flex flex-col gap-2 @4xl/page:order-none">
				<h2 class="px-2 text-lg font-semibold">{m.home_my_classrooms()}</h2>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
					{#each rooms as { classroom, attempts, summary } (classroom.id)}
						<ClassroomTile
							{classroom}
							href={resolvePath(classroomPath('student', classroom.id))}
							stars={summary.stars}
							week={now && starsSince(attempts, startOfWeek(now))}
							done={summary.sessions}
						/>
					{/each}
				</div>
			</section>
		</div>
		<div class="contents @4xl/page:flex @4xl/page:flex-col @4xl/page:gap-4">
			<div class="order-2 @4xl/page:order-none">
				<GoalCard {today} />
			</div>
			<div class="order-4 @4xl/page:order-none">
				<ResultsCard
					{tally}
					title={m.home_mastery_title()}
					description={m.home_mastery_description()}
				/>
			</div>
		</div>
	</div>
{/if}
