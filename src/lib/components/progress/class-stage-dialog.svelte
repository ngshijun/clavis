<script lang="ts">
	import Day from '#lib/components/app/day.svelte';
	import PersonRow from '#lib/components/app/person-row.svelte';
	import Score from '#lib/components/runner/score.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import StarsRow from '#lib/components/runner/stars.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { tallyOf, type Standing } from '#lib/items/progress.js';
	import { starTargets, type Stars } from '#lib/items/stars.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import ClassBar from './class-bar.svelte';

	/**
	 * One stage as a classroom's staff read it, laid out as the dialog a
	 * student is shown before a run. On one side is the class as a whole: how many have
	 * practised the stage, and how many stand at each star, with what the star
	 * takes in the stage's own marks. On the other is every student of the
	 * classroom with their best. A student's row leads to their page, and a
	 * teacher can assign the stage from here.
	 *
	 * A 26px dialog with an 8px inset, so the pane of students has 18px
	 * corners; it insets 8px in turn, which leaves 10px for a row.
	 */
	let {
		open = $bindable(),
		stop,
		rows,
		onassign
	}: {
		open: boolean;
		stop: Stop;
		/** Every student of the classroom: where they stand on the stage, and their page. */
		rows: { id: string; name: string; standing: Standing | undefined; href: string }[];
		/**
		 * Called when the stage is to be assigned: the page closes this dialog and opens the one
		 * that assigns. Left out when it cannot be: the reader does not assign, or nobody is in
		 * the classroom to assign it to.
		 */
		onassign?: () => void;
	} = $props();

	const total = $derived(stop.stage.questionCount);
	const tally = $derived(tallyOf(rows.map((row) => row.standing)));
	const practised = $derived(rows.length - tally.unpractised);
	const targets = $derived(starTargets(total));

	/** The class at each star, the most stars first, with the marks that star takes. */
	const lines = $derived<{ stars: Stars; marks: string; count: number }[]>([
		{ stars: 3, marks: m.stars_target_all({ count: targets[2] }), count: tally.stars[3] },
		{ stars: 2, marks: m.stars_target({ count: targets[1] }), count: tally.stars[2] },
		{ stars: 1, marks: m.stars_target({ count: targets[0] }), count: tally.stars[1] },
		{ stars: 0, marks: m.progress_under({ count: targets[0] }), count: tally.stars[0] }
	]);

	const caption = 'text-xs font-semibold tracking-widest text-muted-foreground uppercase';
	/**
	 * A row of the pane: a white one on the pane's grey, with the 10px corners
	 * its inset leaves, and kept to one line, as the pane is never wide.
	 */
	const paneRow = 'min-h-13 flex-nowrap rounded-lg bg-card px-3 hover:bg-accent active:bg-accent';
</script>

{#snippet line(count: number, marks: string, stars?: Stars)}
	<li class={cn('flex min-h-9 items-center gap-3', count === 0 && 'text-muted-foreground')}>
		{#if stars === undefined}
			<span class="w-16 shrink-0 text-center" aria-hidden="true">—</span>
		{:else}
			<StarsRow count={stars} class="[&_svg]:size-5" />
		{/if}
		<span class="min-w-0 flex-1">{marks}</span>
		<span class={cn('tabular-nums', count > 0 && 'font-semibold')}>
			{m.count_students({ count })}
		</span>
	</li>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100svh-2rem)] gap-2 overflow-y-auto p-2 sm:max-w-3xl">
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
				<h3 class={caption}>{m.progress_class()}</h3>
				<div class="flex flex-col gap-2.5 py-1">
					<p>
						<span class="text-xl font-bold tabular-nums">
							{m.progress_done_of({ done: practised, count: rows.length })}
						</span>
						<span class="text-muted-foreground">{m.progress_have_practised()}</span>
					</p>
					<ClassBar {tally} class="w-full" />
				</div>

				<h3 class={caption}>{m.progress_best_results()}</h3>
				<ul class="flex flex-col gap-1">
					{#each lines as item (item.stars)}
						{@render line(item.count, item.marks, item.stars)}
					{/each}
					{@render line(tally.unpractised, m.progress_unpractised())}
				</ul>
			</section>

			<section class="flex min-w-0 flex-[1_1_20rem] flex-col gap-2 rounded-2xl bg-background p-2">
				<h3 class={cn(caption, 'px-2 pt-2')}>{m.section_students()}</h3>
				<ul class="flex max-h-88 flex-col gap-1 overflow-y-auto">
					{#each rows as row (row.id)}
						<PersonRow name={row.name} href={row.href} class={paneRow}>
							{#snippet detail()}
								{#if row.standing}
									{m.count_attempts({ count: row.standing.attempts })} ·
									<Day at={row.standing.last} />
								{:else}
									{m.stars_not_practised()}
								{/if}
							{/snippet}
							{#snippet tail()}
								<Score score={row.standing?.best} />
							{/snippet}
						</PersonRow>
					{/each}
				</ul>
			</section>
		</div>

		<Dialog.Footer class="px-4 pt-2 pb-4">
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>{m.action_close()}</Button>
				{/snippet}
			</Dialog.Close>
			{#if onassign}
				<Button onclick={onassign}>{m.assignment_assign()}</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
