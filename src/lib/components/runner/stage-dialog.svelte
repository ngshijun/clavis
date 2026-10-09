<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { dayOf, timeOf } from '#lib/dates.js';
	import { markFigure } from '#lib/items/run.js';
	import { bestOf, starsOf, starTargets } from '#lib/items/stars.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Attempt } from '#lib/server/run.js';
	import { cn } from '#lib/utils.js';
	import type { Stop } from './stage-path.svelte';
	import StarsRow from './stars.svelte';

	/**
	 * What a pupil is shown before a stage starts. On one side is the best
	 * they have scored on it and what each star takes, in the stage's own
	 * marks; on the other, every time they have finished it, the latest first.
	 * The run starts from its button and from nowhere else in it.
	 *
	 * A teacher reads the same of one of their students: the dialog is then
	 * given nowhere to start a run, and has no button for it. It is given
	 * where each attempt can be read instead, and an attempt leads there.
	 *
	 * A 26px dialog with an 8px inset, so the pane of attempts has 18px
	 * corners; it insets 8px in turn, which leaves 10px for a row.
	 */
	let {
		open = $bindable(),
		stop,
		attempts,
		href,
		attemptHref
	}: {
		open: boolean;
		stop: Stop;
		/** The pupil's finished sessions of the stage, the latest first. */
		attempts: Attempt[];
		/** Where the stage is practised; left out when the dialog is only read. */
		href?: string;
		/** Where an attempt is read back, question by question; left out when it cannot be. */
		attemptHref?: (attempt: Attempt) => string;
	} = $props();

	const STARS = [1, 2, 3] as const;

	const total = $derived(stop.stage.questionCount);
	const targets = $derived(starTargets(total));
	const best = $derived(bestOf(attempts));
	const earned = $derived(best ? starsOf(best.marks, best.total) : 0);

	let start = $state<HTMLElement | null>(null);

	const caption = 'text-xs font-semibold tracking-widest text-muted-foreground uppercase';
	const row = 'flex min-h-13 items-center gap-3 rounded-lg bg-card px-3 py-2';
</script>

{#snippet past(attempt: Attempt)}
	{@const at = new Date(attempt.completedAt)}
	<span class="grid min-w-0 flex-1 leading-snug">
		<span class="truncate font-medium first-letter:uppercase">{dayOf(at)}</span>
		<span class="text-xs text-muted-foreground">{timeOf(at)}</span>
	</span>
	{#if attempt === best}
		<Badge variant="secondary">{m.stars_best()}</Badge>
	{/if}
	<span class="font-semibold tabular-nums">
		<span class="sr-only">
			{m.stars_score({ marks: markFigure(attempt.marks), total: attempt.total })}
		</span>
		<span aria-hidden="true">{markFigure(attempt.marks)}/{attempt.total}</span>
	</span>
	<StarsRow count={starsOf(attempt.marks, attempt.total)} />
{/snippet}

<Dialog.Root bind:open>
	<!-- It opens with the focus on the button that starts the stage, which is what it is opened for. -->
	<Dialog.Content
		class="max-h-[calc(100svh-2rem)] gap-2 overflow-y-auto p-2 sm:max-w-3xl"
		onOpenAutoFocus={(event) => {
			if (!start) return;
			event.preventDefault();
			start.focus();
		}}
	>
		<Dialog.Header class="px-4 pe-10 pt-4">
			<span class="text-xs font-semibold text-primary">
				{m.practice_stage_number({ n: stop.number })}
			</span>
			<Dialog.Title class="leading-snug">{stop.stage.name}</Dialog.Title>
			<Dialog.Description>
				{m.count_questions({ count: total })} · {stop.topic.name}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-wrap gap-2">
			<section class="flex min-w-0 flex-[1_1_18rem] flex-col gap-4 px-4 py-2">
				<h3 class={caption}>{href ? m.stars_your_best() : m.stars_best_result()}</h3>
				<div class="flex flex-col items-center gap-2 py-1 text-center">
					<StarsRow count={earned} class="gap-1.5 [&_svg]:size-11 [&_svg]:stroke-[1.5]" />
					{#if best}
						<p>
							<span class="text-xl font-bold tabular-nums">
								{markFigure(best.marks)}/{best.total}
							</span>
							<span class="text-muted-foreground">
								{m.stars_marks_when({ when: dayOf(new Date(best.completedAt)) })}
							</span>
						</p>
					{:else}
						<p class="text-muted-foreground">{m.stars_not_practised()}</p>
					{/if}
				</div>

				<h3 class={caption}>{m.stars_how()}</h3>
				<ul class="flex flex-col gap-1">
					{#each STARS as star (star)}
						{@const target = targets[star - 1]}
						{@const got = earned >= star}
						<li class="flex min-h-9 items-center gap-3">
							<StarsRow count={star} class="[&_svg]:size-5" />
							<span class={cn('min-w-0 flex-1', got && 'font-semibold')}>
								{star === 3
									? m.stars_target_all({ count: target })
									: m.stars_target({ count: target })}
							</span>
							{#if got}
								<span
									class="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
								>
									<CheckIcon class="size-3" strokeWidth={3.5} aria-hidden="true" />
									<span class="sr-only">{m.stars_earned()}</span>
								</span>
							{:else}
								<span class="size-5 shrink-0 rounded-full border-[1.5px] border-border-strong/60">
									<span class="sr-only">{m.stars_not_earned()}</span>
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			<section class="flex min-w-0 flex-[1_1_18rem] flex-col gap-2 rounded-2xl bg-background p-2">
				<h3 class={cn(caption, 'px-2 pt-2')}>{m.stars_past()}</h3>
				{#if attempts.length === 0}
					<Empty.Root class="flex-1 p-4">
						<Empty.Header>
							<Empty.Title class="text-base">{m.stars_none_title()}</Empty.Title>
							<Empty.Description>{m.stars_none_description()}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{:else}
					<ul class="flex max-h-58 flex-col gap-1 overflow-y-auto">
						{#each attempts as attempt (attempt.id)}
							<li>
								{#if attemptHref}
									<a
										href={attemptHref(attempt)}
										class={cn(
											row,
											'outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50'
										)}
									>
										{@render past(attempt)}
										<ChevronRightIcon
											class="size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
									</a>
								{:else}
									<div class={row}>{@render past(attempt)}</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<Dialog.Footer class="px-4 pt-2 pb-4">
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>
						{href ? m.action_cancel() : m.action_close()}
					</Button>
				{/snippet}
			</Dialog.Close>
			{#if href}
				<Button bind:ref={start} {href}>
					{best ? m.practice_again() : m.practice_start()}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
