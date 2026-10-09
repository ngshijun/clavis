<script lang="ts">
	import { untrack } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Toggle } from '#lib/components/ui/toggle/index.js';
	import type { PickWordsPayload } from '#lib/items/payload.js';
	import { sentenceToWords, wordsToSentence } from '#lib/items/text.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getEditor } from '../editor.svelte.js';
	import FormField from '../fields/form-field.svelte';
	import { chip, chips, hint } from '../styles.js';
	import { carryMarks } from './pick-words-marks.js';

	/**
	 * A Pick Words question: a sentence, and the words in it that are answers.
	 * The sentence is cut into words at its spaces, and each word is a chip that
	 * is tapped to mark it.
	 */
	let { payload = $bindable() }: { payload: PickWordsPayload } = $props();

	const editor = getEditor();
	const id = $props.id();

	// The sentence as it is typed. The payload keeps only its words, so a space typed after the
	// last one would be lost if the field showed the words joined again.
	let sentence = $state(untrack(() => wordsToSentence(payload.options.map((word) => word.text))));

	function write(text: string) {
		sentence = text;
		payload.options = carryMarks(payload.options, sentenceToWords(text));
	}

	// The schema reports several things at `options`. Too few words, too many or a word too long
	// is about the sentence; with a sentence that will do, what is left to be wrong is which of
	// its words are marked.
	const short = $derived(payload.options.length < 2);
	const sentenceError = $derived(
		payload.options.map((_, index) => editor.issue('options', index, 'text')).find(Boolean) ??
			(short ? editor.issue('options') : undefined)
	);
	const marksError = $derived(short ? undefined : editor.issue('options'));
</script>

<FormField label={m.practice_pick_words_sentence()} for="{id}-sentence" error={sentenceError}>
	<Input
		id="{id}-sentence"
		bind:value={() => sentence, write}
		autocomplete="off"
		aria-invalid={sentenceError ? true : undefined}
	/>
</FormField>

<FormField label={m.practice_add_answer()} hint={m.practice_pick_words_hint()} error={marksError}>
	{#if payload.options.length > 0}
		<div class={chips}>
			{#each payload.options as word, index (index)}
				<!-- A chip that is pressed to mark it: plain until then, and an answer's colours after. -->
				<Toggle
					bind:pressed={word.is_correct}
					class={cn(
						chip.plain,
						'min-w-0 hover:bg-secondary hover:opacity-80 aria-pressed:bg-accent aria-pressed:text-accent-foreground'
					)}
				>
					<span class="truncate">{word.text}</span>
				</Toggle>
			{/each}
		</div>
	{:else}
		<p class={hint}>{m.practice_pick_words_empty()}</p>
	{/if}
</FormField>
