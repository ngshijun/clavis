<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dragHandleZone } from 'svelte-dnd-action';
	import Segmented from '#lib/components/app/segmented.svelte';
	import DragHandle from '#lib/components/rows/drag-handle.svelte';
	import { FLIP_MS, saveOrder } from '#lib/components/rows/reorder.js';
	import { DIFFICULTIES, type ItemPayload } from '#lib/items/payload.js';
	import { itemSummary } from '#lib/items/text.js';
	import { m } from '#lib/paraglide/messages.js';
	import type {
		QuestionOrder,
		StageEntry,
		StagePassage,
		StageQuestion
	} from '#lib/server/practice.js';
	import { cn } from '#lib/utils.js';
	import DifficultyMeter from './difficulty-meter.svelte';
	import type { Draft, PassageDraft } from './editor.svelte.js';
	import PassageIcon from './passage-icon.svelte';
	import QuestionLine from './question-line.svelte';
	import { hint } from './styles.js';

	/**
	 * Every question of the stage, in the order pupils get them when the order
	 * is fixed. A passage is one place in that order, with its own questions
	 * indented beneath it: it moves as one block, and its questions are put in
	 * order inside it. The open row follows the draft, so it reads as the
	 * question or the passage will once saved, and one not saved yet has a
	 * place kept for it where it will land.
	 *
	 * Its head says what the stage holds, how many questions and how many of
	 * each difficulty, and holds the order pupils get them in: a setting of the
	 * stage, kept beside the list it orders.
	 */
	let {
		stageId,
		entries: stored,
		order,
		onorder,
		imageBase,
		query,
		draft,
		questionHref,
		passageHref,
		class: className
	}: {
		stageId: string;
		entries: StageEntry[];
		order: QuestionOrder;
		/** Asks for the stage's questions to be served in another order. */
		onorder: (order: QuestionOrder) => void;
		/** What a stored picture's path is appended to, to get its public URL. */
		imageBase: string;
		/** What the list is searched for; empty for the whole list. */
		query: string;
		/** What is open in the editor, if anything is. */
		draft: Draft | PassageDraft | null;
		/** The address that opens a stored question. */
		questionHref: (questionId: string) => string;
		/** The address that opens a stored passage. */
		passageHref: (passageId: string) => string;
		class?: string;
	} = $props();

	// The order on screen follows a drag at once and goes back to the stored one when the page reloads.
	let entries = $derived(stored);

	/** The question in the editor that is not saved yet, if that is what is open. */
	const joining = $derived(draft?.kind === 'question' && draft.id === null ? draft : null);

	/**
	 * Questions are numbered straight through, a passage's among the rest. One
	 * not saved yet is numbered where it will land: after the last question of
	 * its passage, or of the stage.
	 */
	const numbers = $derived.by(() => {
		const byId: Record<string, number> = {};
		let position = 0;
		let unsaved: number | undefined;
		for (const entry of entries) {
			for (const question of entry.kind === 'passage' ? entry.questions : [entry]) {
				byId[question.id] = ++position;
			}
			if (entry.kind === 'passage' && joining?.passageId === entry.id) unsaved = ++position;
		}
		return {
			byId,
			unsaved: unsaved ?? position + 1,
			/** How many are stored, which is what the stage is said to have. */
			count: Object.keys(byId).length
		};
	});

	/** How many of the stored questions are of each difficulty. */
	const mix = $derived.by(() => {
		const questions = stored.flatMap((entry) =>
			entry.kind === 'passage' ? entry.questions : [entry]
		);
		return DIFFICULTIES.map((difficulty) => ({
			difficulty,
			count: questions.filter((question) => question.difficulty === difficulty).length
		}));
	});

	const orders = [
		{ value: 'fixed', label: m.practice_order_fixed() },
		{ value: 'random', label: m.practice_order_random() }
	] as const;

	const needle = $derived(query.trim().toLowerCase());
	const matches = (payload: ItemPayload) => itemSummary(payload).toLowerCase().includes(needle);

	/**
	 * What the search leaves. A passage stays, whole, for its title; otherwise
	 * it stays with those of its questions that match, or because the question
	 * being written is on it.
	 */
	const visible = $derived.by(() => {
		if (!needle) return entries;
		return entries.flatMap((entry): StageEntry[] => {
			if (entry.kind === 'question') return matches(entry.payload) ? [entry] : [];
			if (entry.title.toLowerCase().includes(needle)) return [entry];
			const questions = entry.questions.filter((question) => matches(question.payload));
			const kept = questions.length > 0 || joining?.passageId === entry.id;
			return kept ? [{ ...entry, questions }] : [];
		});
	});

	/**
	 * Rows can be dragged only where their order is what pupils get, and only
	 * with all of them in view. A row that cannot be dragged has no handle, and
	 * that is all that stops it: the drag library keeps one switch for every
	 * zone on the page, so a zone turned off here would turn off the lists that
	 * are dragged inside the editor too.
	 */
	const sortable = $derived(order === 'fixed' && !needle);

	/** Shows a passage's questions in the order a drag has them in. */
	function arrange(passageId: string, questions: StageQuestion[]) {
		entries = entries.map((entry) =>
			entry.kind === 'passage' && entry.id === passageId ? { ...entry, questions } : entry
		);
	}

	/** A passage's questions as stored, which a drag's order is saved against. */
	function storedQuestions(passageId: string): StageQuestion[] {
		const passage = stored.find((entry) => entry.kind === 'passage' && entry.id === passageId);
		return passage?.kind === 'passage' ? passage.questions : [];
	}

	/**
	 * Brings the open row into view in a list longer than its pane. Only the
	 * list is moved: the page itself stays where the person has it.
	 */
	function reveal(row: HTMLElement) {
		const pane = row.closest('[data-list-rows]');
		if (!pane) return;
		const within = pane.getBoundingClientRect();
		const { top, bottom } = row.getBoundingClientRect();
		if (top < within.top) pane.scrollTop -= within.top - top;
		else if (bottom > within.bottom) pane.scrollTop += bottom - within.bottom;
	}

	/**
	 * What a row is called by the drag library when it says, to a screen reader,
	 * which row is being carried and where it has been put.
	 */
	const nameOf = (question: StageQuestion) =>
		itemSummary(question.payload) || m.practice_new_question();

	/** The padding that sets a row with no handle in line with the rows that have one. */
	const lead = $derived(sortable ? 'ps-7.5' : 'ps-3');
