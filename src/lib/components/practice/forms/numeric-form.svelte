<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { blankNumeric, NUMERIC_FORM_LABELS } from '#lib/items/kinds.js';
	import {
		MEASURE_UNITS,
		NUMERIC_FORMS,
		type NumericForm,
		type NumericFractionPayload,
		type NumericMeasurePayload,
		type NumericMixedPayload,
		type NumericMoneyPayload,
		type NumericNumberPayload,
		type NumericPayload,
		type NumericRatioPayload,
		type NumericTimePayload
	} from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getEditor } from '../editor.svelte.js';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { hint } from '../styles.js';
	import NumericBox from './numeric-box.svelte';

	/**
	 * A Number question: the form its answer takes, and the answer in that
	 * form. Each form has its own row of boxes, and some an allowance for
	 * answers of the same value written another way.
	 */
	let { payload = $bindable() }: { payload: NumericPayload } = $props();

	const editor = getEditor();
	const id = $props.id();

	/** A question without a form is answered with a plain number. */
	const form = $derived(payload.form ?? 'number');
	const isNumber = (answer: NumericPayload): answer is NumericNumberPayload =>
		answer.form === undefined || answer.form === 'number';

	/** Starts the answer again in another form. What every form has stays, and the unit where both have one. */
	function setForm(next: NumericForm) {
		if (next === form) return;
		const unit = 'unit' in payload ? payload.unit : undefined;
		payload = {
			...blankNumeric(next),
			question: payload.question,
			...(payload.image_path ? { image_path: payload.image_path } : {}),
			...(payload.tip ? { tip: payload.tip } : {}),
			...(unit && (next === 'number' || next === 'mixed') ? { unit } : {})
		};
	}

	/** What is wrong with the numbers, each thing once: two boxes can be wrong in the same way. */
	const errors = $derived.by(() => {
		const paths = [
			['answer'],
			['tolerance'],
			['unit'],
			['parts'],
			['parts', 0],
			['parts', 1],
			['parts', 2]
		];
		const found = paths.flatMap((path) => editor.issue(...path) ?? []);
		return found.filter((message, at) => found.indexOf(message) === at);
	});
	const unitsError = $derived(editor.issue('units', 0) ?? editor.issue('units', 1));
	const wrong = (...path: (string | number)[]) => editor.issue(...path) !== undefined;

	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	const whole = (parts: number[]) => parts.every((part) => Number.isInteger(part) && part >= 0);

	/**
	 * The same fraction or ratio in other numbers, to show what an allowance
	 * lets through: in lower terms where there are any, and doubled otherwise.
	 * Nothing until every number is entered.
	 */
	function equal(parts: number[]): number[] | undefined {
		if (!whole(parts) || parts.includes(0)) return undefined;
		const shared = parts.reduce(gcd);
		return parts.map((part) => (shared > 1 ? part / shared : part * 2));
	}

	/** A mixed number as one fraction: 2 1/2 is 5/2. */
	function improper([units, numerator, denominator]: number[]): string | undefined {
		if (!whole([units, numerator, denominator]) || denominator === 0) return undefined;
		return `${units * denominator + numerator}/${denominator}`;
	}

	/** An amount of money shows its sen in full, 19.20, unless it has parts of a sen. */
	function money(value: number): string {
		const fixed = value.toFixed(2);
		return Number(fixed) === value ? fixed : String(value);
	}
	const minutes = (value: number) => String(value).padStart(2, '0');

	/**
	 * Which half of the day a time was in before it went onto the 24-hour
	 * clock, for an hour that cannot say so itself: one not entered yet.
	 */
	let half: 'am' | 'pm' = 'am';

	/**
	 * Writes a time on the other clock, as the same time: 5:50 p.m. is 17:50,
	 * and back. An hour that is not on the clock it is read from stays as it
	 * was typed, for the person to put right.
	 */
	function setClock(answer: NumericTimePayload, full: boolean) {
		const [hour, minute] = answer.parts;
		if (full) {
			if (answer.period === null) return;
			half = answer.period;
			const on = Number.isInteger(hour) && hour >= 1 && hour <= 12;
			answer.parts = [on ? (hour % 12) + (half === 'pm' ? 12 : 0) : hour, minute];
			answer.period = null;
		} else {
			if (answer.period !== null) return;
			const on = Number.isInteger(hour) && hour >= 0 && hour <= 23;
			answer.period = on ? (hour < 12 ? 'am' : 'pm') : half;
			answer.parts = [on ? hour % 12 || 12 : hour, minute];
		}
	}

	const pair = ([large, small]: readonly string[]) =>
		m.practice_numeric_units_pair({ large, small });
	const terms = [
		() => m.practice_numeric_term_first(),
		() => m.practice_numeric_term_second(),
		() => m.practice_numeric_term_third()
	];
	const periods = [
		{ value: 'am', label: m.item_time_am() },
		{ value: 'pm', label: m.item_time_pm() }
	] as const;

	const row = 'flex flex-wrap items-center gap-2 text-sm font-semibold';
	const bar = 'h-0.5 w-full bg-foreground';
	const stack = 'inline-flex flex-col items-center gap-1';
	const unitBox = 'w-16 shrink-0 rounded-lg px-2 text-center';
	const toggle = 'font-normal';
