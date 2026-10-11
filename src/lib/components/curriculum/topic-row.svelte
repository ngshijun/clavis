<script lang="ts">
	import CoverButton from '#lib/components/rows/cover-button.svelte';
	import DragHandle from '#lib/components/rows/drag-handle.svelte';
	import InlineName from '#lib/components/rows/inline-name.svelte';
	import RowDelete from '#lib/components/rows/row-delete.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Topic } from '#lib/server/curriculum.js';

	let { topic }: { topic: Topic } = $props();
</script>

<div class="group/row flex items-center gap-0.5">
	<DragHandle label={m.row_reorder({ name: topic.name })} />
	<CoverButton kind="topic" id={topic.id} name={topic.name} coverUrl={topic.coverUrl} />
	<InlineName kind="topic" id={topic.id} name={topic.name} class="flex-1" />
	<RowDelete target={{ kind: 'topic', id: topic.id, name: topic.name }} />
</div>
