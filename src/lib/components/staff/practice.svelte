<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TargetIcon from '@lucide/svelte/icons/target';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import AssignDialog from '#lib/components/assignments/assign-dialog.svelte';
	import ClassBar from '#lib/components/progress/class-bar.svelte';
	import ClassKey from '#lib/components/progress/class-key.svelte';
	import ClassStageDialog from '#lib/components/progress/class-stage-dialog.svelte';
	import TopicStages from '#lib/components/progress/topic-stages.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { tallyOf } from '#lib/items/progress.js';
	import { studentPath, type StaffRole } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { Stage } from '#lib/server/practice.js';
	import type { ClassRead } from '#lib/server/staff.js';

	/**
	 * A classroom's practice as its staff follow it: the stages its students
	 * are offered, topic by topic, each with how the class stands on it. A
	 * stage opens to show the same student by student. A teacher can assign
	 * it from there, and the page's own button assigns a stage chosen in its
	 * dialog; the page it is on answers with the form action `assign`. A
	 * manager reads it.
	 */
	let { role, data }: { role: StaffRole; data: ClassRead & { classroom: Classroom } } = $props();

	// Only a teacher assigns, and with nobody in the classroom there is nobody to assign to.
	const assignable = $derived(role === 'teacher' && data.students.length > 0);

	/** Where each student of the classroom stands on a stage, in the roster's order. */
	const standings = (stage: Stage) =>
		data.students.map((student) => data.standings[student.id]?.[stage.id]);

	// The stage whose dialog is open. It is kept when the dialog closes, so the dialog
	// does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);
	/** While the dialog that assigns is up: the stage it was opened from, or null when it is to ask which. */
	let assigning = $state<Stop | null>();

	/** Every student of the classroom on a stage, for its dialog. */
	function rowsOf(stage: Stage) {
		const standing = standings(stage);
		return data.students.map((student, index) => ({
			id: student.id,
			name: student.name,
			standing: standing[index],
			href: resolvePath(studentPath(role, data.classroom.id, student.id))
		}));
	}
</script>

{#if data.topics.length === 0}
	<EmptyState
		icon={TargetIcon}
		title={m.practice_none_title()}
		description={m.practice_none_description()}
	/>
{:else}
	{#if assignable}
		<PageToolbar>
			<Button onclick={() => (assigning = null)}>
				<PlusIcon data-icon="inline-start" />
				{m.assignment_assign()}
			</Button>
		</PageToolbar>
	{/if}
	<ClassKey />
	{#each data.topics as topic (topic.id)}
		<TopicStages
			{topic}
			summary={[
				m.count_stages({ count: topic.stages.length }),
				m.count_questions({
					count: topic.stages.reduce((sum, stage) => sum + stage.questionCount, 0)
				})
			].join(' · ')}
			onpick={(stop) => {
				picked = stop;
				open = true;
			}}
		>
			{#snippet tail(stage)}
				{@const tally = tallyOf(standings(stage))}
				<ClassBar {tally} />
				<span class="w-32 text-end text-muted-foreground tabular-nums">
					{m.progress_practised({
						done: data.students.length - tally.unpractised,
						count: data.students.length
					})}
				</span>
			{/snippet}
		</TopicStages>
	{/each}
{/if}

{#if picked}
	<ClassStageDialog
		bind:open
		stop={picked}
		rows={rowsOf(picked.stage)}
		onassign={assignable
			? () => {
					open = false;
					assigning = picked;
				}
			: undefined}
	/>
{/if}

{#if assigning !== undefined}
	<AssignDialog
		stop={assigning ?? undefined}
		topics={data.topics}
		students={data.students}
		standings={data.standings}
		onclosed={() => (assigning = undefined)}
	/>
{/if}
