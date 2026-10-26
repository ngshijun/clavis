<script lang="ts">
	import { goto } from '$app/navigation';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import ActivityCard from '#lib/components/dashboard/activity-card.svelte';
	import AssignmentsCard from '#lib/components/dashboard/assignments-card.svelte';
	import ClassroomsCard from '#lib/components/dashboard/classrooms-card.svelte';
	import PointsCard from '#lib/components/dashboard/points-card.svelte';
	import ResultsCard from '#lib/components/dashboard/results-card.svelte';
	import StrugglingCard from '#lib/components/dashboard/struggling-card.svelte';
	import WeeksCard from '#lib/components/dashboard/weeks-card.svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import { dashboardHref } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * A teacher's home: how their classrooms are doing, all of them or one.
	 * What the students know comes first, by learning point and by student;
	 * practice, one of the ways they learn it, has a section of its own.
	 */
	let { data }: PageProps = $props();

	const scope = $derived(
		data.classroomId
			? data.classrooms.filter((each) => each.id === data.classroomId)
			: data.classrooms
	);
	// A row names its classroom only when the page is about several.
	const classroomNames = $derived(
		scope.length > 1 ? new Map(scope.map((each) => [each.id, each.name])) : undefined
	);

	const ALL = 'all';
	const people = $derived(data.people);
	const change = $derived(people.thisWeek - people.lastWeek);
	const done = $derived(data.progress.done + data.progress.late);
	const given = $derived(done + data.progress.toDo + data.progress.overdue);
</script>

{#if data.classrooms.length === 0}
	<ClassroomEmpty description={m.picker_empty_staff()} />
{:else}
	{#if data.classrooms.length > 1}
		<PageToolbar>
			<Select.Root
				type="single"
				bind:value={
					() => data.classroomId ?? ALL,
					(id) => goto(dashboardHref(id === ALL ? null : id), { reset: false })
				}
			>
				<Select.Trigger class="me-auto" aria-label={m.dashboard_classroom_label()}>
					{scope.length === 1 ? scope[0].name : m.dashboard_all_classrooms()}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.Item value={ALL} label={m.dashboard_all_classrooms()} />
						{#each data.classrooms as classroom (classroom.id)}
							<Select.Item value={classroom.id} label={classroom.name} />
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</PageToolbar>
	{/if}

	<StatStrip
		stats={[
			{
				label: m.section_students(),
				value: people.students,
				note: m.dashboard_in_classrooms({ count: scope.length })
			},
			{
				label: m.dashboard_practised_this_week(),
				value: people.thisWeek,
				of: people.students,
				note:
					change > 0
						? m.dashboard_more_than_last_week({ count: change })
						: change < 0
							? m.dashboard_fewer_than_last_week({ count: -change })
							: m.dashboard_same_as_last_week()
			},
			{ label: m.dashboard_points_secure(), value: data.bands.secure, of: data.points.length },
			{
				label: m.dashboard_assignments_done(),
				value: done,
				of: given,
				note:
					data.progress.overdue > 0
						? m.dashboard_overdue({ count: data.progress.overdue })
						: m.dashboard_none_overdue()
			}
		]}
	/>

	<div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<PointsCard points={data.points} classrooms={scope} />
		</div>
		<div class="flex flex-col gap-4">
			<StrugglingCard students={data.struggling} {classroomNames} />
			<AssignmentsCard progress={data.progress} />
		</div>
		{#if data.summaries.length > 0}
			<div class="lg:col-span-3">
				<ClassroomsCard rows={data.summaries} />
			</div>
		{/if}
	</div>

	<section class="flex flex-col gap-4">
		<h2 class="mt-2 text-lg font-semibold">{m.dashboard_practice()}</h2>
		<div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
			<WeeksCard weeks={data.weeks} />
			<ResultsCard tally={data.tally} />
			<ActivityCard activity={data.activity} {classroomNames} />
		</div>
	</section>
{/if}
