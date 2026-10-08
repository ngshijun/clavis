<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import type { ItemResponse, ServedClassify, ServedThing } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getRunner } from '../context.js';
	import { chip, chips, hint, marked, zone } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type Verdict, type AnswerMark } from '../marks.js';

	/**
	 * A Classify question: a box for each group, and every item beneath them
	 * to be put into the boxes. An item is put in a group by tapping it and
	 * then the group's name; an item in a box tapped comes back out.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedClassify;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const runner = getRunner();
	const sorted = $derived(answer.response?.items ?? []);
	const groupOf = (id: string) => sorted.find((each) => each.id === id)?.group_id;
	const waiting = $derived(item.items.filter((thing) => groupOf(thing.id) === undefined));

	// The item being sorted: the one the pupil tapped, or else the first still waiting.
	let tapped = $state<string>();
	const active = $derived(waiting.find((thing) => thing.id === tapped)?.id ?? waiting.at(0)?.id);

	function settle(next: { id: string; group_id: string }[]) {
		answer = next.length > 0 ? { response: { items: next } } : {};
	}
</script>

{#snippet face(
	thing: ServedThing,
	pressed: boolean | undefined,
	onclick: () => void,
	verdict?: Verdict
)}
	{@const picture = runner.imageUrl(thing.image_path)}
	<Button
		variant="secondary"
		aria-pressed={pressed}
		disabled={readonly}
		class={cn(
			picture ? 'h-auto max-w-full flex-col gap-1 rounded-lg p-1 text-sm font-medium' : chip,
			'disabled:opacity-100 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-2 aria-pressed:ring-primary',
			verdict && [marked[verdict], 'border']
		)}
		{onclick}
	>
		{#if picture}
			<!-- A picture does not fit a chip, so the item is a tile with its words under it. -->
			<img src={picture} alt="" class="max-h-16 max-w-full rounded-sm" />
		{/if}
		{#if thing.text}
			<span class={picture ? 'px-1.5 pb-0.5 wrap-break-word' : 'truncate'}>{thing.text}</span>
		{/if}
		{#if verdict}
			<MarkIcon {verdict} class="size-4" />
		{/if}
	</Button>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="grid grid-cols-2 gap-2">
		{#each item.groups as group (group.id)}
			<div class={cn(zone, 'min-h-28 flex-col flex-nowrap')}>
				<Button
					variant="ghost"
					size="sm"
					aria-label={m.item_classify_put({ group: group.text })}
					disabled={readonly || active === undefined}
					class="h-auto min-h-8 w-full justify-start py-1 text-start font-semibold whitespace-normal disabled:opacity-100"
					onclick={() => active && settle([...sorted, { id: active, group_id: group.id }])}
				>
					<span class="min-w-0 wrap-break-word">{group.text}</span>
				</Button>
				<div class={chips}>
					{#each item.items.filter((thing) => groupOf(thing.id) === group.id) as thing (thing.id)}
						{@render face(
							thing,
							undefined,
							() => settle(sorted.filter((each) => each.id !== thing.id)),
							partVerdict(mark, thing.id)
						)}
					{/each}
				</div>
			</div>
		{/each}
	</div>
	{#if !readonly}
		<div class={chips}>
			{#each waiting as thing (thing.id)}
				{@render face(thing, active === thing.id, () => (tapped = thing.id))}
			{/each}
		</div>
		<span class={hint}>{m.item_classify_hint()}</span>
	{/if}
</div>
