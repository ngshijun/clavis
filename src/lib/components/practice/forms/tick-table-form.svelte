<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { newId } from '#lib/items/kinds.js';
	import type { TickTablePayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import AddButton from '../fields/add-button.svelte';
	import AddChip from '../fields/add-chip.svelte';
	import { removeKeepingFocus } from '../fields/focus.js';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import { chips, rows } from '../styles.js';

	/**
	 * A Tick Table: the columns the admin names, and the rows a pupil ticks
	 * under one of them. Each row keeps the id of the column that is right for
	 * it, so a column can be renamed without its rows losing their answer.
	 */
	let { payload = $bindable() }: { payload: TickTablePayload } = $props();

	const editor = getEditor();

	/** A tick table is a choice between columns, and wider than five it no longer fits a phone. */
	const FEWEST_COLUMNS = 2;
	const MOST_COLUMNS = 5;

	/** The column or row added last: its field takes the focus, so its words can be typed at once. */
	let added = $state<string>();

	let columns = $state<HTMLElement>();

	function focus(input: HTMLElement) {
		input.focus();
	}

	/** What a column is called where it has to be called something: its name, or its place until it has one. */
	function columnName(index: number): string {
		return payload.groups[index].text.trim() || m.practice_tick_table_column({ n: index + 1 });
	}

	function addColumn() {
		added = newId();
		payload.groups.push({ id: added, text: '' });
	}

	function removeColumn(index: number) {
		const [gone] = payload.groups.splice(index, 1);
		// A row ticked under the column is left with no answer, to be chosen again.
		for (const row of payload.items) {
			if (row.group_id === gone.id) row.group_id = '';
		}
	}

	function addRow() {
		added = newId();
		payload.items.push({ id: added, text: '', group_id: '' });
	}

	/** What is wrong with the columns' names, each thing said once however many columns it is true of. */
	const columnIssues = $derived(
		payload.groups
			.map((_, index) => editor.issue('groups', index, 'text'))
			.filter((message, index, all) => message !== undefined && all.indexOf(message) === index)
	);
</script>

<FormField
	label={m.practice_tick_table_columns()}
	hint={m.practice_tick_table_columns_hint()}
	error={editor.issue('groups')}
>
	<div bind:this={columns} class={chips}>
		{#each payload.groups as group, index (group.id)}
			{@const name = m.practice_tick_table_column({ n: index + 1 })}
			<InputGroup.Root class="h-8 w-32" data-entry="chip">
				<InputGroup.Input
					bind:value={group.text}
					class="h-full px-3"
					placeholder={name}
					aria-label={name}
					aria-invalid={editor.issue('groups', index, 'text') ? true : undefined}
					{@attach group.id === added && focus}
				/>
				{#if payload.groups.length > FEWEST_COLUMNS}
					<InputGroup.Addon align="inline-end" class="pr-1">
						<IconButton
							variant="ghost"
							size="icon-xs"
							data-remove
							label={m.practice_tick_table_column_remove({ n: index + 1 })}
							class="text-muted-foreground"
							onclick={() => removeKeepingFocus(columns, 'chip', () => removeColumn(index))}
						>
							<XIcon />
						</IconButton>
					</InputGroup.Addon>
				{/if}
			</InputGroup.Root>
		{/each}
		{#if payload.groups.length < MOST_COLUMNS}
			<AddChip label={m.practice_tick_table_add_column()} onclick={addColumn} />
		{/if}
	</div>
	{#each columnIssues as message (message)}
		<Issue {message} />
	{/each}
</FormField>

<FormField
	label={m.practice_tick_table_rows()}
	hint={m.practice_tick_table_rows_hint()}
	error={editor.issue('items')}
>
	<div class={rows}>
		{#each payload.items as row, index (row.id)}
			{@const n = index + 1}
			{@const textError = editor.issue('items', index, 'text')}
			{@const columnError = editor.issue('items', index, 'group_id')}
			{@const column = payload.groups.findIndex((group) => group.id === row.group_id)}
			<ItemRow
				error={textError}
				removeLabel={m.practice_tick_table_row_remove({ n })}
				onremove={payload.items.length > 1 ? () => payload.items.splice(index, 1) : undefined}
			>
				<Input
					bind:value={row.text}
					class="h-8"
					placeholder={m.practice_tick_table_row({ n })}
					aria-label={m.practice_tick_table_row({ n })}
					aria-invalid={textError ? true : undefined}
					{@attach row.id === added && focus}
				/>
				<Select.Root type="single" bind:value={row.group_id}>
					<Select.Trigger
						size="sm"
						class="w-28 shrink-0 font-medium"
						aria-label={m.practice_tick_table_row_column({ n })}
						aria-invalid={columnError ? true : undefined}
					>
						<span class="truncate">
							{column === -1 ? m.practice_tick_table_choose() : columnName(column)}
						</span>
					</Select.Trigger>
					<Select.Content>
						{#each payload.groups as group, at (group.id)}
							<Select.Item value={group.id} label={columnName(at)} />
						{/each}
					</Select.Content>
				</Select.Root>
				{#snippet below()}
					<Issue message={columnError} />
				{/snippet}
			</ItemRow>
		{/each}
	</div>
	<AddButton label={m.practice_tick_table_add_row()} onclick={addRow} />
</FormField>
