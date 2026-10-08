<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { ItemResponse, ServedCloze } from '#lib/items/served.js';
	import { clozeSegments } from '#lib/items/text.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { bankWords, nextPlace } from '../bank.js';
	import { chip, chips, marked, slot, text } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Fill in the Blanks question: the text with a gap at each blank. The gap
	 * is a box to type into, a place for a word from the bank under the text,
	 * or a list of choices to pick from.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedCloze;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const parts = $derived(clozeSegments(item.text));
	const indexes = $derived(item.blanks.map((blank) => blank.index));
	const filled = $derived(answer.response?.blanks ?? []);

	const valueOf = (index: number) => filled.find((blank) => blank.index === index)?.value ?? '';
	// A blank left empty was not answered: it is not marked wrong.
	const verdictOf = (index: number) => (valueOf(index) ? partVerdict(mark, index) : undefined);
	const markedOf = (index: number) => {
		const verdict = verdictOf(index);
		return verdict && marked[verdict];
	};
	const choicesOf = (index: number) =>
		item.blanks.find((blank) => blank.index === index)?.choices ?? [];

	function fill(index: number, value: string) {
		const blanks = [
			...filled.filter((blank) => blank.index !== index),
			...(value ? [{ index, value }] : [])
		];
		answer = blanks.length > 0 ? { response: { blanks } } : {};
	}

	// Word bank: the blank the next word goes to, when the pupil has chosen one.
	let chosen = $state<number>();
	const words = $derived(
		bankWords(
			item.bank ?? [],
			filled.map((blank) => blank.value),
			item.reuse
		)
	);

	function place(word: string) {
		const index = nextPlace(indexes, (each) => valueOf(each) !== '', chosen);
		if (index === undefined) return;
		fill(index, word);
		chosen = undefined;
	}
</script>

{#snippet tick(index: number)}
	{@const verdict = verdictOf(index)}
	{#if verdict}<MarkIcon {verdict} class="me-1 align-middle" />{/if}
{/snippet}

<div class="flex flex-col gap-4">
	<!-- The text keeps its line breaks, so none may come from the markup. -->
	<!-- prettier-ignore -->
	<p class={text}>{#each parts as part, at (at)}{#if part.kind === 'text'}{part.text}{:else if item.mode === 'bank'}<Button
				variant="ghost"
				aria-label={m.practice_cloze_blank({ n: part.index })}
				aria-pressed={chosen === part.index}
				data-filled={valueOf(part.index) ? '' : undefined}
				data-active={chosen === part.index ? '' : undefined}
				disabled={readonly}
				class={cn(slot, 'mx-0.5 align-middle', markedOf(part.index))}
				onclick={() => {
					if (valueOf(part.index)) fill(part.index, '');
					chosen = part.index;
				}}>{valueOf(part.index)}</Button>{:else if item.mode === 'choices'}<Select.Root
				type="single"
				disabled={readonly}
				bind:value={() => valueOf(part.index), (value) => fill(part.index, value)}
			><Select.Trigger
					aria-label={m.practice_cloze_blank({ n: part.index })}
					class={cn('mx-0.5 inline-flex h-8 w-auto align-middle disabled:opacity-100', markedOf(part.index))}
				>{valueOf(part.index) || m.item_cloze_choose()}</Select.Trigger><Select.Content><Select.Group>{#each choicesOf(part.index) as choice (choice)}<Select.Item value={choice} label={choice} />{/each}</Select.Group></Select.Content></Select.Root>{:else}<Input
				aria-label={m.practice_cloze_blank({ n: part.index })}
				autocomplete="off"
				autocapitalize="off"
				spellcheck={false}
				{readonly}
				class={cn('mx-0.5 inline-flex h-8 w-28 align-middle', markedOf(part.index))}
				bind:value={() => valueOf(part.index), (value) => fill(part.index, value)}
			/>{/if}{#if part.kind === 'blank'}{@render tick(part.index)}{/if}{/each}</p>

	{#if item.mode === 'bank' && words.length > 0 && !readonly}
		<div class={chips}>
			{#each words as { word, free }, at (at)}
				<Button variant="secondary" disabled={!free} class={chip} onclick={() => place(word)}>
					<span class="truncate">{word}</span>
				</Button>
			{/each}
		</div>
	{/if}
</div>
