<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import type { ItemResponse, ServedNumeric } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { cell, marked } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { wholeVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Number question: boxes in the shape of the answer, with the units and
	 * marks that are given around them. A fraction is two boxes over a bar, a
	 * time an hour and minutes, and so on.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedNumeric;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	/** How many boxes the answer has; none for the forms typed as one line. */
	const count = $derived(
		{ number: 0, money: 0, fraction: 2, mixed: 3, ratio: item.terms ?? 2, time: 2, measure: 2 }[
			item.form
		]
	);
	const parts = $derived(
		Array.from({ length: count }, (_, at) => answer.response?.parts?.[at] ?? null)
	);
	const period = $derived(answer.response?.period ?? null);

	function settle(next: (number | null)[], nextPeriod: 'am' | 'pm' | null) {
		const empty = next.every((part) => part === null) && nextPeriod === null;
		answer = empty
			? {}
			: { response: { parts: next, ...(item.form === 'time' ? { period: nextPeriod } : {}) } };
	}

	/** A box takes a whole number: anything else typed into it is dropped. */
	function write(at: number, value: string) {
		const digits = value.replace(/\D/g, '').slice(0, 9);
		settle(parts.with(at, digits === '' ? null : Number(digits)), period);
	}

	const row = 'flex flex-wrap items-center gap-2 text-sm font-semibold';
	const verdict = $derived(wholeVerdict(mark));
</script>

{#snippet box(at: number, label: string, width = '')}
	<Input
		aria-label={label}
		inputmode="numeric"
		autocomplete="off"
		{readonly}
		class={cn(cell, width, verdict && marked[verdict])}
		value={parts[at] ?? ''}
		oninput={(event) => {
			write(at, event.currentTarget.value);
			// What was dropped must leave the box too.
			event.currentTarget.value = String(parts[at] ?? '');
		}}
	/>
{/snippet}

{#snippet fraction(at: number)}
	<span class="inline-flex flex-col items-center gap-1">
		{@render box(at, m.practice_numeric_numerator())}
		<span class="h-0.5 w-full bg-foreground"></span>
		{@render box(at + 1, m.practice_numeric_denominator())}
	</span>
{/snippet}

<div class={row}>
	{#if item.form === 'number' || item.form === 'money'}
		{#if item.form === 'money'}
			<span>RM</span>
		{/if}
		<Input
			aria-label={item.question ?? m.item_answer_placeholder()}
			inputmode="decimal"
			autocomplete="off"
			{readonly}
			class={cn('w-28 shrink-0', verdict && marked[verdict])}
			bind:value={
				() => answer.text_answer ?? '', (text) => (answer = text ? { text_answer: text } : {})
			}
		/>
		{#if item.unit}
			<span>{item.unit}</span>
		{/if}
	{:else if item.form === 'fraction'}
		{@render fraction(0)}
	{:else if item.form === 'mixed'}
		{@render box(0, m.practice_numeric_whole())}
		{@render fraction(1)}
		{#if item.unit}
			<span>{item.unit}</span>
		{/if}
	{:else if item.form === 'ratio'}
		{#each parts, at (at)}
			{#if at > 0}
				<span>:</span>
			{/if}
			{@render box(at, m.item_ratio_term({ n: at + 1 }))}
		{/each}
	{:else if item.form === 'time'}
		{@render box(0, m.practice_numeric_hour())}
		<span>:</span>
		{@render box(1, m.practice_numeric_minutes())}
		<!-- A time on the 24-hour clock is asked for without a.m. or p.m. -->
		{#if item.clock === 12}
			<ToggleGroup.Root
				type="single"
				spacing={0.5}
				disabled={readonly}
				class="rounded-4xl bg-muted p-0.5"
				bind:value={
					() => period ?? '', (value) => settle(parts, value === '' ? null : (value as 'am' | 'pm'))
				}
			>
				{#each [['am', m.item_time_am()], ['pm', m.item_time_pm()]] as [value, label] (value)}
					<ToggleGroup.Item
						{value}
						class="h-7 rounded-4xl px-3 text-muted-foreground hover:bg-transparent disabled:opacity-100 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
					>
						{label}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		{/if}
	{:else if item.form === 'measure' && item.units}
		{@render box(0, item.units[0])}
		<span>{item.units[0]}</span>
		{@render box(1, item.units[1], 'w-18')}
		<span>{item.units[1]}</span>
	{/if}
	{#if verdict}
		<MarkIcon {verdict} />
	{/if}
</div>
