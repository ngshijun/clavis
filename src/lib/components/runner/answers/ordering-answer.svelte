<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dragHandleZone } from 'svelte-dnd-action';
	import DragHandle from '#lib/components/rows/drag-handle.svelte';
	import { FLIP_MS } from '#lib/components/rows/reorder.js';
	import type { ItemResponse, ServedOrdering } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { column, hint, marked, option } from '../styles.js';
	import ThingFace from './thing-face.svelte';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type AnswerMark } from '../marks.js';

	/**
	 * An Ordering question: the items as rows to drag into order. Until a row
	 * is moved nothing is answered, however the rows happen to lie.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedOrdering;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const id = $props.id();

	const ordered = $derived.by(() => {
		const order = answer.response?.order;
		if (!order) return item.items;
		return order.flatMap((each) => item.items.find((thing) => thing.id === each) ?? []);
	});
	// The order on screen follows a drag at once; the answer takes it when the row is dropped.
	let rows = $derived(ordered);
</script>

<div class="flex flex-col gap-4">
	<ol
		class={column}
		use:dragHandleZone={{
			items: rows,
			type: `order:${id}`,
			flipDurationMs: FLIP_MS,
			dropTargetStyle: {},
			dragDisabled: readonly
		}}
		onconsider={(event) => (rows = event.detail.items)}
		onfinalize={(event) => {
			rows = event.detail.items;
			answer = { response: { order: rows.map((row) => row.id) } };
		}}
	>
		{#each rows as row (row.id)}
			<!-- Nothing is marked on rows that were never moved: that is no answer. -->
			{@const verdict = answer.response?.order ? partVerdict(mark, row.id) : undefined}
			<li
				class={cn(option, 'flex items-center gap-1.5 ps-1.5', verdict && marked[verdict])}
				animate:flip={{ duration: FLIP_MS }}
			>
				{#if !readonly}
					<DragHandle label={m.row_reorder({ name: row.text })} />
				{/if}
				<ThingFace thing={row} />
				{#if verdict}
					<MarkIcon {verdict} class="ms-auto" />
				{/if}
			</li>
		{/each}
	</ol>
	{#if !readonly}
		<span class={hint}>{m.item_ordering_hint()}</span>
	{/if}
</div>
