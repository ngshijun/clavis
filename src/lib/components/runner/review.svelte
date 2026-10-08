<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ContrastIcon from '@lucide/svelte/icons/contrast';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import XIcon from '@lucide/svelte/icons/x';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import PassageView from './passage-view.svelte';
	import {
		markFigure,
		stepsOf,
		type Answers,
		type Marked,
		type Run,
		type RunQuestion
	} from '#lib/items/run.js';
	import { isAnswered } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getRunner } from './context.js';
	import { markOf, type Mark } from './marks.js';
	import QuestionView from './question-view.svelte';
	import RunShell from './run-shell.svelte';
	import { hint, number, tile, tiles } from './styles.js';

	/**
	 * A finished stage, marked. A rail holds the score, how the questions
	 * fell, and every question's number to go to it by; beside it is every
	 * question with the answer that was given, how it and each part of it was
	 * marked and, where it fell short, the tip. The right answer to a question
	 * got wrong is never shown.
	 */
	let {
		run,
		answers,
		marked,
		actions
	}: {
		run: Run;
		answers: Answers;
		marked: Marked;
		/** What can be done next, drawn under the score. */
		actions: Snippet;
	} = $props();

	const runner = getRunner();

	/** How each mark is said: in a word, a symbol and a colour, never the colour alone. */
	const MARKS: Record<Mark, { label: () => string; icon: Component; tint: string; solid: string }> =
		{
			right: {
				label: m.run_mark_full,
				icon: CheckIcon,
				tint: 'bg-success/10 text-success',
				solid: 'bg-success text-success-foreground'
			},
			part: {
				label: m.run_mark_partly,
				icon: ContrastIcon,
				tint: 'bg-warning/10 text-warning',
				solid: 'bg-warning text-warning-foreground'
			},
			wrong: {
				label: m.run_mark_none,
				icon: XIcon,
				tint: 'bg-destructive/10 text-destructive',
				solid: 'bg-destructive text-destructive-foreground'
			},
			none: {
				label: m.run_mark_unanswered,
				icon: MinusIcon,
				tint: 'bg-muted text-muted-foreground',
				solid: 'bg-muted-foreground text-card'
			}
		};
	const kinds = Object.keys(MARKS) as Mark[];

	// Every question that was marked, with the answer given to it. One that
	// came into the stage after the run was dealt is not among them.
	const results = $derived(
		stepsOf(run).flatMap(({ question }) => {
			const result = marked.questions.find((each) => each.question_id === question.id);
			if (!result) return [];
			const given = answers[question.id] ?? {};
			return [{ asked: question, given, result, mark: markOf(result, isAnswered(given)) }];
		})
	);
	const resultOf = (id: string) => results.find((each) => each.asked.id === id);
	const count = (mark: Mark) => results.filter((each) => each.mark === mark).length;

	// Which questions are listed: all of them, or only those short of the whole mark.
	let show = $state<'all' | 'review'>('all');
	const toReview = $derived(results.length - count('right'));
	const listed = (id: string) => {
		const result = resultOf(id);
		return result !== undefined && (show === 'all' || result.mark !== 'right');
	};

	const anchor = (id: string) => `question-${id}`;
	const goTo = (id: string) =>
		document.getElementById(anchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
</script>

{#snippet question(asked: RunQuestion)}
	{@const entry = resultOf(asked.id)}
	{#if entry && listed(asked.id)}
		{@const { given, result, mark } = entry}
		{@const { label, icon: Icon, tint, solid } = MARKS[mark]}
		<Card.Root id={anchor(asked.id)} class="scroll-mt-4 gap-4 p-4">
			<div class="flex flex-wrap items-center gap-2 px-1">
				<span class={cn(number, 'size-7 text-sm', solid)}>{asked.number}</span>
				<span
					class={cn(
						'inline-flex h-7 items-center gap-1.5 rounded-full ps-2 pe-3 text-sm font-bold',
						tint
					)}
				>
					<Icon class="size-4" strokeWidth={3} aria-hidden="true" />
					{#if mark === 'part'}
						{m.run_mark_part({ correct: result.correct, total: result.total })}
					{:else}
						{label()}
					{/if}
				</span>
				<span class="ms-auto text-sm font-semibold text-secondary-foreground tabular-nums">
					{m.run_question_marks({ marks: markFigure(result.marks) })}
				</span>
			</div>
			<QuestionView item={asked.item} answer={given} readonly mark={result} />
			{#each result.tips as tip (tip)}
				<p class="flex gap-2.5 rounded-lg bg-background px-3 py-2.5 text-sm wrap-break-word">
					<LightbulbIcon class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
					<span>
						<span class="font-semibold">{m.run_tip()}</span>
						{tip}
					</span>
				</p>
			{/each}
		</Card.Root>
	{/if}
{/snippet}

<RunShell label={m.run_rail_marks()}>
	{#snippet rail()}
		<Card.Root class="gap-3 p-4">
			<div class="flex flex-wrap items-baseline gap-x-2 px-2">
				<span class="text-4xl leading-none font-extrabold tracking-tight text-primary tabular-nums">
					{markFigure(marked.marks)}
				</span>
				<span class="text-sm font-semibold text-secondary-foreground">
					{m.run_score_of({ total: marked.total })}
				</span>
			</div>
			<div class="flex h-2.5 gap-0.5" aria-hidden="true">
				{#each kinds as mark (mark)}
					{#if count(mark) > 0}
						<span
							class={cn('min-w-2.5 rounded-full', MARKS[mark].solid)}
							style:flex-grow={count(mark)}
						></span>
					{/if}
				{/each}
			</div>
			<ul class="flex flex-col gap-1.5 px-2 text-sm">
				{#each kinds as mark (mark)}
					<li class="flex items-center gap-1.5">
						<span class={cn('size-2 shrink-0 rounded-full', MARKS[mark].solid)}></span>
						<span class="min-w-0 truncate">{MARKS[mark].label()}</span>
						<span class="ms-auto font-bold tabular-nums">{count(mark)}</span>
					</li>
				{/each}
			</ul>
		</Card.Root>

		<Card.Root class="gap-3 p-4">
			<span class="px-2 text-xs font-semibold">{m.run_questions()}</span>
			<div class={tiles}>
				{#each results as { asked, mark } (asked.id)}
					{@const { label, icon: Icon, tint, solid } = MARKS[mark]}
					<Button
						variant="ghost"
						aria-label={m.run_tile_marked({ n: asked.number, mark: label() })}
						disabled={!listed(asked.id)}
						class={cn(tile, tint, 'hover:brightness-95')}
						onclick={() => goTo(asked.id)}
					>
						{asked.number}
						<span
							class={cn(
								'absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card',
								solid
							)}
						>
							<Icon class="size-2.5" strokeWidth={4} aria-hidden="true" />
						</span>
					</Button>
				{/each}
			</div>
			<span class={hint}>{m.run_map_hint()}</span>
			<!-- With nothing to review, or everything, there is nothing to choose between. -->
			{#if toReview > 0 && toReview < results.length}
				<Segmented
					label={m.run_show()}
					class="w-full *:flex-1"
					options={[
						{ value: 'all', label: m.run_show_all({ count: results.length }) },
						{ value: 'review', label: m.run_show_review({ count: toReview }) }
					]}
					bind:value={show}
				/>
			{/if}
		</Card.Root>

		<div class="flex flex-wrap gap-2 *:flex-1">
			{@render actions()}
		</div>
	{/snippet}

	{#each run.entries as entry (entry.id)}
		{#if entry.kind === 'question'}
			{@render question(entry)}
		{:else if entry.questions.some((asked) => listed(asked.id))}
			<PassageView
				title={entry.title}
				body={entry.body}
				imageUrl={runner.imageUrl(entry.image_path)}
			/>
			{#each entry.questions as asked (asked.id)}
				{@render question(asked)}
			{/each}
		{/if}
	{/each}
</RunShell>
