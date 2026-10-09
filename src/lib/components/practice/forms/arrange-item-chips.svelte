<script lang="ts">
	import { tick } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import type { Item } from '#lib/items/payload.js';
	import AddChip from '../fields/add-chip.svelte';
	import ChipRemove from '../fields/chip-remove.svelte';
	import Chip from '../fields/chip.svelte';
	import { removeKeepingFocus } from '../fields/focus.js';
	import Issue from '../fields/issue.svelte';
	import PictureField from '../fields/picture-field.svelte';
	import { chips } from '../styles.js';

	/**
	 * Items as chips, for the lists a pupil sorts or picks from: the items of
	 * a Classify group, the extra answers of a Matching. Unlike a chip of
	 * plain words, each can carry a picture, so each is written in place: its
	 * words are a field and its picture a button beside them. The dashed chip
	 * at the end adds one, and Enter in a chip adds the next.
	 */
	let {
		items,
		addLabel,
		label,
		imageLabel,
		removeLabel,
		issue,
		onadd,
		onremove
	}: {
		/** The items to show. Their words and pictures are changed in place. */
		items: Item[];
		/** The dashed chip's word: "Item". */
		addLabel: string;
		/** Names the item at a position, counted from 1: "Item 2 of group 1". */
		label: (position: number) => string;
		imageLabel: (position: number) => string;
		removeLabel: (position: number) => string;
		/** What is wrong with an item, if anything. */
		issue: (item: Item) => string | undefined;
		/** Adds an empty item after the others and returns its id. */
		onadd: () => string;
		onremove: (id: string) => void;
	} = $props();

	let wrap = $state<HTMLElement>();
	let adder = $state<HTMLElement | null>(null);

	const empty = (item: Item) => !item.text.trim() && !item.image_path;

	async function add() {
		const id = onadd();
		await tick();
		wrap
			?.querySelector<HTMLInputElement>(`[data-item="${CSS.escape(id)}"] input[type="text"]`)
			?.focus();
	}

	/**
	 * Takes an item away again when it is left with neither words nor a
	 * picture, as a chip that was added and then not wanted.
	 */
	function leave(element: HTMLElement, item: Item) {
		// Looked at a moment later: the focus is nowhere while it moves from the words to the
		// picture button, and it is outside the page while a picture is being chosen.
		setTimeout(() => {
			if (empty(item) && document.hasFocus() && !element.contains(document.activeElement)) {
				onremove(item.id);
			}
		});
	}
</script>

<div bind:this={wrap} class={chips}>
	{#each items as item, index (item.id)}
		{@const position = index + 1}
		<Chip
			role="group"
			aria-label={label(position)}
			data-entry="chip"
			data-item={item.id}
			data-invalid={issue(item) ? '' : undefined}
			class="gap-0.5 px-0.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20"
			onfocusout={(event) => leave(event.currentTarget, item)}
		>
			<PictureField bind:path={item.image_path} size="chip" label={imageLabel(position)} />
			<!-- The field is as wide as its words: the hidden copy of them gives the cell its width. -->
			<span class="inline-grid min-w-0 items-center">
				<span
					aria-hidden="true"
					class="invisible col-start-1 row-start-1 min-w-8 overflow-hidden px-px whitespace-pre"
				>
					{item.text}
				</span>
				<!-- A field inside a chip: the chip is what is drawn, so the field brings no box of its own. -->
				<Input
					type="text"
					size={1}
					bind:value={item.text}
					aria-label={label(position)}
					aria-invalid={issue(item) ? true : undefined}
					autocomplete="off"
					class="col-start-1 row-start-1 h-auto rounded-none border-0 bg-transparent p-0 px-px text-sm focus-visible:ring-0 aria-invalid:ring-0 md:text-sm"
					onkeydown={(event) => {
						// Enter goes on to the next item, and must not reach a form around the field.
						// While words are being composed, as Chinese is, it only settles them.
						if (event.key !== 'Enter' || event.isComposing) return;
						event.preventDefault();
						if (!empty(item)) add();
					}}
				/>
			</span>
			<ChipRemove
				label={removeLabel(position)}
				onclick={() =>
					removeKeepingFocus(
						wrap,
						'chip',
						() => onremove(item.id),
						() => adder
					)}
			/>
		</Chip>
	{/each}
	<AddChip bind:ref={adder} label={addLabel} onclick={add} />
</div>
<Issue message={items.map(issue).find(Boolean)} />
