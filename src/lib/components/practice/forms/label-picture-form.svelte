<script lang="ts">
	import { tick, untrack } from 'svelte';
	import ImageIcon from '@lucide/svelte/icons/image';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PicturePicker from '#lib/components/app/picture-picker.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { CLOZE_MODE_LABELS, newId } from '#lib/items/kinds.js';
	import { LABEL_MODES, type LabelMode, type LabelPicturePayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getEditor } from '../editor.svelte.js';
	import ChipsField from '../fields/chips-field.svelte';
	import FormField from '../fields/form-field.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { hint, numberOn, rows } from '../styles.js';

	/**
	 * A Label a Picture question: the picture, a numbered label for each part a
	 * pupil names, and how pupils answer. A label is placed by pressing the
	 * picture and moved by dragging its number, or with the arrow keys.
	 */
	let { payload = $bindable() }: { payload: LabelPicturePayload } = $props();

	type Label = LabelPicturePayload['labels'][number];

	const editor = getEditor();
	const id = $props.id();
	const url = $derived(editor.imageUrl(payload.image_path));
	const pictureError = $derived(editor.issue('image_path'));

	const modes = LABEL_MODES.map((value) => ({ value, label: CLOZE_MODE_LABELS[value]() }));

	/** The labels' words as the word bank holds them: each once, and none that is still blank. */
	const words = $derived([
		...new Set(payload.labels.map((label) => label.text.trim()).filter(Boolean))
	]);

	/**
	 * The word bank's extra words. They are in the payload only while pupils
	 * answer from the bank, and kept here while the question is open, so trying
	 * Typing and coming back loses nothing and leaves nothing behind to save.
	 */
	let extras = $state(untrack(() => payload.distractors ?? []));

	function setBank(mode: LabelMode, words: string[]) {
		extras = words;
		payload.mode = mode;
		payload.distractors = mode === 'bank' && words.length > 0 ? [...words] : undefined;
	}

	let picker = $state<PicturePicker>();
	/** The picture itself. Its box is what a label's place is a percentage of. */
	let picture = $state<HTMLImageElement>();
	/** The button under the picture's numbers, which places a label. */
	let surface = $state<HTMLButtonElement>();

	/** A place on the picture's width or height: a percentage kept inside it, to one decimal. */
	function percent(value: number): number {
		return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
	}

	/** Where on the picture a point of the window is. */
	function placeOf(clientX: number, clientY: number): { x: number; y: number } {
		const box = picture!.getBoundingClientRect();
		return {
			x: percent(((clientX - box.left) / box.width) * 100),
			y: percent(((clientY - box.top) / box.height) * 100)
		};
	}

	/**
	 * Where a label placed from the keyboard goes: the middle of the picture,
	 * or the first place down from it that no label is on, so one label never
	 * hides another.
	 */
	function freePlace(): { x: number; y: number } {
		let at = 50;
		const taken = () =>
			payload.labels.some((label) => Math.abs(label.x - at) < 4 && Math.abs(label.y - at) < 4);
		while (at < 98 && taken()) at += 8;
		return { x: at, y: at };
	}

	/** Places a label where the picture was pressed, and moves on to its words. */
	async function place(event: MouseEvent) {
		// A press from the keyboard has no place of its own (`detail` counts the pointer's clicks).
		const at = event.detail === 0 ? freePlace() : placeOf(event.clientX, event.clientY);
		const label = { id: newId(), text: '', ...at };
		payload.labels.push(label);
		await tick();
		document.getElementById(`${id}-${label.id}`)?.focus();
	}

	/** How far from the middle of its number a label was taken hold of, so it does not jump there. */
	let hold = { x: 0, y: 0 };

	function grab(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (event.button !== 0) return;
		const pin = event.currentTarget;
		const box = pin.getBoundingClientRect();
		hold = {
			x: event.clientX - (box.left + box.width / 2),
			y: event.clientY - (box.top + box.height / 2)
		};
		// Captured, so the label follows the pointer wherever it goes until it is let go.
		pin.setPointerCapture(event.pointerId);
		// Safari does not move the focus to a button that is pressed.
		pin.focus();
	}

	function drag(event: PointerEvent & { currentTarget: HTMLButtonElement }, label: Label) {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
		Object.assign(label, placeOf(event.clientX - hold.x, event.clientY - hold.y));
	}

	/** Removes a label from its number on the picture, and keeps the focus on the picture. */
	async function removePin(index: number) {
		payload.labels.splice(index, 1);
		await tick();
		const pins = surface?.parentElement?.querySelectorAll<HTMLElement>('[data-pin]') ?? [];
		(pins[Math.min(index, pins.length - 1)] ?? surface)?.focus();
	}

	/** Removes a label from its row. After the last one, the picture is where the next is placed. */
	async function removeRow(index: number) {
		payload.labels.splice(index, 1);
		if (payload.labels.length > 0) return;
		await tick();
		surface?.focus();
	}

	function nudge(event: KeyboardEvent, label: Label, index: number) {
		const step = event.shiftKey ? 5 : 1;
		switch (event.key) {
			case 'ArrowLeft':
				label.x = percent(label.x - step);
				break;
			case 'ArrowRight':
				label.x = percent(label.x + step);
				break;
			case 'ArrowUp':
				label.y = percent(label.y - step);
				break;
			case 'ArrowDown':
				label.y = percent(label.y + step);
				break;
			case 'Delete':
			case 'Backspace':
				removePin(index);
				break;
			default:
				return;
		}
		// The arrows would scroll the form, and Backspace must not reach anything else.
		event.preventDefault();
	}
