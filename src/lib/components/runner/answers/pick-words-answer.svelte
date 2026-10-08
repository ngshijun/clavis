<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import type { ItemResponse, ServedPickWords } from '#lib/items/served.js';
	import { cn } from '#lib/utils.js';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type AnswerMark } from '../marks.js';
	import { marked } from '../styles.js';

	/** A Pick Words question: the sentence, each word of it something to tap. */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedPickWords;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const picked = $derived((answer.selected_options ?? []).map(String));
</script>

<ToggleGroup.Root
	type="multiple"
	spacing={2}
	disabled={readonly}
	class="flex w-full flex-wrap gap-x-1 gap-y-1.5"
	bind:value={
		() => picked,
		(values) => (answer = { selected_options: values.map(Number).sort((a, b) => a - b) })
	}
>
	{#each item.options as word (word.number)}
		<!-- Each word has a little room around it: where its highlight goes once it is tapped. -->
		{@const verdict = picked.includes(String(word.number))
			? partVerdict(mark, word.number)
			: undefined}
		<ToggleGroup.Item
			value={String(word.number)}
			class={cn(
				'h-auto min-w-0 rounded-sm px-1 py-0.5 text-base font-normal wrap-break-word whitespace-normal disabled:opacity-100 data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-accent-foreground data-[state=on]:underline',
				verdict && marked[verdict]
			)}
		>
			{word.text}
			{#if verdict}
				<MarkIcon {verdict} class="size-4" />
			{/if}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
