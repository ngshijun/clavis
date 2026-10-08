<script lang="ts">
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import type { ItemResponse, ServedTickTable } from '#lib/items/served.js';
	import { cn } from '#lib/utils.js';
	import { hint, marked } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Tick Table: the columns' names across the top, and under them a row
	 * for each statement with one place to tick in every column.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedTickTable;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	// The statement takes the room the columns leave. A column is as wide as its name, within
	// limits: a long name wraps rather than push the statements out of view.
	const columns = $derived(
		['minmax(6rem, 1fr)', ...item.groups.map(() => 'fit-content(5rem)')].join(' ')
	);
	const ticks = $derived(answer.response?.items ?? []);

	function tick(id: string, group_id: string) {
		answer = { response: { items: [...ticks.filter((row) => row.id !== id), { id, group_id }] } };
	}
</script>

<!-- Five columns are wider than a narrow screen: the table then scrolls sideways. -->
<div class="overflow-x-auto">
	<div class="grid gap-y-2" style:grid-template-columns={columns}>
		<div class="col-span-full grid grid-cols-subgrid items-end" aria-hidden="true">
			{#each item.groups as group (group.id)}
				<span class={cn(hint, 'min-w-13 px-1 text-center wrap-break-word first:col-start-2')}>
					{group.text}
				</span>
			{/each}
		</div>
		{#each item.items as row (row.id)}
			{@const verdict = ticks.some((each) => each.id === row.id)
				? partVerdict(mark, row.id)
				: undefined}
			<RadioGroup.Root
				aria-label={row.text}
				orientation="horizontal"
				disabled={readonly}
				class={cn(
					'col-span-full grid grid-cols-subgrid items-center gap-0 rounded-lg border bg-card',
					verdict && marked[verdict]
				)}
				bind:value={
					() => ticks.find((each) => each.id === row.id)?.group_id ?? '',
					(group) => tick(row.id, group)
				}
			>
				<span class="flex min-w-0 items-center gap-2 px-3 py-2 text-sm">
					<span class="min-w-0 flex-1 wrap-break-word">{row.text}</span>
					{#if verdict}
						<MarkIcon {verdict} />
					{/if}
				</span>
				{#each item.groups as group (group.id)}
					<RadioGroup.Item
						value={group.id}
						aria-label={group.text}
						class="mx-3 size-7 justify-self-center border-border-strong bg-card disabled:opacity-100"
					/>
				{/each}
			</RadioGroup.Root>
		{/each}
	</div>
</div>
