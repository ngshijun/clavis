<script lang="ts">
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import type { McqPayload, MrqPayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import AddButton from '../fields/add-button.svelte';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import PictureField from '../fields/picture-field.svelte';
	import { rows } from '../styles.js';

	/**
	 * The options of a Multiple Choice or a Multiple Response question. The two
	 * differ only in how many options may be right: one, marked with a radio
	 * button, or several, each marked with a checkbox.
	 */
	let { payload = $bindable() }: { payload: McqPayload | MrqPayload } = $props();

	const editor = getEditor();
	const single = $derived(payload.type === 'mcq');
	const letter = (index: number) => String.fromCharCode(65 + index);

	/** A question needs two options to be a choice at all. */
	const removable = $derived(payload.options.length > 2);
</script>

{#snippet optionRows()}
	{#each payload.options as option, index (index)}
		{@const name = letter(index)}
		{@const error = editor.issue('options', index, 'text')}
		<ItemRow
			{error}
			removeLabel={m.practice_option_remove({ letter: name })}
			onremove={removable ? () => payload.options.splice(index, 1) : undefined}
		>
			{#if single}
				<RadioGroup.Item
					value={String(index)}
					class="size-5"
					aria-label={m.practice_option_correct({ letter: name })}
				/>
			{:else}
				<Checkbox
					bind:checked={option.is_correct}
					class="size-5 rounded-sm"
					aria-label={m.practice_option_correct({ letter: name })}
				/>
			{/if}
			<Input
				bind:value={option.text}
				class="h-8"
				aria-label={m.practice_option({ letter: name })}
				aria-invalid={error ? true : undefined}
			/>
			<PictureField
				bind:path={option.image_path}
				size="row"
				label={m.practice_option_image({ letter: name })}
			/>
			{#snippet below()}
				<!--
					A pupil who picks a right option needs no tip, so only a wrong one shows the field.
					A tip written before the option was marked right is kept while the question is open,
					in case the mark is taken back, and is not stored with a right option.
				-->
				{#if !option.is_correct}
					{@const tipError = editor.issue('options', index, 'tip')}
					<Input
						bind:value={() => option.tip ?? '', (tip) => (option.tip = tip || undefined)}
						class="ms-6.5 h-8 w-auto"
						placeholder={m.practice_option_tip_placeholder()}
						aria-label={m.practice_option_tip({ letter: name })}
						aria-invalid={tipError ? true : undefined}
					/>
					<Issue message={tipError} />
				{/if}
			{/snippet}
		</ItemRow>
	{/each}
{/snippet}

<FormField
	label={m.practice_options()}
	hint={single ? m.practice_mcq_hint() : m.practice_mrq_hint()}
	error={editor.issue('options')}
>
	{#if single}
		<RadioGroup.Root
			class={rows}
			aria-label={m.practice_options()}
			bind:value={
				() => String(payload.options.findIndex((option) => option.is_correct)),
				(chosen) =>
					payload.options.forEach((option, index) => (option.is_correct = String(index) === chosen))
			}
		>
			{@render optionRows()}
		</RadioGroup.Root>
	{:else}
		<div class={rows}>
			{@render optionRows()}
		</div>
	{/if}
	<AddButton
		label={m.practice_add_option()}
		onclick={() => payload.options.push({ text: '', is_correct: false })}
	/>
</FormField>
