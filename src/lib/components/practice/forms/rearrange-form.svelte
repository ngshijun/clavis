<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Link2Icon from '@lucide/svelte/icons/link-2';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { inOrder } from '#lib/items/order.js';
	import type { RearrangePayload } from '#lib/items/payload.js';
	import { chipsToSentence } from '#lib/items/text.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getEditor } from '../editor.svelte.js';
	import FormField from '../fields/form-field.svelte';
	import { chip, chips as chipRow, hint } from '../styles.js';
	import { cutsOf, joinChips, recut, splitChip, type Chip, type Cut } from './rearrange-chips.js';

	/**
	 * The sentence of a Sentence Rearrangement and the chips it is cut into.
	 * Only the chips are stored. The sentence is written here and cut at its
	 * spaces; a chip is then joined to its neighbour or split, where a phrase
	 * should move as one or the language has no spaces to cut at.
	 */
	let { payload = $bindable() }: { payload: RearrangePayload } = $props();

	const editor = getEditor();
	const id = $props.id();

	const chips = $derived(inOrder(payload.items, payload.correct_order));

	// Spelled from the chips once, then kept as it is typed: the chips do not say how many
	// spaces stood between two words.
	let sentence = $state(untrack(() => chipsToSentence(chips.map((each) => each.text))));

	/** What is wrong with the sentence: with its chips as a list, or with one of them. */
	const error = $derived(
		editor.issue('items') ??
			payload.items.map((_, index) => editor.issue('items', index, 'text')).find(Boolean)
	);

	/** The chip whose tools are out, by id. */
	let open = $state<string>();

	let row = $state<HTMLElement>();

	/** Writes the chips back: in the order of the sentence, and that order by id. */
	function commit(next: Chip[]) {
		payload.items = next;
		payload.correct_order = next.map((each) => each.id);
		if (!next.some((each) => each.id === open)) open = undefined;
	}

	/**
	 * Joining and splitting can take away the button that was pressed, and the
	 * focus with it: it then goes to the chip. A button that is still there
	 * keeps it, so the next chip is joined on by pressing again.
	 */
	async function settle(chipId: string) {
		await tick();
		if (document.activeElement !== document.body) return;
		row?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(chipId)}"]`)?.focus();
	}

	/** Joins the chip at `at` and the next. The joined chip stays open, to take another. */
	function join(at: number) {
		const next = joinChips(chips, at);
		open = next[at].id;
		commit(next);
		settle(next[at].id);
	}

	function split(at: number, cut: Cut) {
		const next = splitChip(chips, at, cut);
		open = undefined;
		commit(next);
		// A split word is two words from now on, and the sentence has to say so to be cut the same again.
		sentence = chipsToSentence(next.map((each) => each.text));
		settle(next[at].id);
	}
</script>

<FormField label={m.practice_rearrange_sentence()} for="{id}-sentence" {error}>
	<Input
		id="{id}-sentence"
		bind:value={
			() => sentence,
			(text) => {
				sentence = text;
				commit(recut(text, chips));
			}
		}
		autocomplete="off"
		aria-invalid={error ? true : undefined}
	/>
</FormField>

<FormField label={m.practice_rearrange_chips()} hint={m.practice_rearrange_chips_hint()}>
	{#if chips.length === 0}
		<p class={hint}>{m.practice_rearrange_chips_empty()}</p>
	{:else}
		<div bind:this={row} class={chipRow}>
			{#each chips as each, at (each.id)}
				{@const cuts = open === each.id ? cutsOf(each.text) : []}
				<!-- A chip and its tools wrap to the next line together. -->
				<span class="flex max-w-full flex-wrap items-center gap-1.5">
					<!-- A chip that is pressed to bring its tools out: an answer's colours while they are. -->
					<Button
						variant="ghost"
						data-chip={each.id}
						aria-expanded={open === each.id}
						class={cn(
							chip.plain,
							'hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground'
						)}
						onclick={() => (open = open === each.id ? undefined : each.id)}
					>
						<span class="truncate">{each.text}</span>
					</Button>
					{#if open === each.id && chips.length + cuts.length > 1}
						<span
							role="group"
							aria-label={m.practice_rearrange_tools({ text: each.text })}
							class="inline-flex min-h-7 max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-dashed border-border-strong/60 px-0.5 text-sm font-medium"
						>
							{#if at > 0}
								<IconButton
									variant="ghost"
									size="icon-xs"
									label={m.practice_rearrange_join({
										first: chips[at - 1].text,
										second: each.text
									})}
									onclick={() => join(at - 1)}
								>
									<Link2Icon />
								</IconButton>
							{/if}
							{#if cuts.length > 0}
								<!-- The chip again, spelled out with a place to cut between its letters. -->
								<span class="flex flex-wrap items-center px-1.5">
									<span class="whitespace-pre">{each.text.slice(0, cuts[0].at)}</span>
									{#each cuts as cut, index (cut.at)}
										<!-- A place to cut: a sliver between two letters, as narrow as the gap it stands in. -->
										<Button
											variant="ghost"
											class="group h-6 w-3 rounded-sm p-0 hover:bg-transparent"
											aria-label={m.practice_rearrange_split({ head: cut.head, tail: cut.tail })}
											title={m.practice_rearrange_split({ head: cut.head, tail: cut.tail })}
											onclick={() => split(at, cut)}
										>
											<span
												class="h-4 border-s border-dashed border-border-strong group-hover:border-solid group-hover:border-primary group-focus-visible:border-solid group-focus-visible:border-primary"
											></span>
										</Button>
										<span class="whitespace-pre"
											>{each.text.slice(cut.at, cuts[index + 1]?.at)}</span
										>
									{/each}
								</span>
							{/if}
							{#if at < chips.length - 1}
								<IconButton
									variant="ghost"
									size="icon-xs"
									label={m.practice_rearrange_join({
										first: each.text,
										second: chips[at + 1].text
									})}
									onclick={() => join(at)}
								>
									<Link2Icon />
								</IconButton>
							{/if}
						</span>
					{/if}
				</span>
			{/each}
		</div>
		<p class={hint}>{m.practice_rearrange_chips_help()}</p>
	{/if}
</FormField>
