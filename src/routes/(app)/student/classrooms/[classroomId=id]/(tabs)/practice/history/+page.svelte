<script lang="ts">
	import HistoryIcon from '@lucide/svelte/icons/history';
	import Day from '#lib/components/app/day.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import Score from '#lib/components/runner/score.svelte';
	import { stopsOf } from '#lib/components/runner/stage-path.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { sessionsOf } from '#lib/items/work.js';
	import { classroomPracticePath, classroomSessionPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * Every practice session the student has finished in a classroom, the
	 * latest first, whatever stage it was of. Each opens the session as they
	 * were shown it marked. A session of a stage that can no longer be
	 * practised is not listed, as it is not on the path either.
	 */
	let { data, params }: PageProps = $props();

	const sessions = $derived(sessionsOf(data.attempts, stopsOf(data.topics)));
</script>

{#if sessions.length === 0}
	<EmptyState
		icon={HistoryIcon}
		title={m.practice_history_none_title()}
		description={m.practice_history_none_description()}
	>
		<Button size="lg" href={resolvePath(classroomPracticePath('student', params.classroomId))}>
			{m.assignment_go_practice()}
		</Button>
	</EmptyState>
{:else}
	<ListCard>
		{#each sessions as { attempt, stop } (attempt.id)}
			<WorkRow {stop} done href={resolvePath(classroomSessionPath(params.classroomId, attempt.id))}>
				{#snippet detail()}
					<Day at={attempt.completedAt} time />
				{/snippet}
				{#snippet tail()}
					<Score score={attempt} />
				{/snippet}
			</WorkRow>
		{/each}
	</ListCard>
{/if}
