<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import Day from '#lib/components/app/day.svelte';
	import WorkRow from '#lib/components/assignments/work-row.svelte';
	import { stopsOf } from '#lib/components/runner/stage-path.svelte';
	import StarsRow from '#lib/components/runner/stars.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { markFigure } from '#lib/items/run.js';
	import { starsOf } from '#lib/items/stars.js';
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

	const stops = $derived(stopsOf(data.topics));
	const sessions = $derived(
		Object.entries(data.attempts)
			.flatMap(([stageId, attempts]) => {
				const stop = stops[stageId];
				return stop ? attempts.map((attempt) => ({ attempt, stop })) : [];
			})
			.sort((a, b) => Date.parse(b.attempt.completedAt) - Date.parse(a.attempt.completedAt))
	);
</script>

{#if sessions.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<HistoryIcon />
			</Empty.Media>
			<Empty.Title>{m.practice_history_none_title()}</Empty.Title>
			<Empty.Description>{m.practice_history_none_description()}</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={resolvePath(classroomPracticePath('student', params.classroomId))}>
				{m.assignment_go_practice()}
			</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	<!-- A 22px card with an 8px inset, so a row has 14px corners. -->
	<Card.Root class="rounded-3xl p-2">
		<ul class="flex flex-col divide-y">
			{#each sessions as { attempt, stop } (attempt.id)}
				<WorkRow
					{stop}
					done
					href={resolvePath(classroomSessionPath(params.classroomId, attempt.id))}
				>
					{#snippet detail()}
						<Day at={attempt.completedAt} time />
					{/snippet}
					{#snippet tail()}
						<span class="font-semibold tabular-nums">
							<span class="sr-only">
								{m.stars_score({ marks: markFigure(attempt.marks), total: attempt.total })}
							</span>
							<span aria-hidden="true">{markFigure(attempt.marks)}/{attempt.total}</span>
						</span>
						<StarsRow count={starsOf(attempt.marks, attempt.total)} class="[&_svg]:size-5" />
						<ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					{/snippet}
				</WorkRow>
			{/each}
		</ul>
	</Card.Root>
{/if}
