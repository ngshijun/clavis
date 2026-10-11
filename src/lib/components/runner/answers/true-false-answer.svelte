<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { TRUE_FALSE_WORDS } from '#lib/items/payload.js';
	import type { ItemResponse, ServedTrueFalse } from '#lib/items/served.js';
	import { cn } from '#lib/utils.js';
	import { marked, option } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { wholeVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A True or False question: the two answer words, side by side. A question
	 * with no words of its own is answered with True and False.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedTrueFalse;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const words = $derived(item.labels ?? TRUE_FALSE_WORDS[0]);
	const chosen = $derived(
		answer.response?.value === undefined ? '' : String(answer.response.value)
	);
</script>

<ToggleGroup.Root
	type="single"
	spacing={2}
	disabled={readonly}
	class="flex w-full gap-2"
	bind:value={
		() => chosen, (value) => (answer = value ? { response: { value: value === 'true' } } : {})
	}
>
	{#each words as word, at (at)}
		{@const verdict = chosen === String(at === 0) ? wholeVerdict(mark) : undefined}
		<ToggleGroup.Item
			value={String(at === 0)}
			class={cn(
				option,
				'min-w-0 flex-1 justify-center text-center font-semibold',
				mark && 'text-muted-foreground',
				verdict && marked[verdict]
			)}
		>
			<span class="min-w-0 wrap-break-word">{word}</span>
			{#if verdict}
				<MarkIcon {verdict} />
			{/if}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
