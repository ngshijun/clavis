<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import type { ItemResponse, ServedChoice } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getRunner } from '../context.js';
	import { badge, column, marked, option, picture } from '../styles.js';
	import ThingFace from './thing-face.svelte';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, wholeVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Multiple Choice or a Multiple Response question: the options under
	 * letters. One is picked in the first, any number in the second.
	 *
	 * Options that are all pictures are tiles two to a row, the picture over
	 * its letter and words, so they are seen side by side; any other options
	 * are rows the full width, which long words and every script read best in.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedChoice;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const runner = getRunner();

	const many = $derived(item.type === 'mrq');
	const tiled = $derived(item.options.every((choice) => choice.image_path));
	// The arrow keys go from letter to letter, which in tiles runs along each row.
	const orientation = $derived(tiled ? 'horizontal' : 'vertical');
	const layout = $derived(
		tiled ? 'grid w-full grid-cols-2 items-stretch' : cn(column, 'w-full items-stretch')
	);
	const picked = $derived((answer.selected_options ?? []).map(String));

	// A marked pick: the only pick of a Multiple Choice is the whole answer.
	const verdictOf = (number: number) =>
		picked.includes(String(number))
			? many
				? partVerdict(mark, number)
				: wholeVerdict(mark)
			: undefined;

	function pick(values: string[]) {
		answer = { selected_options: values.map(Number).sort((a, b) => a - b) };
	}
</script>

{#snippet lead(letter: string)}
	<span class={cn(badge, many ? 'rounded-sm' : 'rounded-full')}>{letter}</span>
{/snippet}

{#snippet outcome(verdict: ReturnType<typeof verdictOf>)}
	{#if verdict}
		<span class="ms-auto flex shrink-0 items-center gap-1.5 ps-2 text-sm font-semibold">
			<span class="max-sm:sr-only">
				{runner.theirs ? m.run_their_answer() : m.run_your_answer()}
			</span>
			<MarkIcon {verdict} />
		</span>
	{/if}
{/snippet}

{#snippet options()}
	{#each item.options as choice, at (choice.number)}
		{@const verdict = verdictOf(choice.number)}
		{@const letter = String.fromCharCode(65 + at)}
		<!-- Marked, the picks stand out and what was not picked steps back. -->
		<ToggleGroup.Item
			value={String(choice.number)}
			class={cn(
				option,
				tiled && 'flex-col items-stretch p-2',
				mark && 'text-muted-foreground',
				verdict && marked[verdict]
			)}
		>
			{#if tiled}
				<img
					src={runner.imageUrl(choice.image_path)}
					alt=""
					class={cn(picture.tile, 'rounded-sm')}
				/>
				<span class="flex min-w-0 items-start gap-3 px-1">
					{@render lead(letter)}
					{#if choice.text}
						<span class="min-w-0 wrap-break-word">{choice.text}</span>
					{/if}
					{@render outcome(verdict)}
				</span>
			{:else}
				{@render lead(letter)}
				<ThingFace thing={choice} />
				{@render outcome(verdict)}
			{/if}
		</ToggleGroup.Item>
	{/each}
{/snippet}

{#if many}
	<ToggleGroup.Root
		type="multiple"
		{orientation}
		spacing={2}
		disabled={readonly}
		class={layout}
		bind:value={() => picked, pick}
	>
		{@render options()}
	</ToggleGroup.Root>
{:else}
	<ToggleGroup.Root
		type="single"
		{orientation}
		spacing={2}
		disabled={readonly}
		class={layout}
		bind:value={() => picked[0] ?? '', (value) => pick(value ? [value] : [])}
	>
		{@render options()}
	</ToggleGroup.Root>
{/if}
