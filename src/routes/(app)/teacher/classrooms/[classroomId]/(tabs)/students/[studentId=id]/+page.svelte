<script lang="ts">
	import Day from '#lib/components/app/day.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import TopicStages from '#lib/components/progress/topic-stages.svelte';
	import StageDialog from '#lib/components/runner/stage-dialog.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import StarsRow from '#lib/components/runner/stars.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { initials } from '#lib/initials.js';
	import { standingOf, summaryOf } from '#lib/items/progress.js';
	import { markFigure } from '#lib/items/run.js';
	import { sessionPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * One student's practice in a classroom, as their teacher follows it: what
	 * it comes to, then every stage with where they stand on it. A stage they
	 * have practised opens the dialog they are shown before a run, and each
	 * attempt in it leads to that practice as the student was shown it marked.
	 */
	let { data, params }: PageProps = $props();

	const student = $derived(data.student);
	const detail = $derived(
		[student.username, student.gradeLevelName].filter((part) => part !== null).join(' · ')
	);

	const stages = $derived(data.topics.flatMap((topic) => topic.stages));
	/** Where the student stands on each stage they have practised, by the stage's id. */
	const standings = $derived(
		Object.fromEntries(stages.map((stage) => [stage.id, standingOf(data.attempts[stage.id] ?? [])]))
	);
	const summary = $derived(summaryOf(stages.map((stage) => standings[stage.id])));

	// The stage whose dialog is open. It is kept when the dialog closes, so the dialog
	// does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);
</script>

<div class="flex items-center gap-4 px-2">
	<Avatar.Root class="size-12">
		<Avatar.Fallback>{initials(student.name)}</Avatar.Fallback>
	</Avatar.Root>
	<div class="grid min-w-0">
		<h2 class="truncate text-xl font-semibold">{student.name}</h2>
		{#if detail}
			<p class="truncate text-sm text-muted-foreground">{detail}</p>
		{/if}
	</div>
</div>

<StatStrip
	stats={[
		{ label: m.progress_stat_stages(), value: summary.stages, of: stages.length },
		{ label: m.progress_stat_stars(), value: summary.stars, of: stages.length * 3 },
		{ label: m.progress_stat_sessions(), value: summary.sessions },
		{ label: m.progress_last(), day: summary.last }
	]}
/>

{#each data.topics as topic (topic.id)}
	<TopicStages
		{topic}
		pickable={(stage) => standings[stage.id] !== undefined}
		onpick={(stop) => {
			picked = stop;
			open = true;
		}}
	>
		{#snippet tail(stage)}
			{@const standing = standings[stage.id]}
			{#if standing}
				<StarsRow count={standing.stars} class="[&_svg]:size-5" />
				<span class="w-16 text-end font-semibold tabular-nums">
					<span class="sr-only">
						{m.stars_score({
							marks: markFigure(standing.best.marks),
							total: standing.best.total
						})}
					</span>
					<span aria-hidden="true">
						{markFigure(standing.best.marks)}/{standing.best.total}
					</span>
				</span>
				<span class="w-24 text-end text-muted-foreground tabular-nums max-sm:hidden">
					{m.count_attempts({ count: standing.attempts })}
				</span>
				<Day
					at={standing.last}
					class="inline-block w-24 text-end text-muted-foreground first-letter:uppercase"
				/>
			{:else}
				<span class="text-muted-foreground">{m.stars_not_practised()}</span>
			{/if}
		{/snippet}
	</TopicStages>
{/each}

{#if picked}
	<StageDialog
		bind:open
		stop={picked}
		attempts={data.attempts[picked.stage.id] ?? []}
		attemptHref={(attempt) => resolvePath(sessionPath(params.classroomId, student.id, attempt.id))}
	/>
{/if}
