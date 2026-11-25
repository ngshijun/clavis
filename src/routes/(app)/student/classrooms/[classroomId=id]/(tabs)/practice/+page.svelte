<script lang="ts">
	import HistoryIcon from '@lucide/svelte/icons/history';
	import TargetIcon from '@lucide/svelte/icons/target';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import StageDialog from '#lib/components/runner/stage-dialog.svelte';
	import StagePath, { type Stop } from '#lib/components/runner/stage-path.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { bestOf } from '#lib/items/stars.js';
	import {
		classroomHistoryPath,
		classroomSessionPath,
		classroomStagePath
	} from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Score } from '#lib/server/run.js';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	/** The best the pupil has scored on each stage they have practised here, by the stage's id. */
	const best = $derived(
		Object.fromEntries(
			Object.entries(data.attempts).flatMap(([stageId, attempts]): [string, Score][] => {
				const top = bestOf(attempts);
				return top ? [[stageId, top]] : [];
			})
		)
	);

	// The stage whose dialog is open. It is kept when the dialog closes, so the dialog
	// does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);

	function pick(stop: Stop) {
		picked = stop;
		open = true;
	}
</script>

{#if data.topics.length === 0}
	<EmptyState
		icon={TargetIcon}
		title={m.practice_none_title()}
		description={m.practice_none_description()}
	/>
{:else}
	<PageToolbar>
		<!-- Every session finished here, whatever its stage; a stage's own are in its dialog. -->
		<Button
			variant="outline"
			size="lg"
			href={resolvePath(classroomHistoryPath(params.classroomId))}
		>
			<HistoryIcon data-icon="inline-start" />
			{m.practice_history()}
		</Button>
	</PageToolbar>
	{#each data.topics as topic (topic.id)}
		<StagePath {topic} {best} onpick={pick} />
	{/each}
{/if}

{#if picked}
	<StageDialog
		bind:open
		stop={picked}
		attempts={data.attempts[picked.stage.id] ?? []}
		href={resolvePath(classroomStagePath(params.classroomId, picked.stage.id))}
		attemptHref={(attempt) => resolvePath(classroomSessionPath(params.classroomId, attempt.id))}
	/>
{/if}
