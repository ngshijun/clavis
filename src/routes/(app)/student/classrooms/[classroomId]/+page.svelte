<script lang="ts">
	import { resolve } from '$app/paths';
	import TargetIcon from '@lucide/svelte/icons/target';
	import StagePath from '#lib/components/runner/stage-path.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { classroomStagePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	/** The stage to suggest: the first on the page the pupil has not practised here. */
	const next = $derived(
		data.topics.flatMap((topic) => topic.stages).find((stage) => !data.scores[stage.id])?.id
	);
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
			<StagePath
				{topic}
				scores={data.scores}
				{next}
				href={(stageId) => resolve(classroomStagePath(params.classroomId, stageId))}
			/>
		{/each}
	</div>
{/if}
