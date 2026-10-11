<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import type { ItemResponse, ServedRearrange } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { chip, chips, hint, marked, zone } from '../styles.js';
	import { cn } from '#lib/utils.js';
	import MarkIcon from '../mark-icon.svelte';
	import { wholeVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Sentence Rearrangement: a line the sentence is built on, and its chips
	 * mixed up beneath. A chip tapped goes to the end of the line; a chip on
	 * the line tapped comes back.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedRearrange;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const order = $derived(answer.response?.order ?? []);
	const placed = $derived(order.flatMap((id) => item.items.find((thing) => thing.id === id) ?? []));
	const waiting = $derived(item.items.filter((thing) => !order.includes(thing.id)));

	// A sentence is right or wrong as a whole.
	const verdict = $derived(order.length > 0 ? wholeVerdict(mark) : undefined);

	function settle(next: string[]) {
		answer = next.length > 0 ? { response: { order: next } } : {};
	}
</script>

<div class="flex flex-col gap-4">
	<div class={cn(zone, verdict && [marked[verdict], 'border-solid'])}>
		{#each placed as thing (thing.id)}
			<Button
				variant="secondary"
				disabled={readonly}
				class="{chip} bg-accent text-accent-foreground disabled:opacity-100"
				onclick={() => settle(order.filter((id) => id !== thing.id))}
			>
				<span class="truncate">{thing.text}</span>
			</Button>
		{/each}
		{#if verdict}
			<MarkIcon {verdict} class="ms-auto self-center" />
		{/if}
	</div>
	{#if !readonly}
		<div class={chips}>
			{#each waiting as thing (thing.id)}
				<Button variant="secondary" class={chip} onclick={() => settle([...order, thing.id])}>
					<span class="truncate">{thing.text}</span>
				</Button>
			{/each}
		</div>
		<span class={hint}>{m.item_rearrange_hint()}</span>
	{/if}
</div>
