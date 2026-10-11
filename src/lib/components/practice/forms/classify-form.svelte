<script lang="ts">
	import { tick } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { newId } from '#lib/items/kinds.js';
	import type { ClassifyPayload, Item } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import AddButton from '../fields/add-button.svelte';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import ArrangeItemChips from './arrange-item-chips.svelte';

	/**
	 * The groups of a Classify question, each a box with its name and the
	 * items that belong in it. Writing an item in a box is what says where it
	 * goes: the payload keeps the items in one list, each naming its group.
	 */
	let { payload = $bindable() }: { payload: ClassifyPayload } = $props();

	const editor = getEditor();

	/** How many groups a Classify question may have, as the schema checks it. */
	const FEWEST = 2;
	const MOST = 4;

	let boxes = $state<HTMLElement>();

	async function addGroup() {
		const group = { id: newId(), text: '' };
		payload.groups.push(group);
		await tick();
		boxes?.querySelector<HTMLInputElement>(`[data-group="${CSS.escape(group.id)}"] input`)?.focus();
	}

	/** A group goes with everything in it: an item is nowhere without its group. */
	function removeGroup(id: string) {
		payload.groups = payload.groups.filter((group) => group.id !== id);
		payload.items = payload.items.filter((item) => item.group_id !== id);
	}

	function addItem(groupId: string): string {
		const item = { id: newId(), text: '', group_id: groupId };
		payload.items.push(item);
		return item.id;
	}

	const position = (item: Item) => payload.items.findIndex((each) => each.id === item.id);

	/** An item whose group is gone has no box to show it in, so what is wrong with it is said once. */
	const unplaced = $derived(
		payload.items.findIndex((item) => !payload.groups.some((group) => group.id === item.group_id))
	);
</script>

<FormField
	label={m.practice_classify_groups()}
	hint={m.practice_classify_hint()}
	error={editor.issue('groups') ?? editor.issue('items')}
>
	<div bind:this={boxes} class="flex flex-col gap-2">
		{#each payload.groups as group, index (group.id)}
			{@const n = index + 1}
			{@const error = editor.issue('groups', index, 'text')}
			<div data-group={group.id} class="flex flex-col gap-2 rounded-xl border p-2.5">
				<ItemRow
					{error}
					removeLabel={m.practice_classify_group_remove({ n })}
					onremove={payload.groups.length > FEWEST ? () => removeGroup(group.id) : undefined}
				>
					<Input
						bind:value={group.text}
						class="h-8 font-semibold"
						aria-label={m.practice_classify_group({ n })}
						aria-invalid={error ? true : undefined}
					/>
				</ItemRow>
				<ArrangeItemChips
					items={payload.items.filter((item) => item.group_id === group.id)}
					addLabel={m.practice_classify_item_add()}
					label={(item) => m.practice_classify_item({ n: item, group: n })}
					imageLabel={(item) => m.practice_classify_item_image({ n: item, group: n })}
					removeLabel={(item) => m.practice_classify_item_remove({ n: item, group: n })}
					issue={(item) => editor.issue('items', position(item), 'text')}
					onadd={() => addItem(group.id)}
					onremove={(id) => (payload.items = payload.items.filter((item) => item.id !== id))}
				/>
			</div>
		{/each}
	</div>
	{#if payload.groups.length < MOST}
		<AddButton label={m.practice_classify_group_add()} onclick={addGroup} />
	{/if}
	<Issue message={editor.issue('items', unplaced, 'group_id')} />
</FormField>
