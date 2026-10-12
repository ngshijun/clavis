<script lang="ts">
	import { DIFFICULTY_LABELS } from '#lib/items/kinds.js';
	import { DIFFICULTIES, type Difficulty } from '#lib/items/payload.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A difficulty as three bars, one, two or all of them filled: a shape that
	 * can be compared down a column of rows without reading. Its name is what
	 * a screen reader says and what shows when it is pointed at.
	 */
	let { difficulty, class: className }: { difficulty: Difficulty; class?: string } = $props();

	const level = $derived(DIFFICULTIES.indexOf(difficulty));
	const label = $derived(DIFFICULTY_LABELS[difficulty]());

	/** Each bar a step taller than the one before. */
	const heights = ['h-1.25', 'h-2', 'h-3'];
</script>

<span
	role="img"
	aria-label={label}
	title={label}
	class={cn('inline-flex h-3 shrink-0 items-end gap-0.5', className)}
>
	{#each heights as height, index (height)}
		<span
			class={cn(
				'w-0.75 rounded-[1px]',
				height,
				index <= level ? 'bg-foreground/80' : 'bg-border-strong/35'
			)}
		></span>
	{/each}
</span>
