<script lang="ts">
	import type { ShortAnswerPayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import ChipsField from '../fields/chips-field.svelte';
	import FormField from '../fields/form-field.svelte';

	/** The answers a Short Answer question accepts: every spelling that counts as right. */
	let { payload = $bindable() }: { payload: ShortAnswerPayload } = $props();

	const editor = getEditor();
	const error = $derived(editor.issue('accepted_answers'));
</script>

<FormField label={m.practice_accepted_answers()} hint={m.practice_short_answer_hint()} {error}>
	<ChipsField
		bind:values={payload.accepted_answers}
		addLabel={m.practice_add_answer()}
		invalid={error !== undefined}
	/>
</FormField>
