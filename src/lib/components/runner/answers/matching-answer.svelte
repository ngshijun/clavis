<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import type { ItemResponse, ServedMatching } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { column, hint, option } from '../styles.js';
	import ThingFace from './thing-face.svelte';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Matching question: the items down the left and every answer down the
	 * right, the shorter side level with the middle of the longer. An item is
	 * joined to an answer by a line, drawn by dragging from either one to the
	 * other, or by tapping the item and then the answer.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedMatching;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	type Side = 'left' | 'right';
	type Point = { x: number; y: number };

	const pairs = $derived(answer.response?.pairs ?? []);
	const joined = (left: string) => pairs.find((pair) => pair.left_id === left)?.right_id;
	/** The numbers of the items joined to an answer, for a reader that cannot see the lines. */
	const numbers = (right: string) =>
		item.left.flatMap((left, at) => (joined(left.id) === right ? at + 1 : [])).join(' ');

	function join(left: string, right: string) {
		const rest = pairs.filter((pair) => pair.left_id !== left);
		answer = { response: { pairs: [...rest, { left_id: left, right_id: right }] } };
		tapped = undefined;
	}

	function part(left: string) {
		const rest = pairs.filter((pair) => pair.left_id !== left);
		answer = rest.length > 0 ? { response: { pairs: rest } } : {};
		tapped = undefined;
	}

	/** The line being drawn: the item or answer it starts at, where its loose end is, and what that end is over. */
	let drawing = $state<{ side: Side; id: string; to: Point; over?: string }>();

	// The item being joined: the one a line is being drawn for, the one the
	// pupil tapped, or else the first with no answer yet.
	let tapped = $state<string>();
	const active = $derived.by(() => {
		if (readonly) return undefined;
		if (drawing) return drawing.side === 'left' ? drawing.id : drawing.over;
		return tapped ?? item.left.find((left) => !joined(left.id))?.id;
	});

	function tap(right: string) {
		if (active === undefined) return;
		// Tapping the answer an item already has takes the line away.
		if (joined(active) === right) part(active);
		else join(active, right);
	}

	let board = $state<HTMLElement>();
	/** Where a line meets each item and each answer: the middle of its inner edge, measured from the board. */
	let ends = $state<Record<Side, Partial<Record<string, Point>>>>({ left: {}, right: {} });

	function measure(root: HTMLElement) {
		const read = (side: Side) =>
			Object.fromEntries(
				Array.from(root.querySelectorAll<HTMLElement>(`[data-${side}]`), (node) => [
					node.dataset[side] ?? '',
					{
						x: node.offsetLeft + (side === 'left' ? node.offsetWidth : 0),
						y: node.offsetTop + node.offsetHeight / 2
					}
				])
			);
		ends = { left: read('left'), right: read('right') };
	}

	// Nothing on the board moves without one of its two columns changing size.
	$effect(() => {
		const root = board;
		if (!root) return;
		const observer = new ResizeObserver(() => measure(root));
		for (const side of root.querySelectorAll('[data-column]')) observer.observe(side);
		return () => observer.disconnect();
	});

	const dots = $derived(
		[...Object.values(ends.left), ...Object.values(ends.right)].flatMap((dot) => dot ?? [])
	);
	const lines = $derived(
		pairs.flatMap((pair) => {
			// An item has one line, so its old one gives way while another is drawn from it.
			if (drawing?.side === 'left' && drawing.id === pair.left_id) return [];
			const from = ends.left[pair.left_id];
			const to = ends.right[pair.right_id];
			return from && to ? [{ id: pair.left_id, from, to }] : [];
		})
	);

	/** The press a line may come of. It is not one until the pointer has left where it went down. */
	let pressed: { side: Side; id: string; x: number; y: number } | undefined;
	const slack = 8;

	function press(event: PointerEvent, side: Side, id: string) {
		if (readonly || !event.isPrimary || event.button !== 0) return;
		pressed = { side, id, x: event.clientX, y: event.clientY };
	}

	function move(event: PointerEvent) {
		if (!pressed || !board || !event.isPrimary) return;
		const { side, id, x, y } = pressed;
		if (!drawing && Math.hypot(event.clientX - x, event.clientY - y) < slack) return;
		const far = side === 'left' ? 'right' : 'left';
		const under = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>(`[data-${far}]`);
		const over = under && board.contains(under) ? under.dataset[far] : undefined;
		const frame = board.getBoundingClientRect();
		// Over something it can join, the loose end goes to where the line would meet it.
		const to = (over !== undefined && ends[far][over]) || {
			x: event.clientX - frame.left,
			y: event.clientY - frame.top
		};
		drawing = { side, id, to, over };
	}

	function release(event: PointerEvent) {
		if (!event.isPrimary) return;
		if (drawing?.over !== undefined) {
			if (drawing.side === 'left') join(drawing.id, drawing.over);
			else join(drawing.over, drawing.id);
		}
		drop();
	}

	function drop() {
		pressed = undefined;
		drawing = undefined;
	}

	// A press is not to scroll the page or pick up a picture, or no line could be drawn from it.
	const face = $derived(cn(option, 'px-3', !readonly && 'touch-none [&_img]:pointer-events-none'));
