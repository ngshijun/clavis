<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { chip, chips } from '../styles.js';
	import AddChip from './add-chip.svelte';
	import ChipRemove from './chip-remove.svelte';
	import Chip from './chip.svelte';
	import { removeKeepingFocus } from './focus.js';

	/**
	 * A list of words or phrases as chips: each can be removed, and a dashed
	 * chip at the end turns into a field to type the next one into. Enter adds
	 * what was typed and keeps the field for another; leaving the field adds it
	 * and closes; Escape closes without adding.
	 */
	let {
		values = $bindable(),
		addLabel,
		tone = 'key',
		lead = [],
		max,
		invalid = false
	}: {
		values: string[];
		/** The dashed chip's word, and the name of the field it becomes: "Answer". */
		addLabel: string;
		/** `key` for a list of answers, `plain` for words that are not answers. */
		tone?: 'key' | 'plain';
		/** Words shown before the list as answers that are set elsewhere and cannot be removed here. */
		lead?: string[];
		/** No more can be added once the list is this long. */
		max?: number;
		/** Marks the dashed chip when the list itself is what is wrong. */
		invalid?: boolean;
	} = $props();

	let adding = $state(false);
	let typed = $state('');
	let row = $state<HTMLElement>();
	let adder = $state<HTMLElement | null>(null);

	/** Adds what was typed, unless it is blank or already there. */
	function commit() {
		const text = typed.trim();
		typed = '';
		// Assigned rather than pushed, so a list bound through a getter and a setter is written too.
		if (text && !values.includes(text) && !lead.includes(text)) values = [...values, text];
	}

	const full = $derived(max !== undefined && values.length >= max);

	function focus(input: HTMLInputElement) {
		input.focus();
	}
</script>

<div bind:this={row} class={chips}>
	{#each lead as text (text)}
		<Chip tone="key">{text}</Chip>
	{/each}
	<!-- No word is in the list twice, so a word is what tells one chip from another. -->
	{#each values as text (text)}
		<Chip {tone} class="pe-0.5" data-entry="chip">
			<span class="truncate">{text}</span>
			<ChipRemove
				label={m.practice_chip_remove({ text })}
				onclick={() =>
					removeKeepingFocus(
						row,
						'chip',
						() => (values = values.filter((each) => each !== text)),
						() => adder
					)}
			/>
		</Chip>
	{/each}
	{#if adding && !full}
		<Input
			bind:value={typed}
			aria-label={addLabel}
			autocomplete="off"
			class={cn(chip.dashed, 'w-32 bg-transparent py-0 text-foreground')}
			onkeydown={(event) => {
				// While words are being composed, as Chinese is, Enter settles them and Escape
				// takes them back: neither is meant for the list.
				if (event.isComposing) return;
				// Enter adds here and must not reach a form around the field.
				if (event.key === 'Enter') {
					event.preventDefault();
					commit();
				} else if (event.key === 'Escape') {
					typed = '';
					adding = false;
				}
			}}
			onblur={() => {
				commit();
				adding = false;
			}}
			{@attach focus}
		/>
	{:else if !full}
		<AddChip bind:ref={adder} label={addLabel} {invalid} onclick={() => (adding = true)} />
	{/if}
</div>
