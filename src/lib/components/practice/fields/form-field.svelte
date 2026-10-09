<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Field from '#lib/components/ui/field/index.js';
	import { cn } from '#lib/utils.js';
	import { hint as hintClass } from '../styles.js';
	import Issue from './issue.svelte';

	/**
	 * One field of a question's form: its label, a line of help, the control or
	 * controls, and what is wrong with it. A form is a column of these.
	 */
	let {
		label,
		for: controlId,
		hint,
		error,
		children
	}: {
		label: string;
		/** The id of the field's one control. Leave it out for a group of controls. */
		for?: string;
		hint?: string;
		/** What is wrong with the field as a whole: `editor.issue('options')`. */
		error?: string;
		children: Snippet;
	} = $props();

	const labelId = $props.id();
</script>

<!-- Only the control that is wrong is marked, not the field: a field can hold a dozen rows. -->
<Field.Field class="gap-2" aria-labelledby={controlId ? undefined : labelId}>
	{#if controlId}
		<Field.FieldLabel for={controlId} class="font-semibold">{label}</Field.FieldLabel>
	{:else}
		<Field.FieldTitle id={labelId} class="font-semibold">{label}</Field.FieldTitle>
	{/if}
	{#if hint}
		<Field.FieldDescription class={cn('m-0!', hintClass)}>{hint}</Field.FieldDescription>
	{/if}
	{@render children()}
	<Issue message={error} />
</Field.Field>
