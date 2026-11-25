<script lang="ts">
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { DIFFICULTY_LABELS } from '#lib/items/kinds.js';
	import { DIFFICULTIES, type Difficulty } from '#lib/items/payload.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A difficulty as three bars, one, two or all of them filled: a shape that
	 * can be compared down a column of rows without reading. Its name is what
	 * a screen reader says, and what its tooltip shows when it is pointed at,
	 * pressed or reached by the keyboard.
	 */
	let {
		difficulty,
		tabindex = 0,
		class: className
	}: {
		difficulty: Difficulty;
		/** `-1` inside a link, which says the name itself and is where the keyboard stops. */
		tabindex?: 0 | -1;
		class?: string;
	} = $props();

	const level = $derived(DIFFICULTIES.indexOf(difficulty));
	const label = $derived(DIFFICULTY_LABELS[difficulty]());

	/** Each bar a step taller than the one before. */
	const heights = ['h-1.25', 'h-2', 'h-3'];
</script>

<!-- It is nothing to press, so a press leaves its tooltip up: on a touch screen that is how it is read. -->
<Tooltip.Root disableCloseOnTriggerClick>
	<Tooltip.Trigger {tabindex}>
		{#snippet child({ props })}
			<span
				role="img"
				aria-label={label}
				class={cn(
					'inline-flex h-3 shrink-0 items-end gap-0.5 rounded-[1px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
					className
				)}
				{...props}
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
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
