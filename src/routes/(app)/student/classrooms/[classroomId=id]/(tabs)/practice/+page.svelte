<script lang="ts">
	import TargetIcon from '@lucide/svelte/icons/target';
	import StageDialog from '#lib/components/runner/stage-dialog.svelte';
	import StagePath, { type Stop } from '#lib/components/runner/stage-path.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { bestOf } from '#lib/items/stars.js';
	import { classroomStagePath } from '#lib/navigation.js';
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
	<div class="flex flex-col gap-4">
		{#each data.topics as topic (topic.id)}
			<StagePath {topic} {best} onpick={pick} />
		{/each}
	</div>
{/if}

{#if picked}
	<StageDialog
		bind:open
		stop={picked}
		attempts={data.attempts[picked.stage.id] ?? []}
		href={resolvePath(classroomStagePath(params.classroomId, picked.stage.id))}
	/>
{/if}