</script>

{#snippet unitField(unit: string | null | undefined, set: (unit: string | undefined) => void)}
	<Label for="{id}-unit" class={cn(hint, 'font-normal')}>{m.practice_numeric_unit()}</Label>
	<Input
		id="{id}-unit"
		bind:value={() => unit ?? '', (text) => set(text || undefined)}
		autocomplete="off"
		aria-invalid={wrong('unit') ? true : undefined}
		class={unitBox}
	/>
{/snippet}

<FormField label={m.practice_numeric_form()} for="{id}-form">
	<!-- A block of its own, so the select keeps its width in a column that stretches its children. -->
	<div>
		<Select.Root type="single" bind:value={() => form, (next) => setForm(next as NumericForm)}>
			<Select.Trigger id="{id}-form">{NUMERIC_FORM_LABELS[form]()}</Select.Trigger>
			<Select.Content>
				{#each NUMERIC_FORMS as each (each)}
					<Select.Item value={each} label={NUMERIC_FORM_LABELS[each]()} />
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
</FormField>

<!--
	One snippet a form. Each takes the payload as the one form it is, which the branch that
	renders it has made sure of: inside a binding the compiler no longer knows which it was.
-->
{#snippet issues()}
	{#each errors as message (message)}
		<Issue {message} />
	{/each}
{/snippet}

{#snippet numberAnswer(answer: NumericNumberPayload)}
	<div class={row}>
		<NumericBox
			bind:value={answer.answer}
			label={m.practice_add_answer()}
			invalid={wrong('answer')}
			class="w-22"
		/>
		<span class={hint}>{m.practice_numeric_tolerance_word()}</span>
		<NumericBox
			bind:value={answer.tolerance}
			optional
			label={m.practice_numeric_tolerance()}
			placeholder="0"
			invalid={wrong('tolerance')}
		/>
		{@render unitField(answer.unit, (unit) => (answer.unit = unit))}
	</div>
	{@render issues()}
	<p class={hint}>{m.practice_numeric_number_hint()}</p>
{/snippet}

{#snippet fractionAnswer(answer: NumericFractionPayload)}
	{@const example = equal(answer.parts)?.join('/')}
	<div class={row}>
		<span class={stack}>
			<NumericBox
				bind:value={answer.parts[0]}
				whole
				label={m.practice_numeric_numerator()}
				invalid={wrong('parts', 0)}
			/>
			<span class={bar}></span>
			<NumericBox
				bind:value={answer.parts[1]}
				whole
				label={m.practice_numeric_denominator()}
				invalid={wrong('parts', 1)}
			/>
		</span>
	</div>
	{@render issues()}
	<Label class={toggle}>
		<Switch
			size="sm"
			bind:checked={() => answer.equivalent ?? false, (on) => (answer.equivalent = on || undefined)}
		/>
		{example
			? m.practice_numeric_equal_fractions_example({ example })
			: m.practice_numeric_equal_fractions()}
	</Label>
{/snippet}

{#snippet mixedAnswer(answer: NumericMixedPayload)}
	{@const example = improper(answer.parts)}
	<div class={row}>
		<NumericBox
			bind:value={answer.parts[0]}
			whole
			label={m.practice_numeric_whole()}
			invalid={wrong('parts', 0)}
		/>
		<span class={stack}>
			<NumericBox
				bind:value={answer.parts[1]}
				whole
				label={m.practice_numeric_numerator()}
				invalid={wrong('parts', 1)}
			/>
			<span class={bar}></span>
			<NumericBox
				bind:value={answer.parts[2]}
				whole
				label={m.practice_numeric_denominator()}
				invalid={wrong('parts', 2)}
			/>
		</span>
		{@render unitField(answer.unit, (unit) => (answer.unit = unit))}
	</div>
	{@render issues()}
	<Label class={toggle}>
		<Switch
			size="sm"
			bind:checked={() => answer.improper ?? false, (on) => (answer.improper = on || undefined)}
		/>
		{example ? m.practice_numeric_improper_example({ example }) : m.practice_numeric_improper()}
	</Label>
{/snippet}

{#snippet ratioAnswer(answer: NumericRatioPayload)}
	{@const [first, second, third] = answer.parts}
	{@const example = equal(answer.parts)?.join(' : ')}
	<div class={row}>
		{#each answer.parts, at (at)}
			{#if at > 0}
				<span>:</span>
			{/if}
			<NumericBox
				bind:value={answer.parts[at]}
				whole
				label={terms[at]()}
				invalid={wrong('parts', at)}
			/>
		{/each}
		<!-- One button for both, so the focus stays on it when the third term comes or goes. -->
		<IconButton
			variant="ghost"
			label={third === undefined ? m.practice_numeric_term_add() : m.practice_numeric_term_remove()}
			class="text-muted-foreground"
			onclick={() => (answer.parts = third === undefined ? [first, second, NaN] : [first, second])}
		>
			{#if third === undefined}
				<PlusIcon />
			{:else}
				<XIcon />
			{/if}
		</IconButton>
	</div>
	{@render issues()}
	<Label class={toggle}>
		<Switch
			size="sm"
			bind:checked={() => answer.equivalent ?? false, (on) => (answer.equivalent = on || undefined)}
		/>
		{example
			? m.practice_numeric_equal_ratios_example({ example })
			: m.practice_numeric_equal_ratios()}
	</Label>
{/snippet}

{#snippet moneyAnswer(answer: NumericMoneyPayload)}
	<div class={row}>
		<span>RM</span>
		<NumericBox
			bind:value={answer.answer}
			label={m.practice_numeric_amount()}
			format={money}
			invalid={wrong('answer')}
			class="w-24"
		/>
	</div>
	{@render issues()}
	<p class={hint}>{m.practice_numeric_money_hint()}</p>
{/snippet}

{#snippet timeAnswer(answer: NumericTimePayload)}
	<div class={row}>
		<!-- Made again when the clock is changed: the box shows what was typed, and the hour is rewritten. -->
		{#key answer.period === null}
			<NumericBox
				bind:value={answer.parts[0]}
				whole
				label={m.practice_numeric_hour()}
				invalid={wrong('parts', 0)}
			/>
		{/key}
		<span>:</span>
		<NumericBox
			bind:value={answer.parts[1]}
			whole
			label={m.practice_numeric_minutes()}
			format={minutes}
			invalid={wrong('parts', 1)}
		/>
		{#if answer.period !== null}
			<Segmented
				label={m.practice_numeric_period()}
				options={periods}
				bind:value={() => answer.period ?? 'am', (period) => (answer.period = period)}
			/>
		{/if}
	</div>
	{@render issues()}
	<!-- A time on the 24-hour clock is one with no a.m. or p.m. -->
	<Label class={toggle}>
		<Switch
			size="sm"
			bind:checked={() => answer.period === null, (full) => setClock(answer, full)}
		/>
		{m.practice_numeric_clock_24()}
	</Label>
	<p class={hint}>{m.practice_numeric_time_hint()}</p>
{/snippet}

{#snippet measureAnswer(answer: NumericMeasurePayload)}
	{@const chosen = MEASURE_UNITS.findIndex(
		([large, small]) => large === answer.units[0] && small === answer.units[1]
	)}
	<div class={row}>
		<NumericBox
			bind:value={answer.parts[0]}
			whole
			label={m.practice_numeric_larger()}
			invalid={wrong('parts', 0)}
		/>
		<span>{answer.units[0]}</span>
		<NumericBox
			bind:value={answer.parts[1]}
			whole
			label={m.practice_numeric_smaller()}
			invalid={wrong('parts', 1)}
		/>
		<span>{answer.units[1]}</span>
	</div>
	{@render issues()}
	<div>
		<Select.Root
			type="single"
			bind:value={
				() => String(chosen),
				(at) => {
					const [large, small] = MEASURE_UNITS[Number(at)];
					answer.units = [large, small];
				}
			}
		>
			<Select.Trigger
				aria-label={m.practice_numeric_units()}
				aria-invalid={unitsError ? true : undefined}
			>
				{#if answer.units.some(Boolean)}
					{pair(answer.units)}
				{:else}
					<span class="text-muted-foreground">{m.practice_numeric_units_choose()}</span>
				{/if}
			</Select.Trigger>
			<Select.Content>
				{#each MEASURE_UNITS as units, at (at)}
					<Select.Item value={String(at)} label={pair(units)} />
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<Issue message={unitsError} />
{/snippet}

<FormField label={m.practice_add_answer()}>
	{#if isNumber(payload)}
		{@render numberAnswer(payload)}
	{:else if payload.form === 'fraction'}
		{@render fractionAnswer(payload)}
	{:else if payload.form === 'mixed'}
		{@render mixedAnswer(payload)}
	{:else if payload.form === 'ratio'}
		{@render ratioAnswer(payload)}
	{:else if payload.form === 'money'}
		{@render moneyAnswer(payload)}
	{:else if payload.form === 'time'}
		{@render timeAnswer(payload)}
	{:else if payload.form === 'measure'}
		{@render measureAnswer(payload)}
	{/if}
</FormField>
