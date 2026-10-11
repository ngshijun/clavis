<script lang="ts">
	import { DIFFICULTY_LABELS, ITEM_KINDS } from '#lib/items/kinds.js';
	import type { Difficulty, ItemType } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { hint, number, numberOn } from './styles.js';

	/**
	 * What a row says of a question: where it stands among the stage's
	 * questions, its type and difficulty, and the question itself. It is the
	 * inside of a row; the row around it is a link, or a place kept for a
	 * question not saved yet.
	 */
	let {
		position,
		type,
		difficulty,
		text,
		open = false
	}: {
		position: number;
		type: ItemType;
		difficulty: Difficulty;
		/** The question in one line; empty for one not written yet. */
		text: string;
		/** Whether this is the question in the editor. */
		open?: boolean;
	} = $props();
</script>

<span class={open ? numberOn : number}>{position}</span>
<span class="grid min-w-0 gap-px leading-snug">
	<span class={cn(hint, 'truncate')}>
		{ITEM_KINDS[type].label()} · {DIFFICULTY_LABELS[difficulty]()}
	</span>
	<span class={cn('truncate font-medium', !text && 'text-muted-foreground')}>
		{text || m.practice_new_question()}
	</span>
</span>
