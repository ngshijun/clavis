<script lang="ts">
	import { goto } from '$app/navigation';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { dashboardHref, MANAGER_CLASSROOMS, type StaffRole } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Dashboard } from '#lib/server/dashboard.js';
	import ActivityCard from './activity-card.svelte';
	import AssignmentsCard from './assignments-card.svelte';
	import ClassroomsCard from './classrooms-card.svelte';
	import PointsCard from './points-card.svelte';
	import ResultsCard from './results-card.svelte';
	import StrugglingCard from './struggling-card.svelte';
	import WeeksCard from './weeks-card.svelte';

	/**
	 * A teacher's home and a manager's: how their classrooms are doing, all
	 * of them or one. What the students know comes first, by learning point
	 * and by student, and then how their practice, one of the ways they learn
	 * it, is going. Whatever on it leads somewhere leads to the reader's own
	 * pages of the classroom.
	 */
	let { role, data }: { role: StaffRole; data: Dashboard } = $props();

	const scope = $derived(
		data.classroomId ? data.reach.filter((each) => each.id === data.classroomId) : data.reach
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

{#if data.reach.length === 0}
	<!-- A teacher is given their classrooms; a manager sets them up, on the page they are kept on. -->
	{#if role === 'manager'}
		<EmptyState
			icon={SchoolIcon}
			title={m.classrooms_empty_title()}
			description={m.classrooms_empty_description()}
		>
			<Button href={resolvePath(MANAGER_CLASSROOMS)}>{m.dashboard_go_classrooms()}</Button>
		</EmptyState>
	{:else}
		<EmptyState
			icon={SchoolIcon}
			title={m.classrooms_empty_title()}
			description={m.picker_empty_staff()}
		/>
	{/if}
{:else}
	{#if data.reach.length > 1}
		<PageToolbar>
			<Select.Root
				type="single"
				bind:value={
					() => data.classroomId ?? ALL,
					(id) => goto(dashboardHref(role, id === ALL ? null : id), { reset: false })
				}
			>
				<Select.Trigger class="me-auto" aria-label={m.dashboard_classroom_label()}>
					{scope.length === 1 ? scope[0].name : m.dashboard_all_classrooms()}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.Item value={ALL} label={m.dashboard_all_classrooms()} />
						{#each data.reach as classroom (classroom.id)}
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
			// Until a learning point has enough answers to tell, there is nothing to count.
			{
				label: m.dashboard_points_secure(),
				value: data.points.length > 0 ? data.bands.secure : null,
				of: data.points.length > 0 ? data.points.length : undefined
			},
			{
				label: m.dashboard_assignments_done(),
				value: given > 0 ? done : null,
				of: given > 0 ? given : undefined,
				note:
					data.progress.overdue > 0
						? m.dashboard_overdue({ count: data.progress.overdue })
						: m.dashboard_none_overdue()
			}
		]}
	/>

	<!--
		Two columns that each stack their own cards, so a short card never leaves
		a hole beside a tall one, and the classrooms' table under both, the whole
		width, so its six columns fit on a laptop's screen. On a narrow screen the
		columns give way and the cards line up one under another, the most
		pressing first.
	-->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
		<div class="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-4">
			<div class="order-1 lg:order-none">
				<PointsCard points={data.points} classrooms={scope} />
			</div>
			<div class="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
				<div class="order-5 lg:order-none">
					<WeeksCard weeks={data.weeks} />
				</div>
				<div class="order-6 lg:order-none">
					<ResultsCard tally={data.tally} />
				</div>
			</div>
		</div>
		<div class="contents lg:flex lg:flex-col lg:gap-4">
			<div class="order-2 lg:order-none">
				<StrugglingCard {role} students={data.struggling} {classroomNames} />
			</div>
			<div class="order-3 lg:order-none">
				<AssignmentsCard progress={data.progress} />
			</div>
			<div class="order-7 lg:order-none">
				<ActivityCard {role} activity={data.activity} {classroomNames} />
			</div>
		</div>
		{#if data.summaries.length > 0}
			<div class="order-4 lg:order-none lg:col-span-3">
				<ClassroomsCard {role} rows={data.summaries} />
			</div>
		{/if}
	</div>
{/if}
