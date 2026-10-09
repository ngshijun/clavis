<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import type { ItemResponse, ServedShortAnswer } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { field, marked } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { wholeVerdict, type AnswerMark } from '../marks.js';

	/** A Short Answer question: one box to type into. */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedShortAnswer;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const verdict = $derived(wholeVerdict(mark));
</script>

<div class="flex items-center gap-2">
	<Input
		aria-label={item.question ?? m.item_answer_placeholder()}
		placeholder={m.item_answer_placeholder()}
		autocomplete="off"
		autocapitalize="off"
		spellcheck={false}
		{readonly}
		class={cn(field, verdict && marked[verdict])}
		bind:value={
			() => answer.text_answer ?? '', (text) => (answer = text ? { text_answer: text } : {})
		}
	/>
	{#if verdict}
		<MarkIcon {verdict} />
	{/if}
</div>
