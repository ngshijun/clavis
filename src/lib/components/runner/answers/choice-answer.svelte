<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import type { ItemResponse, ServedChoice } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { badge, column, marked, option } from '../styles.js';
	import ThingFace from './thing-face.svelte';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, wholeVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Multiple Choice or a Multiple Response question: the options under
	 * letters. One is picked in the first, any number in the second.
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

	const many = $derived(item.type === 'mrq');
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

{#snippet options()}
	{#each item.options as choice, at (choice.number)}
		{@const verdict = verdictOf(choice.number)}
		<!-- Marked, the picks stand out and what was not picked steps back. -->
		<ToggleGroup.Item
			value={String(choice.number)}
			class={cn(option, mark && 'text-muted-foreground', verdict && marked[verdict])}
		>
			<span class={cn(badge, many ? 'rounded-sm' : 'rounded-full')}>
				{String.fromCharCode(65 + at)}
			</span>
			<ThingFace thing={choice} />
			{#if verdict}
				<span class="ms-auto flex shrink-0 items-center gap-1.5 ps-2 text-sm font-semibold">
					<span class="max-sm:sr-only">{m.run_your_answer()}</span>
					<MarkIcon {verdict} />
				</span>
			{/if}
		</ToggleGroup.Item>
	{/each}
{/snippet}

{#if many}
	<ToggleGroup.Root
		type="multiple"
		orientation="vertical"
		spacing={2}
		disabled={readonly}
		class={cn(column, 'w-full items-stretch')}
		bind:value={() => picked, pick}
	>
		{@render options()}
	</ToggleGroup.Root>
{:else}
	<ToggleGroup.Root
		type="single"
		orientation="vertical"
		spacing={2}
		disabled={readonly}
		class={cn(column, 'w-full items-stretch')}
		bind:value={() => picked[0] ?? '', (value) => pick(value ? [value] : [])}
	>
		{@render options()}
	</ToggleGroup.Root>
{/if}
