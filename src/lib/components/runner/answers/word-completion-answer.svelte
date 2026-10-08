<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import type { ItemResponse, ServedWordCompletion } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { cell, marked } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { wholeVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Word Completion question: a box for each letter of the word, the first
	 * one filled in when the question gives it away. The answer is the whole
	 * word, the given letter included.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedWordCompletion;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	// Cut by character, not by code unit, so a letter outside the basic plane is one box.
	const letters = $derived.by(() => {
		const typed = Array.from(answer.text_answer ?? '');
		return Array.from({ length: item.length }, (_, at) =>
			at === 0 && item.first_letter ? item.first_letter : (typed[at] ?? ' ').trim()
		);
	});

	const verdict = $derived(wholeVerdict(mark));

	/** The box beside this one, to move the cursor on to or back to. */
	const beside = (box: HTMLInputElement, step: 1 | -1) =>
		(step === 1 ? box.nextElementSibling : box.previousElementSibling) as HTMLInputElement | null;

	function write(at: number, box: HTMLInputElement) {
		// Whatever was typed or pasted over a letter, the box keeps the last character of it.
		const letter = Array.from(box.value.trim()).at(-1) ?? '';
		const next = letters.with(at, letter);
		const typed = next.some((each, index) => each && !(index === 0 && item.first_letter));
		// An empty box holds its place with a space, so the letters after it stay in theirs.
		answer = typed
			? {
					text_answer: next
						.map((each) => each || ' ')
						.join('')
						.trimEnd()
				}
			: {};
		box.value = letter;
		if (letter) beside(box, 1)?.focus();
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each letters as letter, at (at)}
		{@const given = at === 0 && item.first_letter !== null}
		<Input
			aria-label={m.item_letter({ n: at + 1 })}
			autocomplete="off"
			autocapitalize="off"
			spellcheck={false}
			readonly={readonly || given}
			class={cn(
				cell,
				'w-10 font-semibold',
				given && 'bg-secondary',
				verdict && !given && marked[verdict]
			)}
			value={letter}
			oninput={(event) => write(at, event.currentTarget)}
			onkeydown={(event) => {
				if (event.key === 'Backspace' && !letter) beside(event.currentTarget, -1)?.focus();
			}}
		/>
	{/each}
	{#if verdict}
		<MarkIcon {verdict} class="ms-1" />
	{/if}
</div>
