<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { McqPayload, MrqPayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import AddButton from '../fields/add-button.svelte';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import PictureField from '../fields/picture-field.svelte';
	import { cn } from '#lib/utils.js';
	import { rows } from '../styles.js';

	/**
	 * The options of a Multiple Choice or a Multiple Response question. The two
	 * differ only in how many options may be right: one, marked with a radio
	 * button, or several, each marked with a checkbox.
	 *
	 * An option carries its letter, the one a pupil sees beside it. A right
	 * one is green and says so, so the answer can be found without reading the
	 * marks. A wrong one's tip is a quiet line under it: it is a note on the
	 * option, and drawn as a second field it made four options look like seven.
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
			<InputGroup.Root class={cn('h-8', option.is_correct && 'border-success/60 bg-success/10')}>
				<InputGroup.Addon>
					<span class="w-3 font-semibold" aria-hidden="true">{name}</span>
				</InputGroup.Addon>
				<InputGroup.Input
					bind:value={option.text}
					aria-label={m.practice_option({ letter: name })}
					aria-invalid={error ? true : undefined}
				/>
				{#if option.is_correct}
					<!-- The words go where the card is too narrow for them and the option both. -->
					<InputGroup.Addon align="inline-end" class="gap-1 text-xs font-semibold text-success">
						<CheckIcon class="size-3.5" aria-hidden="true" />
						<span class="hidden @xl:inline">{m.practice_right_answer()}</span>
					</InputGroup.Addon>
				{/if}
			</InputGroup.Root>
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
					<!-- It starts under the option's letter. It is a field still, and fills as one when pointed at or typed in. -->
					<!-- It grows a line at a time, since a tip may run to a few. -->
					<div class="ms-6.5 flex items-start gap-1 ps-2.5 text-muted-foreground">
						<LightbulbIcon class="mt-2 size-3.5 shrink-0" aria-hidden="true" />
						<Textarea
							rows={1}
							bind:value={() => option.tip ?? '', (tip) => (option.tip = tip || undefined)}
							class="min-h-7 rounded-lg bg-transparent px-2 py-1 text-muted-foreground hover:bg-input/50 focus-visible:bg-input/50 focus-visible:text-foreground"
							placeholder={m.practice_option_tip_placeholder()}
							aria-label={m.practice_option_tip({ letter: name })}
							aria-invalid={tipError ? true : undefined}
						/>
					</div>
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
