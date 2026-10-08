<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import PassageView from './passage-view.svelte';
	import { stepsOf, type Answers, type Run } from '#lib/items/run.js';
	import { isAnswered } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getRunner } from './context.js';
	import QuestionView from './question-view.svelte';
	import RunShell from './run-shell.svelte';
	import { hint, tile, tiles } from './styles.js';

	/**
	 * A stage being answered: one question at a time, forwards and back or
	 * straight to any by its number, until the pupil finishes. Nothing is
	 * marked on the way; the answers and the tips come when the whole of it is
	 * done.
	 */
	let {
		run,
		answers = $bindable(),
		finishing,
		onfinish
	}: {
		run: Run;
		/** Bound: the answer to each question, by its id. */
		answers: Answers;
		/** Whether the answers are on their way to be marked. */
		finishing: boolean;
		onfinish: () => void;
	} = $props();

	const runner = getRunner();
	const steps = $derived(stepsOf(run));
	let at = $state(0);
	const step = $derived(steps[at]);
	const last = $derived(at === steps.length - 1);

	const answered = (id: string) => isAnswered(answers[id] ?? {});
	const unanswered = $derived(steps.filter(({ question }) => !answered(question.id)).length);
	let confirming = $state(false);

	/** Brings the number of the question being answered to the middle of its row, where the row scrolls. */
	const centre: Attachment<HTMLElement> = (tile) => {
		const row = tile.parentElement;
		if (!row) return;
		const along = tile.getBoundingClientRect().left - row.getBoundingClientRect().left;
		row.scrollTo({ left: row.scrollLeft + along - (row.clientWidth - tile.offsetWidth) / 2 });
	};

	function finish() {
		if (unanswered > 0) confirming = true;
		else onfinish();
	}
</script>

<RunShell label={m.run_rail_progress()}>
	{#snippet rail()}
		<Card.Root class="gap-3 p-4">
			<div class="flex items-baseline justify-between gap-4 {hint}">
				<span class="font-semibold text-foreground tabular-nums" aria-live="polite">
					{m.run_question_of({ n: step.question.number, total: run.total })}
				</span>
				<span class="shrink-0 tabular-nums">
					{m.run_answered({ count: steps.length - unanswered })}
				</span>
			</div>
			<Progress
				value={steps.length - unanswered}
				max={steps.length}
				class="h-1.5"
				aria-hidden="true"
			/>
			<!-- Above the question the numbers are one row that scrolls sideways, so the question stays near the top. -->
			<div
				class={cn(
					tiles,
					'@max-3xl:-m-1 @max-3xl:flex @max-3xl:[scrollbar-width:none] @max-3xl:overflow-x-auto @max-3xl:p-1'
				)}
			>
				{#each steps as { question }, index (question.id)}
					{@const done = answered(question.id)}
					<Button
						variant={index === at ? 'default' : done ? 'secondary' : 'outline'}
						aria-current={index === at ? 'step' : undefined}
						aria-label={done
							? m.run_tile_answered({ n: question.number })
							: m.run_tile({ n: question.number })}
						class={cn(
							tile,
							'@max-3xl:w-10 @max-3xl:shrink-0',
							index !== at && done && 'bg-accent text-accent-foreground'
						)}
						onclick={() => (at = index)}
						{@attach index === at && centre}
					>
						{question.number}
					</Button>
				{/each}
			</div>
			<span class="{hint} @max-3xl:hidden">{m.run_map_hint()}</span>
		</Card.Root>
	{/snippet}

	<Card.Root class="gap-4 p-4">
		<!-- Made again for each question, so an answer area starts from that question's answer. -->
		{#key step.question.id}
			{#if step.passage}
				<PassageView
					title={step.passage.title}
					body={step.passage.body}
					imageUrl={runner.imageUrl(step.passage.image_path)}
				/>
			{/if}
			<QuestionView
				item={step.question.item}
				bind:answer={
					() => answers[step.question.id] ?? {},
					(answer) => (answers = { ...answers, [step.question.id]: answer })
				}
			/>
		{/key}
	</Card.Root>

	<div class="flex flex-wrap items-center justify-end gap-2">
		<span class="{hint} me-auto">{m.run_answers_after()}</span>
		{#if at > 0}
			<Button variant="outline" onclick={() => (at -= 1)}>{m.run_previous()}</Button>
		{/if}
		{#if last}
			<Button disabled={finishing} onclick={finish}>
				{#if finishing}
					<Spinner data-icon="inline-start" />
				{/if}
				{m.run_finish()}
			</Button>
		{:else}
			<Button onclick={() => (at += 1)}>{m.run_next()}</Button>
		{/if}
	</div>
</RunShell>

<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.run_unanswered_title({ count: unanswered })}</AlertDialog.Title>
			<AlertDialog.Description>{m.run_unanswered_description()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.run_keep_answering()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={onfinish}>{m.run_finish()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
