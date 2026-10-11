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
	 * to be put into the boxes. An item is put in a group by dragging it into
	 * the box, or by tapping it and then the group's name; an item in a box
	 * comes back out when it is tapped or dragged back to the row it came from.
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

	/** The row the items wait in, as a place to put one: in no group. */
	const out = '';

	function put(id: string, group: string) {
		const rest = sorted.filter((each) => each.id !== id);
		const next = group === out ? rest : [...rest, { id, group_id: group }];
		answer = next.length > 0 ? { response: { items: next } } : {};
	}

	let board = $state<HTMLElement>();
	/** The item being dragged: how far it has come from where it lay, and the place it is over. */
	let dragging = $state<{ id: string; x: number; y: number; over?: string }>();
	/** The press a drag may come of. It is not one until the pointer has left where it went down. */
	let pressed: { id: string; x: number; y: number } | undefined;
	const slack = 8;

	function press(event: PointerEvent, id: string) {
		if (readonly || !event.isPrimary || event.button !== 0) return;
		pressed = { id, x: event.clientX, y: event.clientY };
	}

	function move(event: PointerEvent) {
		if (!pressed || !board || !event.isPrimary) return;
		const x = event.clientX - pressed.x;
		const y = event.clientY - pressed.y;
		if (!dragging && Math.hypot(x, y) < slack) return;
		// The item lets the pointer through while it is dragged, so this finds what lies under it.
		const under = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('[data-place]');
		const over = under && board.contains(under) ? under.dataset.place : undefined;
		dragging = { id: pressed.id, x, y, over };
	}

	function release(event: PointerEvent) {
		if (!event.isPrimary) return;
		// Let go over no place, the item goes back to where it lay.
		if (dragging?.over !== undefined) put(dragging.id, dragging.over);
		drop();
	}

	function drop() {
		pressed = undefined;
		dragging = undefined;
	}
</script>

{#snippet face(
	thing: ServedThing,
	pressed: boolean | undefined,
	onclick: () => void,
	verdict?: Verdict
)}
	{@const picture = runner.imageUrl(thing.image_path)}
	{@const held = dragging?.id === thing.id ? dragging : undefined}
	<Button
		variant="secondary"
		aria-pressed={pressed}
		disabled={readonly}
		class={cn(
			picture ? 'h-auto max-w-full flex-col gap-1 rounded-lg p-1 text-lg font-medium' : chip,
			'disabled:opacity-100 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-2 aria-pressed:ring-primary',
			// A press is not to scroll the page or pick up a picture, or the item could not be dragged.
			!readonly && 'touch-none select-none [&_img]:pointer-events-none',
			held && 'pointer-events-none relative z-10 shadow-lg transition-none',
			verdict && [marked[verdict], 'border']
		)}
		style={held ? `translate: ${held.x}px ${held.y}px` : undefined}
		onpointerdown={(event) => press(event, thing.id)}
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

<svelte:window onpointermove={move} onpointerup={release} onpointercancel={drop} />

<div bind:this={board} class="flex flex-col gap-4">
	<div class="grid grid-cols-2 gap-2">
		{#each item.groups as group (group.id)}
			<div
				class={cn(
					zone,
					'min-h-32 flex-col flex-nowrap',
					dragging?.over === group.id && 'border-solid border-primary bg-accent'
				)}
				data-place={group.id}
			>
				<Button
					variant="ghost"
					size="sm"
					aria-label={m.item_classify_put({ group: group.text })}
					disabled={readonly || active === undefined}
					class="h-auto min-h-9 w-full justify-start py-1 text-start text-lg font-semibold whitespace-normal disabled:opacity-100"
					onclick={() => active && put(active, group.id)}
				>
					<span class="min-w-0 wrap-break-word">{group.text}</span>
				</Button>
				<div class={chips}>
					{#each item.items.filter((thing) => groupOf(thing.id) === group.id) as thing (thing.id)}
						{@render face(thing, undefined, () => put(thing.id, out), partVerdict(mark, thing.id))}
					{/each}
				</div>
			</div>
		{/each}
	</div>
	{#if !readonly}
		<!-- The row keeps its height when it is empty, so an item can be dragged back to it. -->
		<div
			class={cn(
				chips,
				'min-h-10 rounded-lg',
				dragging?.over === out && 'bg-accent outline-2 outline-offset-4 outline-primary'
			)}
			data-place={out}
		>
			{#each waiting as thing (thing.id)}
				{@render face(thing, active === thing.id, () => (tapped = thing.id))}
			{/each}
		</div>
		<span class={hint}>{m.item_classify_hint()}</span>
	{/if}
</div>
