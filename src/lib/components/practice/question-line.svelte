<script lang="ts">
	import { ITEM_KINDS } from '#lib/items/kinds.js';
	import type { Difficulty, ItemType } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import DifficultyMeter from './difficulty-meter.svelte';
	import { KIND_ICONS } from './kind-icons.js';
	import { hint, number, numberOn } from './styles.js';

	/**
	 * What a row says of a question: where it stands among the stage's
	 * questions, the question itself, its type, its picture and its difficulty.
	 * It is the inside of a row; the row around it is a link, or a place kept
	 * for a question not saved yet.
	 *
	 * The question leads, on up to two lines, since it is what tells one row
	 * from another. The difficulty stands at the row's end, so the meters of a
	 * list make one column.
	 */
	let {
		position,
		type,
		difficulty,
		text,
		picture,
		open = false,
		unsaved = false
	}: {
		position: number;
		type: ItemType;
		difficulty: Difficulty;
		/** The question in one line; empty for one not written yet. */
		text: string;
		/** Where the question's own picture is shown from, if it has one. */
		picture?: string;
		/** Whether this is the question in the editor. */
		open?: boolean;
		/** Whether the question has changes that are not saved. */
		unsaved?: boolean;
	} = $props();

	const Icon = $derived(KIND_ICONS[type]);
</script>

<span class={open ? numberOn : number}>{position}</span>
<span class="grid min-w-0 flex-1 gap-0.5 leading-snug">
	<span class={cn('line-clamp-2 font-medium wrap-break-word', !text && 'text-muted-foreground')}>
		{text || m.practice_new_question()}
	</span>
	<span class={cn(hint, 'flex min-w-0 items-center gap-1.5')}>
		<Icon class="size-3.5 shrink-0" aria-hidden="true" />
		<span class="truncate">{ITEM_KINDS[type].label()}</span>
	</span>
</span>
{#if picture}
	<!--
		The row's corners are 14px and the picture stands 8px inside them, so its own are the
		ladder's smallest. The whole picture shows: two questions may differ only by theirs.
	-->
	<img
		src={picture}
		alt=""
		loading="lazy"
		class="h-10 w-13 shrink-0 self-center rounded-sm border bg-card object-contain"
	/>
{/if}
<span class="flex shrink-0 flex-col items-end justify-between self-stretch py-0.5">
	{#if unsaved}
		<span
			role="img"
			aria-label={m.practice_unsaved()}
			title={m.practice_unsaved()}
			class="mt-1 size-1.75 rounded-full bg-primary"
		></span>
	{:else}
		<span></span>
	{/if}
	<DifficultyMeter {difficulty} />
</span>
