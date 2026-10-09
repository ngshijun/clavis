<script lang="ts">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LearningPoint } from '#lib/server/practice.js';
	import AddChip from './fields/add-chip.svelte';
	import ChipRemove from './fields/chip-remove.svelte';
	import Chip from './fields/chip.svelte';
	import { removeKeepingFocus } from './fields/focus.js';
	import FormField from './fields/form-field.svelte';
	import { chips, hint } from './styles.js';

	/**
	 * What a question teaches: chips for the learning points it has, and one
	 * that offers the rest of its topic's. They are part of the question's
	 * draft, so nothing is kept until Save.
	 *
	 * A name is stored in small letters and shown with a capital, as a label is.
	 */
	let {
		chosen = $bindable(),
		offered
	}: {
		chosen: LearningPoint[];
		/** The topic's learning points: all that can be chosen from. */
		offered: LearningPoint[];
	} = $props();

	const remaining = $derived(
		offered.filter((point) => !chosen.some((each) => each.id === point.id))
	);

	let row = $state<HTMLElement>();
	let adder = $state<HTMLElement | null>(null);
</script>

<FormField label={m.practice_learning_points()}>
	{#if chosen.length === 0 && offered.length === 0}
		<p class={hint}>{m.practice_learning_points_none()}</p>
	{:else}
		<div bind:this={row} class={chips}>
			{#each chosen as point (point.id)}
				<Chip class="pe-0.5" data-entry="chip">
					<span class="truncate first-letter:uppercase">{point.name}</span>
					<ChipRemove
						label={m.practice_chip_remove({ text: point.name })}
						onclick={() =>
							removeKeepingFocus(
								row,
								'chip',
								() => (chosen = chosen.filter((each) => each.id !== point.id)),
								() => adder
							)}
					/>
				</Chip>
			{/each}
			{#if remaining.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<AddChip bind:ref={adder} label={m.practice_learning_point_add()} {...props} />
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" aria-label={m.practice_learning_points()}>
						<DropdownMenu.Group>
							{#each remaining as point (point.id)}
								<DropdownMenu.Item onSelect={() => (chosen = [...chosen, point])}>
									<span class="first-letter:uppercase">{point.name}</span>
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	{/if}
</FormField>
