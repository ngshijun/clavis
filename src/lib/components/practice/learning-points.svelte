<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LearningPoint } from '#lib/server/practice.js';
	import AddChip from './fields/add-chip.svelte';
	import ChipRemove from './fields/chip-remove.svelte';
	import Chip from './fields/chip.svelte';
	import { removeKeepingFocus } from './fields/focus.js';
	import FormField from './fields/form-field.svelte';
	import { chips } from './styles.js';

	/**
	 * What a question teaches: chips for the learning points it has, and one
	 * that finds another of its topic's by name, or names a new one. The chosen
	 * are part of the question's draft, so they are kept with Save; a new one is
	 * the topic's at once, since the topic's learning points are a vocabulary
	 * and not the question's.
	 *
	 * A name is stored in small letters and shown with a capital, as a label is.
	 */
	let {
		chosen = $bindable(),
		offered,
		make
	}: {
		chosen: LearningPoint[];
		/** The topic's learning points: all that can be chosen from. */
		offered: LearningPoint[];
		/** Has the topic offer the learning point of a name, and answers with it; undefined if it could not. */
		make: (name: string) => Promise<LearningPoint | undefined>;
	} = $props();

	const remaining = $derived(
		offered.filter((point) => !chosen.some((each) => each.id === point.id))
	);

	let open = $state(false);
	let search = $state('');
	let making = $state(false);

	const typed = $derived(search.trim());
	/** A name no learning point of the topic has, whatever its capitals, can be added as a new one. */
	const fresh = $derived(
		typed !== '' && !offered.some((point) => point.name === typed.toLowerCase())
	);

	let row = $state<HTMLElement>();
	let adder = $state<HTMLElement | null>(null);

	function choose(point: LearningPoint) {
		chosen = [...chosen, point];
		open = false;
	}

	async function add() {
		if (making) return;
		making = true;
		const point = await make(typed);
		making = false;
		if (point) choose(point);
	}

	$effect(() => {
		// Opened afresh, the search starts empty.
		if (!open) search = '';
	});
</script>

<FormField label={m.practice_learning_points()}>
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
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<AddChip bind:ref={adder} label={m.practice_learning_point_add()} {...props} />
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="start" class="w-72 p-0">
				<Command.Root>
					<Command.Input
						bind:value={search}
						placeholder={m.practice_learning_point_search()}
						aria-label={m.practice_learning_point_search()}
					/>
					<Command.List>
						<!-- A new name is offered below; the line is for when nothing is typed or found. -->
						{#if !fresh}
							<Command.Empty>{m.practice_learning_point_type()}</Command.Empty>
						{/if}
						{#if remaining.length > 0}
							<Command.Group heading={m.practice_learning_points_of_topic()}>
								{#each remaining as point (point.id)}
									<Command.Item value={point.name} onSelect={() => choose(point)}>
										<span class="first-letter:uppercase">{point.name}</span>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
						{#if fresh}
							<!-- Always there while the name is new, since it matches no learning point to filter by. -->
							<Command.Group forceMount>
								<Command.Item value="new:{typed}" forceMount disabled={making} onSelect={add}>
									<PlusIcon />
									<span class="min-w-0 truncate">
										{m.practice_learning_point_new({ name: typed })}
									</span>
								</Command.Item>
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</div>
</FormField>