</script>

<svelte:window onpointermove={move} onpointerup={release} onpointercancel={drop} />

<div class="flex flex-col gap-4">
	<div bind:this={board} class="relative flex items-center justify-between select-none">
		<div class={cn(column, 'w-[40%]')} data-column>
			{#each item.left as left, at (left.id)}
				<Button
					variant="outline"
					aria-pressed={active === left.id}
					disabled={readonly}
					class={face}
					data-left={left.id}
					onpointerdown={(event) => press(event, 'left', left.id)}
					onclick={() => (tapped = left.id)}
				>
					<span class="sr-only">{at + 1}.</span>
					<ThingFace thing={left} />
				</Button>
			{/each}
		</div>
		<div class={cn(column, 'w-[40%]')} data-column>
			{#each item.right as right (right.id)}
				<Button
					variant="outline"
					disabled={readonly}
					class={face}
					data-right={right.id}
					onpointerdown={(event) => press(event, 'right', right.id)}
					onclick={() => tap(right.id)}
				>
					<ThingFace thing={right} />
					<!-- The lines say this to the eye. -->
					<span class="sr-only">{numbers(right.id)}</span>
				</Button>
			{/each}
		</div>
		<svg
			class="pointer-events-none absolute inset-0 size-full overflow-visible"
			stroke-width="3"
			stroke-linecap="round"
			aria-hidden="true"
		>
			{#each dots as dot (dot)}
				<circle
					cx={dot.x}
					cy={dot.y}
					r="4.5"
					class="fill-card stroke-border-strong"
					stroke-width="1.5"
				/>
			{/each}
			<g class="fill-primary stroke-primary">
				{#each lines as line (line.id)}
					{@const verdict = partVerdict(mark, line.id)}
					<g
						class={cn(
							verdict === 'right' && 'fill-success stroke-success',
							verdict === 'wrong' && 'fill-destructive stroke-destructive'
						)}
					>
						<line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} />
						<circle cx={line.from.x} cy={line.from.y} r="4" />
						<circle cx={line.to.x} cy={line.to.y} r="4" />
					</g>
				{/each}
				{#if drawing}
					{@const from = ends[drawing.side][drawing.id]}
					{#if from}
						<line
							x1={from.x}
							y1={from.y}
							x2={drawing.to.x}
							y2={drawing.to.y}
							stroke-dasharray={drawing.over === undefined ? '1 8' : undefined}
						/>
						<circle cx={from.x} cy={from.y} r="4" />
						<circle cx={drawing.to.x} cy={drawing.to.y} r="4" />
					{/if}
				{/if}
			</g>
		</svg>
		<!-- A marked line carries its tick or cross where it leaves its item. -->
		{#each lines as line (line.id)}
			{@const verdict = partVerdict(mark, line.id)}
			{#if verdict}
				<span
					class="absolute flex -translate-1/2"
					style:left="{line.from.x}px"
					style:top="{line.from.y}px"
				>
					<MarkIcon {verdict} class="ring-2 ring-card" />
				</span>
			{/if}
		{/each}
	</div>
	{#if !readonly}
		<span class={hint}>{m.item_matching_hint()}</span>
	{/if}
</div>
