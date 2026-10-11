<script lang="ts">
	import { untrack } from 'svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import { TRUE_FALSE_WORDS, type TrueFalsePayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import FormField from '../fields/form-field.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { hint } from '../styles.js';

	/**
	 * A True or False question: which of the two is right, and the two words a
	 * pupil chooses between.
	 *
	 * `labels` holds the words picked under Answer words. A question without
	 * it is answered with the runner's own words for true and false, which the
	 * first of the presets stands for here: picking that one is having none.
	 */
	let { payload = $bindable() }: { payload: TrueFalsePayload } = $props();

	const editor = getEditor();
	const id = $props.id();

	type Words = readonly [string, string];
	const same = (a: Words, b: Words) => a[0] === b[0] && a[1] === b[1];
	const pair = ([yes, no]: Words) => `${yes} / ${no}`;

	// A question can come with words that are none of the presets, from an import. They stay
	// on offer while the question is open, so trying a preset does not lose them.
	const own = untrack((): Words | undefined => {
		const stored = payload.labels;
		if (!stored || TRUE_FALSE_WORDS.some((preset) => same(preset, stored))) return undefined;
		return [stored[0], stored[1]];
	});
	const choices: readonly Words[] = own ? [own, ...TRUE_FALSE_WORDS] : TRUE_FALSE_WORDS;

	const words = $derived<Words>(payload.labels ?? TRUE_FALSE_WORDS[0]);
	const chosen = $derived(choices.findIndex((choice) => same(choice, words)));
	const wordsError = $derived(editor.issue('labels', 0) ?? editor.issue('labels', 1));

	function choose(index: string) {
		const [yes, no] = choices[Number(index)];
		payload.labels = same([yes, no], TRUE_FALSE_WORDS[0]) ? undefined : [yes, no];
	}
</script>

<FormField label={m.practice_true_false_answer()} error={editor.issue('answer')}>
	<!-- A block of its own, so the two buttons keep their width in a column that stretches its children. -->
	<div>
		<Segmented
			label={m.practice_true_false_answer()}
			options={[
				{ value: 'true', label: words[0] },
				{ value: 'false', label: words[1] }
			] as const}
			bind:value={
				() => (payload.answer ? 'true' : 'false'), (answer) => (payload.answer = answer === 'true')
			}
		/>
	</div>
</FormField>

<FormField label={m.practice_true_false_words()} for="{id}-words" error={wordsError}>
	<!-- In a block of its own for the same reason: the select is as wide as its words. -->
	<div>
		<Select.Root type="single" bind:value={() => String(chosen), choose}>
			<Select.Trigger
				id="{id}-words"
				class="font-medium"
				aria-invalid={wordsError ? true : undefined}
			>
				{pair(words)}
			</Select.Trigger>
			<Select.Content>
				{#each choices as choice, index (index)}
					<Select.Item value={String(index)} label={pair(choice)} />
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<p class={hint}>{m.practice_true_false_words_hint()}</p>
</FormField>
