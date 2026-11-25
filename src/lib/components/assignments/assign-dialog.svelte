<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import FormRefusal from '#lib/components/app/form-refusal.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { settleForm } from '#lib/components/rows/feedback.js';
	import Score from '#lib/components/runner/score.svelte';
	import { stopsOf, type Stop } from '#lib/components/runner/stage-path.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { dateField, endOfDay } from '#lib/dates.js';
	import type { Standing } from '#lib/items/progress.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { TopicStages } from '#lib/server/practice.js';

	/**
	 * A stage being assigned: to the whole class or to chosen students, each
	 * shown with their best so far so that the ones who need it are easy to
	 * pick, with or without a due date. Opened from a stage it assigns that
	 * one; opened from a page's own button it asks which first. It posts to
	 * the page's `assign` action.
	 *
	 * Mounted while it is needed and unmounted once it has closed, so every
	 * opening starts afresh.
	 *
	 * A 26px dialog with an 8px inset, so the pane of students has 18px
	 * corners; it insets 8px in turn, which leaves 10px for a row.
	 */
	let {
		stop,
		topics,
		students,
		standings,
		onclosed
	}: {
		/** The stage to assign. Left out, the dialog asks for one of the classroom's. */
		stop?: Stop;
		/** The stages the classroom can practise, topic by topic. */
		topics: TopicStages[];
		/** Every student of the classroom. */
		students: { id: string; name: string }[];
		/** Where each student stands on each stage they have practised, by the student's id and then the stage's. */
		standings: Record<string, Record<string, Standing>>;
		onclosed: () => void;
	} = $props();

	let open = $state(true);
	let submitting = $state(false);
	let refusal = $state<string | null>(null);

	const stops = $derived(stopsOf(topics));
	let stageId = $state(untrack(() => stop?.stage.id ?? ''));
	const picked = $derived(stops[stageId]);
	const rows = $derived(
		students.map((student) => ({ ...student, standing: standings[student.id]?.[stageId] }))
	);

	let to = $state<'class' | 'chosen'>('class');
	// Choosing starts from the students short of three stars on the stage: the ones it has more to give.
	const ticked = new SvelteSet<string>();
	function tickForStage() {
		ticked.clear();
		for (const row of rows) if ((row.standing?.stars ?? 0) < 3) ticked.add(row.id);
	}
	untrack(tickForStage);
	const given = $derived(to === 'class' ? rows : rows.filter((row) => ticked.has(row.id)));

	let due = $state('');
	let dueError = $state<string>();
	/** The moment the chosen day ends where the teacher is; undefined when it has already ended. */
	function dueMoment(): Date | undefined {
		const end = endOfDay(due);
		return end && end.getTime() > Date.now() ? end : undefined;
	}
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="max-h-[calc(100svh-2rem)] gap-2 overflow-y-auto p-2 sm:max-w-lg">
		<Dialog.Header class="px-4 pe-10 pt-4">
			{#if stop}
				<span class="text-xs font-semibold text-primary">{m.assignment_kicker()}</span>
				<Dialog.Title class="leading-snug">{stop.stage.name}</Dialog.Title>
				<Dialog.Description>
					{m.practice_stage_number({ n: stop.number })} ·
					{m.count_questions({ count: stop.stage.questionCount })} · {stop.topic.name}
				</Dialog.Description>
			{:else}
				<Dialog.Title>{m.assignment_kicker()}</Dialog.Title>
			{/if}
		</Dialog.Header>

		<form
			method="POST"
			action="?/assign"
			use:enhance={({ formData, cancel }) => {
				if (due) {
					const moment = dueMoment();
					if (!moment) {
						dueError = m.assignment_due_past();
						cancel();
						return;
					}
					formData.set('dueAt', moment.toISOString());
				}
				const count = given.length;
				submitting = true;
				return async ({ result }) => {
					const refused = await settleForm(result);
					submitting = false;
					if (refused) {
						refusal = refused.message;
						return;
					}
					// The assignment is listed on another tab, so it is said here.
					toast.success(m.assignment_assigned_toast({ count }));
					open = false;
				};
			}}
		>
			<input type="hidden" name="stageId" value={stageId} />
			{#each given as row (row.id)}
				<input type="hidden" name="studentId" value={row.id} />
			{/each}

			<Field.FieldGroup class="px-4 py-2">
				<FormRefusal message={refusal} />
				{#if !stop}
					<Field.Field>
						<Field.FieldLabel for="assignment-stage">{m.assignment_stage_label()}</Field.FieldLabel>
						<Select.Root type="single" bind:value={stageId} onValueChange={tickForStage}>
							<Select.Trigger id="assignment-stage" class="w-full">
								{#if picked}
									<!-- With its topic, since two topics may each have a stage of one name. -->
									<span class="truncate">
										{picked.stage.name}
										<span class="text-muted-foreground">· {picked.topic.name}</span>
									</span>
								{:else}
									<span class="text-muted-foreground">{m.assignment_stage_placeholder()}</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#each topics as topic (topic.id)}
									<Select.Group>
										<Select.GroupHeading>{topic.name}</Select.GroupHeading>
										{#each topic.stages as each (each.id)}
											<Select.Item value={each.id} label={each.name} />
										{/each}
									</Select.Group>
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				{/if}
				<Field.FieldSet>
					<Field.FieldLegend variant="label">{m.assignment_to()}</Field.FieldLegend>
					<Segmented
						label={m.assignment_to()}
						class="self-start"
						options={[
							{ value: 'class', label: m.assignment_whole_class() },
							{ value: 'chosen', label: m.assignment_chosen() }
						]}
						bind:value={to}
					/>
					{#if to === 'chosen'}
						<ul
							class="-mx-2 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-2xl bg-background p-2"
						>
							{#each rows as row (row.id)}
								<li>
									<label
										class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-card px-3 py-2"
									>
										<Checkbox
											checked={ticked.has(row.id)}
											onCheckedChange={(on) => {
												if (on) ticked.add(row.id);
												else ticked.delete(row.id);
											}}
										/>
										<span class="min-w-0 flex-1 truncate font-medium">{row.name}</span>
										{#if row.standing}
											<Score score={row.standing.best} />
										{:else if picked}
											<span class="text-xs text-muted-foreground">{m.stars_not_practised()}</span>
										{/if}
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				</Field.FieldSet>

				<Field.Field data-invalid={dueError ? true : undefined}>
					<Field.FieldLabel for="assignment-due">
						{m.assignment_due_label()}
						<span class="font-normal text-muted-foreground">· {m.assignment_optional()}</span>
					</Field.FieldLabel>
					<Input
						id="assignment-due"
						type="date"
						class="w-auto self-start"
						min={dateField(new Date())}
						aria-invalid={dueError ? true : undefined}
						bind:value={due}
						oninput={() => (dueError = undefined)}
					/>
					{#if dueError}
						<Field.FieldError>{dueError}</Field.FieldError>
					{:else}
						<Field.FieldDescription>{m.assignment_due_hint()}</Field.FieldDescription>
					{/if}
				</Field.Field>
			</Field.FieldGroup>

			<Dialog.Footer class="px-4 pt-2 pb-4">
				<Button
					type="button"
					variant="outline"
					disabled={submitting}
					onclick={() => (open = false)}
				>
					{m.action_cancel()}
				</Button>
				<Button type="submit" disabled={submitting || !picked || given.length === 0}>
					{#if submitting}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.assignment_submit({ count: given.length })}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