</script>

{#snippet questionRow(question: StageQuestion)}
	{@const open = draft?.kind === 'question' && draft.id === question.id}
	{@const shown = open && draft?.kind === 'question' ? draft : question}
	{@const text = itemSummary(shown.payload)}
	<!-- The picture of the open question may be one just picked, which only its draft can show. -->
	{@const picture =
		open && draft
			? draft.uploads.url(shown.payload.image_path)
			: question.payload.image_path && imageBase + question.payload.image_path}
	<div
		class={cn('flex items-start rounded-xl', open ? 'bg-accent' : 'hover:bg-muted')}
		{@attach open && reveal}
	>
		{#if sortable}
			<!-- Set down by the row's own padding, so it is level with the number on the first line. -->
			<DragHandle label={m.row_reorder({ name: text })} class="ms-1 mt-1" />
		{/if}
		<a
			href={questionHref(question.id)}
			data-sveltekit-reset={false}
			aria-current={open ? 'true' : undefined}
			class={cn(
				'flex min-w-0 flex-1 items-start gap-2.5 rounded-xl py-2 pe-3 outline-none focus-visible:ring-2 focus-visible:ring-ring',
				sortable ? 'ps-1.5' : 'ps-3'
			)}
		>
			<QuestionLine
				position={numbers.byId[question.id]}
				type={shown.payload.type}
				difficulty={shown.difficulty}
				{text}
				picture={picture || undefined}
				{open}
				unsaved={open && draft?.dirty}
			/>
		</a>
	</div>
{/snippet}

<!-- What a passage's row says: its title, that it is a passage, and how many questions it has. -->
{#snippet passageLine(title: string, count: number)}
	<PassageIcon />
	<span class="grid min-w-0 gap-0.5 leading-snug">
		<span class={cn('truncate font-medium', !title.trim() && 'text-muted-foreground')}>
			{title.trim() || m.practice_new_passage()}
		</span>
		<span class={cn(hint, 'truncate')}>{m.practice_passage_meta({ count })}</span>
	</span>
{/snippet}

{#snippet passageBlock(passage: StagePassage)}
	{@const open = draft?.kind === 'passage' && draft.id === passage.id}
	{@const title = open && draft?.kind === 'passage' ? draft.content.title : passage.title}
	<div
		class={cn('flex items-center rounded-xl', open ? 'bg-accent' : 'hover:bg-muted')}
		{@attach open && reveal}
	>
		{#if sortable}
			<DragHandle label={m.row_reorder({ name: passage.title })} class="ms-1" />
		{/if}
		<a
			href={passageHref(passage.id)}
			data-sveltekit-reset={false}
			aria-current={open ? 'true' : undefined}
			class={cn(
				'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pe-3 outline-none focus-visible:ring-2 focus-visible:ring-ring',
				sortable ? 'ps-1.5' : 'ps-3'
			)}
		>
			{@render passageLine(title, storedQuestions(passage.id).length)}
		</a>
	</div>

	<!--
		Its questions are a sequence of their own: dragged among themselves, never out of it. They
		hang from a line that comes down from the passage's row, so the block reads as one thing.
	-->
	<div class="ms-3.5 flex flex-col gap-0.5 border-s border-border-strong/50 ps-1.5">
		<div
			class="flex flex-col gap-0.5"
			use:dragHandleZone={{
				items: passage.questions,
				type: `passage:${passage.id}`,
				flipDurationMs: FLIP_MS,
				dropTargetStyle: {}
			}}
			onconsider={(event) => arrange(passage.id, event.detail.items)}
			onfinalize={(event) => {
				arrange(passage.id, event.detail.items);
				saveOrder(
					{ kind: 'passage', parentId: passage.id },
					storedQuestions(passage.id),
					event.detail.items
				).then((saved) => saved || (entries = stored));
			}}
		>
			{#each passage.questions as question (question.id)}
				<div aria-label={nameOf(question)} animate:flip={{ duration: FLIP_MS }}>
					{@render questionRow(question)}
				</div>
			{/each}
		</div>
		{#if joining?.passageId === passage.id}
			{@render unsavedQuestion(joining)}
		{/if}
	</div>
{/snippet}

<!-- A question not saved yet has a place kept for it: the last of its passage, or of the stage. -->
{#snippet unsavedQuestion(question: Draft)}
	<div
		class={cn('flex items-start gap-2.5 rounded-xl bg-accent py-2 pe-3', lead)}
		aria-current="true"
		{@attach reveal}
	>
		<QuestionLine
			position={numbers.unsaved}
			type={question.payload.type}
			difficulty={question.difficulty}
			text={itemSummary(question.payload)}
			picture={question.uploads.url(question.payload.image_path)}
			open
			unsaved
		/>
	</div>
{/snippet}

<nav aria-label={m.practice_list_label()} class={cn('flex min-h-0 flex-col', className)}>
	<div class="flex flex-col gap-2 pb-2">
		<div class="flex items-center justify-between gap-3 px-3">
			<h2 class="font-semibold">{m.practice_question_count({ count: numbers.count })}</h2>
			<span class="flex gap-3 text-xs text-muted-foreground tabular-nums">
				{#each mix as each (each.difficulty)}
					<span class="inline-flex items-end gap-1 leading-none">
						<DifficultyMeter difficulty={each.difficulty} />
						{each.count}
					</span>
				{/each}
			</span>
		</div>
		<Segmented
			bind:value={() => order, onorder}
			options={orders}
			label={m.practice_order_label()}
			class="grid w-full grid-cols-2"
		/>
		<p class={cn(hint, 'px-3')}>
			{order === 'fixed' ? m.practice_caption_fixed() : m.practice_caption_random()}
		</p>
	</div>

	<!-- The rows scroll under the head, which says what the whole list is. -->
	<div data-list-rows class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
		<div
			class="flex flex-col gap-0.5"
			aria-label={m.practice_list_label()}
			use:dragHandleZone={{
				items: visible,
				type: `entries:${stageId}`,
				flipDurationMs: FLIP_MS,
				dropTargetStyle: {}
			}}
			onconsider={(event) => (entries = event.detail.items)}
			onfinalize={(event) => {
				entries = event.detail.items;
				saveOrder({ kind: 'entry', parentId: stageId }, stored, entries).then(
					(saved) => saved || (entries = stored)
				);
			}}
		>
			{#each visible as entry (entry.id)}
				<div
					class="flex flex-col gap-0.5"
					aria-label={entry.kind === 'question' ? nameOf(entry) : entry.title}
					animate:flip={{ duration: FLIP_MS }}
				>
					{#if entry.kind === 'question'}
						{@render questionRow(entry)}
					{:else}
						{@render passageBlock(entry)}
					{/if}
				</div>
			{/each}
		</div>

		{#if joining && !visible.some((entry) => entry.id === joining.passageId)}
			{@render unsavedQuestion(joining)}
		{:else if draft?.kind === 'passage' && draft.id === null}
			<!-- So has a passage not saved yet: the last of the stage, with no questions so far. -->
			<div
				class={cn('flex items-center gap-2.5 rounded-xl bg-accent py-2 pe-3', lead)}
				aria-current="true"
				{@attach reveal}
			>
				{@render passageLine(draft.content.title, 0)}
			</div>
		{:else if needle && visible.length === 0}
			<p class="px-3 text-sm text-muted-foreground">{m.practice_no_match()}</p>
		{/if}
	</div>
</nav>
