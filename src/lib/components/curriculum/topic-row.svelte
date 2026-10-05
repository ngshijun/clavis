<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { Topic } from '#lib/server/curriculum.js';
	import CoverButton from './cover-button.svelte';
	import DragHandle from './drag-handle.svelte';
	import InlineName from './inline-name.svelte';
	import RowDelete from './row-delete.svelte';

	let { topic }: { topic: Topic } = $props();
</script>

<div class="group/row flex items-center gap-0.5">
	<DragHandle label={m.curriculum_reorder({ name: topic.name })} />
	<CoverButton kind="topic" id={topic.id} name={topic.name} coverUrl={topic.coverUrl} />
	<InlineName kind="topic" id={topic.id} name={topic.name} class="flex-1" />
	<RowDelete target={{ kind: 'topic', id: topic.id, name: topic.name }} />
</div>
