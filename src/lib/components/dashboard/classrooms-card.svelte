<script lang="ts">
	import Cover from '#lib/components/app/cover.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import type { ClassroomSummary } from '#lib/items/dashboard.js';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import { percent } from './percent.js';

	/** Each of the teacher's classrooms in a row, with how it is doing. */
	let { rows }: { rows: { classroom: Classroom; summary: ClassroomSummary }[] } = $props();

	// A figure's heading may take two lines, so that every column fits beside the classroom's name.
	const figure = 'w-24 text-end leading-tight whitespace-normal';
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.dashboard_classrooms_title()}</Card.Title>
		<Card.Description>{m.dashboard_classrooms_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.dashboard_classroom_label()}</Table.Head>
					<Table.Head class={figure}>{m.dashboard_practised_this_week()}</Table.Head>
					<Table.Head class={figure}>{m.dashboard_column_average()}</Table.Head>
					<Table.Head class={figure}>{m.dashboard_points_secure()}</Table.Head>
					<Table.Head class={figure}>{m.dashboard_assignments_done()}</Table.Head>
					<Table.Head class={figure}>{m.dashboard_column_attention()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as { classroom, summary } (classroom.id)}
					{@const done = summary.progress.done + summary.progress.late}
					{@const given = done + summary.progress.toDo + summary.progress.overdue}
					<Table.Row>
						<Table.Cell>
							<a
								href={resolvePath(classroomPath('teacher', classroom.id))}
								class="flex max-w-64 items-center gap-2.5 rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<Cover
									id={classroom.id}
									coverUrl={classroom.coverUrl}
									class="size-8 shrink-0 rounded-sm"
								/>
								<span class="flex min-w-0 flex-col leading-tight">
									<span class="truncate">{classroom.name}</span>
									<span class="truncate text-xs font-normal text-muted-foreground">
										{classroom.gradeLevelName} · {classroom.subjectName}
									</span>
								</span>
							</a>
						</Table.Cell>
						<Table.Cell class="text-end tabular-nums">
							{summary.thisWeek}
							<span class="text-muted-foreground">{m.count_of({ count: summary.students })}</span>
						</Table.Cell>
						<Table.Cell class="text-end font-semibold tabular-nums"
							>{percent(summary.average)}</Table.Cell
						>
						<Table.Cell class="text-end tabular-nums">
							{#if summary.points > 0}
								{summary.secure}
								<span class="text-muted-foreground">{m.count_of({ count: summary.points })}</span>
							{:else}
								—
							{/if}
						</Table.Cell>
						<Table.Cell class="text-end tabular-nums">
							{#if given > 0}
								{done}
								<span class="text-muted-foreground">{m.count_of({ count: given })}</span>
							{:else}
								—
							{/if}
						</Table.Cell>
						<Table.Cell class="text-end">
							<Badge variant={summary.struggling > 0 ? 'destructive' : 'secondary'}>
								{summary.struggling}
							</Badge>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
