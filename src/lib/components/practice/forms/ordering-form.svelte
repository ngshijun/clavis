<script lang="ts">
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandleZone } from 'svelte-dnd-action';
	import DragHandle from '#lib/components/rows/drag-handle.svelte';
	import { FLIP_MS } from '#lib/components/rows/reorder.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { newId } from '#lib/items/kinds.js';
	import { inOrder } from '#lib/items/order.js';
	import type { Item, OrderingPayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import AddButton from '../fields/add-button.svelte';
	import FormField from '../fields/form-field.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import PictureField from '../fields/picture-field.svelte';
	import { number, rows } from '../styles.js';

	/**
	 * The items of an Ordering question. The rows stand in the right order:
	 * there is no other way to say what the order is, so dragging a row is how
	 * the answer is changed.
	 */
	let { payload = $bindable() }: { payload: OrderingPayload } = $props();

	const editor = getEditor();
	const zone = $props.id();

	// The rows follow a drag at once, and the payload when the row is put down.
	let ordered = $derived(inOrder(payload.items, payload.correct_order));

	/** Two items are the fewest that have an order. */
	const removable = $derived(ordered.length > 2);

	/** Writes the rows back: the items in the right order, and that order by id. */
	function commit(next: Item[]) {
		payload.items = next;
		payload.correct_order = next.map((item) => item.id);
	}

	let list = $state<HTMLElement>();

	async function add() {
		const item = { id: newId(), text: '' };
		commit([...ordered, item]);
		await tick();
		list?.querySelector<HTMLInputElement>(`[data-item="${CSS.escape(item.id)}"] input`)?.focus();
	}

	/** What is wrong with a row. The schema names it by its place in the payload's own list. */
	const issue = (item: Item) =>
		editor.issue(
			'items',
			payload.items.findIndex((each) => each.id === item.id),
			'text'
		);
</script>

<FormField
	label={m.practice_ordering_items()}
	hint={m.practice_ordering_hint()}
	error={editor.issue('items')}
>
	<div
		bind:this={list}
		class={rows}
		use:dragHandleZone={{
			items: ordered,
			type: zone,
			flipDurationMs: FLIP_MS,
			dropTargetStyle: {}
		}}
		onconsider={(event) => (ordered = event.detail.items)}
		onfinalize={(event) => {
			// Only the order is taken from the drag: the row that was dragged comes back as a copy.
			const order = event.detail.items.map((item) => item.id);
			commit(inOrder(payload.items, order));
		}}
	>
		{#each ordered as item, index (item.id)}
			{@const n = index + 1}
			{@const error = issue(item)}
			<!-- Named, so the drag library can say which row is being moved. -->
			<div
				data-item={item.id}
				aria-label={item.text || m.practice_arrange_item({ n })}
				animate:flip={{ duration: FLIP_MS }}
			>
				<ItemRow
					{error}
					removeLabel={m.practice_arrange_item_remove({ n })}
					onremove={removable
						? () => commit(ordered.filter((each) => each.id !== item.id))
						: undefined}
				>
					<DragHandle
						label={m.row_reorder({ name: item.text || m.practice_arrange_item({ n }) })}
					/>
					<span class={number}>{n}</span>
					<!--
						Bound through functions: while a row is dragged, the one in its place is a plain
						copy of it, which a direct binding would warn it cannot follow.
					-->
					<Input
						bind:value={() => item.text, (text) => (item.text = text)}
						class="h-8"
						aria-label={m.practice_arrange_item({ n })}
						aria-invalid={error ? true : undefined}
					/>
					<PictureField
						bind:path={() => item.image_path, (path) => (item.image_path = path)}
						size="row"
						label={m.practice_arrange_item_image({ n })}
					/>
				</ItemRow>
			</div>
		{/each}
	</div>
	<AddButton label={m.practice_ordering_add()} onclick={add} />
</FormField>
