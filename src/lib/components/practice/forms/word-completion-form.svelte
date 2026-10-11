<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import type { WordCompletionPayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import { hint } from '../styles.js';

	/**
	 * A Word Completion question: the word a pupil spells, a box a letter, and
	 * whether its first letter is given away.
	 */
	let { payload = $bindable() }: { payload: WordCompletionPayload } = $props();

	const editor = getEditor();
	const id = $props.id();
	const error = $derived(editor.issue('answer'));
</script>

<FormField label={m.practice_add_answer()} for="{id}-answer">
	<Input
		id="{id}-answer"
		bind:value={payload.answer}
		class="max-w-50"
		autocomplete="off"
		autocapitalize="off"
		spellcheck={false}
		aria-describedby="{id}-answer-hint"
		aria-invalid={error ? true : undefined}
	/>
	<Issue message={error} />
	<p id="{id}-answer-hint" class={hint}>{m.practice_word_completion_hint()}</p>
	<Label class="font-normal">
		<!-- Off is no key at all, so a switch turned on and off again leaves nothing to save. -->
		<Switch
			size="sm"
			bind:checked={
				() => payload.reveal_first ?? false, (on) => (payload.reveal_first = on || undefined)
			}
		/>
		{m.practice_word_completion_reveal_first()}
	</Label>
</FormField>