</script>

<!-- The labels stay where they are: a place is a share of the picture, whatever its size. -->
<PicturePicker
	bind:this={picker}
	onpick={(picked) => (payload.image_path = editor.addImage(picked))}
/>

<FormField label={m.practice_label_picture_picture()} error={pictureError}>
	{#if url}
		<!--
			The frame is exactly the picture's box and the numbers are placed on it by percentage, so
			each stays on its spot at any width. It does not clip: a number at the edge shows whole.
			The picture draws its own border, so the frame, the button and the picture are one shape.

			The picture and the numbers on it are plain buttons and not the app's Button: one is a
			surface that is pressed at a point and the other a mark that is dragged, and a Button's
			shape and the way it gives under a press belong to neither.
		-->
		<div class="relative w-full max-w-65">
			<button
				bind:this={surface}
				type="button"
				class="block w-full cursor-crosshair rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				aria-label={m.practice_label_picture_place()}
				onclick={place}
			>
				<img
					bind:this={picture}
					src={url}
					alt=""
					draggable="false"
					class="block w-full rounded-xl border bg-card"
				/>
			</button>
			{#each payload.labels as label, index (label.id)}
				<button
					type="button"
					data-pin
					class={cn(
						numberOn,
						'absolute -translate-1/2 cursor-grab touch-none ring-2 ring-card outline-offset-2 outline-ring select-none focus:z-10 focus-visible:outline-2 active:cursor-grabbing'
					)}
					style:left="{label.x}%"
					style:top="{label.y}%"
					aria-label={m.practice_label_picture_pin({ n: index + 1 })}
					aria-describedby="{id}-keys"
					onpointerdown={grab}
					onpointermove={(event) => drag(event, label)}
					onkeydown={(event) => nudge(event, label, index)}
				>
					{index + 1}
				</button>
			{/each}
		</div>
		<p class={hint}>{m.practice_label_picture_hint()}</p>
		<p id="{id}-keys" class="sr-only">{m.practice_label_picture_keys()}</p>
		<div class="flex flex-wrap gap-1">
			<Button variant="ghost" size="sm" onclick={() => picker?.open()}>
				<ImageUpIcon data-icon="inline-start" />
				{m.image_replace()}
			</Button>
			<!-- The labels are kept, for the picture that takes this one's place. -->
			<Button variant="ghost" size="sm" onclick={() => (payload.image_path = '')}>
				<Trash2Icon data-icon="inline-start" />
				{m.image_remove()}
			</Button>
		</div>
	{:else}
		<div
			class={cn(
				'flex w-full max-w-65 items-center justify-center rounded-xl border border-dashed border-border-strong/60 py-10',
				pictureError && 'border-destructive'
			)}
		>
			<Button
				variant="ghost"
				size="sm"
				aria-invalid={pictureError ? true : undefined}
				onclick={() => picker?.open()}
			>
				<ImageIcon data-icon="inline-start" />
				{m.practice_image_add()}
			</Button>
		</div>
	{/if}
</FormField>

<FormField label={m.practice_label_picture_labels()} error={editor.issue('labels')}>
	{#if payload.labels.length > 0}
		<div class={rows}>
			{#each payload.labels as label, index (label.id)}
				{@const error = editor.issue('labels', index, 'text')}
				<ItemRow
					{error}
					removeLabel={m.practice_label_picture_label_remove({ n: index + 1 })}
					onremove={() => removeRow(index)}
				>
					<span class={numberOn}>{index + 1}</span>
					<Input
						id="{id}-{label.id}"
						bind:value={label.text}
						class="h-8"
						aria-label={m.practice_label_picture_label({ n: index + 1 })}
						aria-invalid={error ? true : undefined}
					/>
				</ItemRow>
			{/each}
		</div>
	{:else}
		<p class={hint}>{m.practice_label_picture_labels_empty()}</p>
	{/if}
</FormField>

<FormField label={m.practice_answer_mode()} error={editor.issue('distractors')}>
	<!-- A block of its own, so the switch keeps its width in a column that stretches its children. -->
	<div>
		<Segmented
			bind:value={() => payload.mode, (mode) => setBank(mode, extras)}
			options={modes}
			label={m.practice_answer_mode()}
		/>
	</div>
	{#if payload.mode === 'bank'}
		<ChipsField
			bind:values={() => extras, (list) => setBank('bank', list)}
			lead={words}
			addLabel={m.practice_extra_word()}
			tone="plain"
			invalid={editor.issue('distractors') !== undefined}
		/>
	{/if}
</FormField>
