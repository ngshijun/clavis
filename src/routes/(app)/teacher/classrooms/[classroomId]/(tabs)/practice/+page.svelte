<script lang="ts">
	import TargetIcon from '@lucide/svelte/icons/target';
	import AssignDialog from '#lib/components/assignments/assign-dialog.svelte';
	import ClassBar from '#lib/components/progress/class-bar.svelte';
	import ClassKey from '#lib/components/progress/class-key.svelte';
	import ClassStageDialog from '#lib/components/progress/class-stage-dialog.svelte';
	import TopicStages from '#lib/components/progress/topic-stages.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { tallyOf } from '#lib/items/progress.js';
	import { studentPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Stage } from '#lib/server/practice.js';
	import type { PageProps } from './$types';

	/**
	 * A classroom's practice: the stages its students are offered, topic by
	 * topic, each with how the class stands on it. A stage opens to show the
	 * same student by student, and can be assigned from there.
	 */
	let { data, params }: PageProps = $props();

	/** Where each student of the classroom stands on a stage, in the roster's order. */
	const standings = (stage: Stage) =>
		data.students.map((student) => data.standings[student.id]?.[stage.id]);

	// The stage whose dialog is open. It is kept when the dialog closes, so the dialog
	// does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);
	/** The stage being assigned, while its dialog is up. */
	let assigning = $state<Stop>();

	/** Every student of the classroom on a stage, for its dialog. */
	function rowsOf(stage: Stage) {
		const standing = standings(stage);
		return data.students.map((student, index) => ({
			id: student.id,
			name: student.name,
			standing: standing[index],
			href: resolvePath(studentPath(params.classroomId, student.id))
		}));
	}
</script>

{#if data.topics.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<TargetIcon />
			</Empty.Media>
			<Empty.Title>{m.practice_none_title()}</Empty.Title>
			<Empty.Description>{m.practice_none_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
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
		onassign={() => {
			open = false;
			assigning = picked;
		}}
	/>
{/if}

{#if assigning}
	<AssignDialog
		stop={assigning}
		rows={rowsOf(assigning.stage)}
		onclosed={() => (assigning = undefined)}
	/>
{/if}
