<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UsersIcon from '@lucide/svelte/icons/users';
	import Day from '#lib/components/app/day.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import PersonRow from '#lib/components/app/person-row.svelte';
	import AddMembersDialog from '#lib/components/classrooms/add-members-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { summaryOf } from '#lib/items/progress.js';
	import { studentPath, type StaffRole } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom, ClassroomStudent } from '#lib/server/classrooms.js';
	import type { ClassRead } from '#lib/server/staff.js';

	/**
	 * A classroom's students as its staff follow them: a row says what its
	 * student has done here, and opens their page. A manager, who keeps the
	 * roster, is handed everyone who could join it and puts more students on
	 * it from here, while the classroom is live; the page it is on answers
	 * with the form action `add`. A student is taken off from their own page.
	 */
	let {
		role,
		data
	}: {
		role: StaffRole;
		data: ClassRead & {
			classroom: Classroom;
			/** Every student of the organization: any of them could join. */
			candidates?: ClassroomStudent[];
		};
	} = $props();

	// An archived classroom's roster stands as it was.
	const candidates = $derived(data.classroom.archivedAt === null ? data.candidates : undefined);
	let adding = $state(false);

	/** A student's line: "username · grade", as far as both are known. */
	const detailOf = (student: ClassroomStudent) =>
		[student.username, student.gradeLevelName].filter((part) => part !== null).join(' · ');

	const stages = $derived(data.topics.flatMap((topic) => topic.stages));

	/** What each student has done of the classroom's stages, by the student's id. */
	const summaries = $derived(
		Object.fromEntries(
			data.students.map((student) => [
				student.id,
				summaryOf(stages.map((stage) => data.standings[student.id]?.[stage.id]))
			])
		)
	);
</script>

{#snippet addButton()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{m.roster_add_students()}
	</Button>
{/snippet}

{#if candidates}
	<PageToolbar>{@render addButton()}</PageToolbar>
{/if}

{#if data.students.length === 0}
	<EmptyState
		icon={UsersIcon}
		title={m.people_no_students_title()}
		description={m.members_no_students()}
	>
		{#if candidates}
			{@render addButton()}
		{/if}
	</EmptyState>
{:else}
	<ListCard>
		{#each data.students as student (student.id)}
			{@const summary = summaries[student.id]}
			<PersonRow
				name={student.name}
				detail={detailOf(student)}
				href={resolvePath(studentPath(role, data.classroom.id, student.id))}
			>
				{#snippet tail()}
					<!-- What they have done here, which is what the list is opened to see. -->
					{#if summary.last}
						<span class="grid text-end leading-snug">
							<span class="font-medium tabular-nums">
								{m.progress_stages_of({ done: summary.stages, count: stages.length })} ·
								{m.progress_stars_of({ done: summary.stars, count: stages.length * 3 })}
							</span>
							<span class="text-xs text-muted-foreground">
								{m.progress_last()}
								<Day at={summary.last} />
							</span>
						</span>
					{:else}
						<span class="text-muted-foreground">{m.stars_not_practised()}</span>
					{/if}
				{/snippet}
			</PersonRow>
		{/each}
	</ListCard>
{/if}

{#if candidates}
	<AddMembersDialog
		bind:open={adding}
		kind="students"
		memberIds={data.students.map((student) => student.id)}
		candidates={candidates.map((student) => ({
			id: student.id,
			name: student.name,
			detail: detailOf(student) || null
		}))}
	/>
{/if}
