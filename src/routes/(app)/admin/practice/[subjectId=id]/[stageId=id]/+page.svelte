<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import AddQuestionMenu from '#lib/components/practice/add-question-menu.svelte';
	import { Draft, PassageDraft } from '#lib/components/practice/editor.svelte.js';
	import Segmented from '#lib/components/app/segmented.svelte';
	import ImportDialog from '#lib/components/practice/import-dialog.svelte';
	import PassageEditor from '#lib/components/practice/passage-editor.svelte';
	import QuestionEditor from '#lib/components/practice/question-editor.svelte';
	import QuestionList from '#lib/components/practice/question-list.svelte';
	import type { DeleteTarget } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { postAction } from '#lib/form-actions.js';
	import { ITEM_KINDS } from '#lib/items/kinds.js';
	import { ITEM_TYPES, type ItemType } from '#lib/items/payload.js';
	import { validateItem } from '#lib/items/schema.js';
	import { practiceStagePath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { blankPassage, validatePassage } from '#lib/passage.js';
	import type { QuestionOrder, StageQuestion } from '#lib/server/practice.js';
	import type { PageProps } from './$types';

	/**
	 * One stage: its questions and passages listed on the left, the open one
	 * edited on the right. The list saves a drag at once. The editor works on a
	 * draft, which Save writes and Revert throws away.
	 *
	 * What is open is in the address: `?q=<id>` for a stored question and
	 * `?p=<id>` for a stored passage; `?new=<type>` for a question not saved yet
	 * (with `&passage=<id>` for one on a passage) and `?new=passage` for a
	 * passage not saved yet. With none of them, the first question is opened.
	 */
	let { data, params }: PageProps = $props();

	const stage = $derived(data.stage);
	const here = $derived(resolve(practiceStagePath(params.subjectId, params.stageId)));

	/** Every stored question, a passage's among the rest, each with the passage it is on. */
	const questions = $derived(
		stage.entries.flatMap((entry): (StageQuestion & { passageId: string | null })[] =>
			entry.kind === 'passage'
				? entry.questions.map((question) => ({ ...question, passageId: entry.id }))
				: [{ ...entry, passageId: null }]
		)
	);

	/** Every stored passage, each with its questions. */
	const passages = $derived(stage.entries.filter((entry) => entry.kind === 'passage'));

	/**
	 * A question not saved yet whose type was just changed, on its way to the
	 * address that names its new type: it is opened there as it is, where a
	 * blank one of that type would otherwise be made.
	 */
	let carried: Draft | null = null;

	/**
	 * What the address asks for. `search` is the address of what is stored,
	 * which the page's own address is made to be; `draft` makes its working copy.
	 */
	const open = $derived.by(
		(): { key: string; search?: string; draft: () => Draft | PassageDraft } | null => {
			const search = page.url.searchParams;
			if (search.get('new') === 'passage') {
				return {
					key: 'new:passage',
					draft: () => new PassageDraft({ id: null, content: blankPassage() }, stage.imageBase)
				};
			}
			const type = ITEM_TYPES.find((each) => each === search.get('new'));
			if (type) {
				// A passage that is not in the stage is none: the question then stands alone.
				const passageId = passages.find((each) => each.id === search.get('passage'))?.id ?? null;
				return {
					key: `new:${type}:${passageId}`,
					draft: () =>
						carried?.payload.type === type && carried.passageId === passageId
							? carried
							: new Draft(
									{
										id: null,
										passageId,
										difficulty: 'medium',
										payload: ITEM_KINDS[type].blank(),
										learningPoints: []
									},
									stage.imageBase
								)
				};
			}
			let question = questions.find((each) => each.id === search.get('q'));
			let passage = question ? undefined : passages.find((each) => each.id === search.get('p'));
			if (!question && !passage) {
				// An id that is not in the stage, such as a deleted row's, opens the first question
				// too. A stage with no question may still have a passage waiting for its first.
				question = questions[0];
				passage = question ? undefined : passages[0];
			}
			if (passage) {
				return {
					key: `p:${passage.id}`,
					search: `?p=${passage.id}`,
					draft: () =>
						new PassageDraft(
							{
								id: passage.id,
								content: {
									title: passage.title,
									body: passage.body,
									image_path: passage.imagePath
								}
							},
							stage.imageBase
						)
				};
			}
			if (!question) return null;
			return {
				key: `q:${question.id}`,
				search: `?q=${question.id}`,
				draft: () => new Draft(question, stage.imageBase)
			};
		}
	);
	const openKey = $derived(open?.key);

	/** Counts the times the draft was thrown away for a fresh copy: after Save and on Revert. */
	let reseeded = $state(0);

	/**
	 * The working copy of the open question or passage. It is made again when
	 * another is opened and when asked to be, and not when the page's data merely
	 * loads again: a drag in the list must not wipe what is being typed.
	 */
	let draft = $derived.by(() => {
		void reseeded;
		if (openKey === undefined) return null;
		return untrack(() => open?.draft() ?? null);
	});

	/** The passage the open question is on, as stored. */
	const passage = $derived.by(() => {
		const passageId = draft?.kind === 'question' ? draft.passageId : null;
		return passages.find((each) => each.id === passageId) ?? null;
	});

	/** The open passage's questions as stored, and the number the first of them has in the stage. */
	const onPassage = $derived.by(() => {
		const passageId = draft?.kind === 'passage' ? draft.id : null;
		return {
			questions: passages.find((each) => each.id === passageId)?.questions ?? [],
			first: questions.findIndex((each) => each.passageId === passageId) + 1
		};
	});

	// A question not saved yet is named in the address by its type. When its type is changed
	// the address follows, so that a reload opens the type that was chosen.
	$effect(() => {
		if (draft?.kind !== 'question' || draft.id !== null) return;
		const { type } = draft.payload;
		if (page.url.searchParams.get('new') === type) return;
		const unsaved = draft;
		untrack(() => {
			carried = unsaved;
			staying = true;
			pass(newSearch(type, unsaved.passageId), { replace: true });
		});
	});

	// A draft that is replaced lets go of the pictures picked for it.
	$effect(() => {
		const held = draft?.uploads;
		return () => held?.clear();
	});

	let search = $state('');

	// The switch follows a press at once and goes back to what is stored when the page reloads.
	let order = $derived(stage.questionOrder);

	async function setOrder(next: QuestionOrder) {
		order = next;
		const form = new FormData();
		form.set('order', next);
		// A switch that was not saved goes back to what is stored, so it never looks saved.
		if (!(await settle(await postAction('?/order', form)))) order = stage.questionOrder;
	}

	let editor = $state<{ scrollToTop: () => void }>();
	let saving = $state(false);

	/** Set for a navigation the page makes itself, which must not ask about unsaved changes. */
	let passing = false;
	/** Set when the open question stays the same one, so its form is left where it is. */
	let staying = false;

	/** Goes to an address of this stage without asking, leaving scroll and focus alone. */
	async function pass(search: string, options: { replace?: boolean; refreshAll?: boolean } = {}) {
		passing = true;
		await goto(here + search, { ...options, reset: false });
	}

	/**
	 * Posts a draft to the action that stores it. A new row then has an id, and
	 * the address takes it in place of `?new=`; a changed one gets a fresh draft
	 * of what is now stored.
	 */
	async function post(action: string, form: FormData, address: (id: string) => string) {
		if (!draft) return;
		saving = true;
		// Whatever becomes of the Save, the button is given back: a Save that failed is tried again.
		try {
			const result = await postAction(action, form);
			// A refusal names the row too when the row itself was written and only what follows was not.
			const id =
				result.type === 'success' || result.type === 'failure' ? result.data?.id : undefined;
			if (draft.id === null && typeof id === 'string') {
				if (result.type === 'failure') toast.error(String(result.data?.message));
				staying = true;
				await pass(address(id), { replace: true, refreshAll: true });
			} else if (await settle(result)) {
				reseeded += 1;
			}
		} finally {
			saving = false;
		}
	}

	async function save() {
		if (!draft || saving) return;
		draft.checked = true;
		const form = new FormData();
		if (draft.id) form.set('id', draft.id);

		if (draft.kind === 'passage') {
			const checked = validatePassage($state.snapshot(draft.content));
			if (!checked.ok) return;
			form.set('passage', JSON.stringify(checked.content));
			for (const [key, file] of draft.uploads.filesOf(checked.content)) form.set(key, file);
			await post('?/savePassage', form, (id) => `?p=${id}`);
			return;
		}

		const checked = validateItem($state.snapshot(draft.payload));
		if (!checked.ok) {
			// A refusal no field shows is one the editor cannot have made; it is said out loud.
			if (checked.issues.some((issue) => issue.message === m.item_invalid())) {
				toast.error(m.item_invalid());
			}
			return;
		}
		if (draft.passageId) form.set('passageId', draft.passageId);
		form.set('difficulty', draft.difficulty);
		form.set('payload', JSON.stringify(checked.payload));
		for (const point of draft.learningPoints) form.append('learningPoints', point.id);
		for (const [key, file] of draft.uploads.filesOf(checked.payload)) form.set(key, file);
		await post('?/save', form, (id) => `?q=${id}`);
	}

	async function duplicate() {
		if (draft?.kind !== 'question' || !draft.id) return;
		const form = new FormData();
		form.set('kind', 'question');
		form.set('id', draft.id);
		const result = await postAction('?/duplicate', form);
		if (result.type === 'success' && typeof result.data?.id === 'string') {
			await pass(`?q=${result.data.id}`, { refreshAll: true });
		} else {
			await settle(result);
		}
	}

	let deleteDialog = $state<{ request: (target: DeleteTarget) => void }>();

	function remove() {
		if (!draft) return;
		if (draft.id !== null) {
			deleteDialog?.request({ kind: draft.kind, id: draft.id });
			return;
		}
		// What is not saved yet is only in the page: leaving it is all there is to delete. A
		// question that was being added to a passage goes back to the passage.
		const back = draft.kind === 'question' && draft.passageId ? `?p=${draft.passageId}` : '';
		goto(here + back, { reset: false });
	}

	/** How many questions go with a passage that is about to be deleted. */
	const questionsOn = (passageId: string) =>
		passages.find((each) => each.id === passageId)?.questions.length ?? 0;

	/** Where the person was going when they were asked about unsaved changes. */
	let leaving = $state<{ url: URL; delta?: number } | null>(null);

	beforeNavigate((navigation) => {
		if (passing || !draft?.dirty) return;
		// For a navigation that unloads the page, cancelling is what brings up the browser's own prompt.
		navigation.cancel();
		if (navigation.type !== 'leave' && navigation.to) {
			leaving = {
				url: navigation.to.url,
				delta: navigation.type === 'popstate' ? navigation.delta : undefined
			};
		}
	});

	afterNavigate(() => {
		passing = false;
		carried = null;
		if (!staying) editor?.scrollToTop();
		staying = false;

		// The address is made to name what is open. Left to mean "the first one", it would
		// open another question, and drop the draft, when the list is put in a new order.
		if (open?.search && page.url.search !== open.search) {
			staying = true;
			pass(open.search, { replace: true });
		}
	});

	function discard() {
		const target = leaving;
		leaving = null;
		if (!target) return;
		passing = true;
		// Back and Forward are taken again as such, so the history is left as it was.
		if (target.delta) history.go(target.delta);
		else goto(target.url);
	}

	/** Whether the import dialog is there. It is mounted for each import, to start afresh. */
	let importing = $state(false);

	/**
	 * Shows what an import added. The list is loaded again where the page
	 * stands: the open draft and its place are left alone, and a stage that was
	 * empty opens its first question, which the address then names.
	 */
	async function imported() {
		staying = true;
		await pass(page.url.search, { replace: true, refreshAll: true });
	}

	const questionHref = (questionId: string) => `${here}?q=${questionId}`;
	const passageHref = (passageId: string) => `${here}?p=${passageId}`;

	/** The address of a question of a type that is not saved yet, on a passage or on none. */
	const newSearch = (type: ItemType, passageId: string | null) =>
		`?new=${type}${passageId ? `&passage=${passageId}` : ''}`;

	/** Opens something new to write. It is a navigation like any other, so unsaved work is asked about. */
	const start = (search: string) => goto(here + search, { reset: false });

	const orders = [
		{ value: 'fixed', label: m.practice_order_fixed() },
		{ value: 'random', label: m.practice_order_random() }
	] as const;
</script>

<PageToolbar>
	<InputGroup.Root class="me-auto min-w-40 flex-1 sm:max-w-80">
		<InputGroup.Addon>
			<SearchIcon />
		</InputGroup.Addon>
		<InputGroup.Input
			bind:value={search}
			type="search"
			aria-label={m.practice_search()}
			placeholder={m.practice_search()}
		/>
	</InputGroup.Root>
	<Segmented bind:value={() => order, setOrder} options={orders} label={m.practice_order_label()} />
	<Button variant="outline" onclick={() => (importing = true)}>
		<UploadIcon data-icon="inline-start" />
		{m.practice_import()}
	</Button>
	<AddQuestionMenu
		onpick={(type) => start(newSearch(type, null))}
		onpassage={() => start('?new=passage')}
	/>
</PageToolbar>

<!--
	On a wide screen the two panes share the height that is left and each scrolls on its own, so
	the list stays in view beside a long form and Save stays in view under it. `basis-0` is what
	lets the page be no taller than the window. On a narrower screen the editor follows the list,
	which is kept short enough for the editor to begin in view.
-->
<div class="flex flex-col gap-6 xl:min-h-0 xl:grow xl:basis-0 xl:flex-row">
	<QuestionList
		stageId={stage.id}
		entries={stage.entries}
		{order}
		query={search}
		{draft}
		{questionHref}
		{passageHref}
		class="max-h-80 xl:max-h-none xl:w-80 xl:shrink-0"
	/>

	{#if draft?.kind === 'passage'}
		<PassageEditor
			bind:this={editor}
			bind:draft
			questions={onPassage.questions}
			first={onPassage.first}
			{questionHref}
			{saving}
			onsave={save}
			onrevert={() => (reseeded += 1)}
			ondelete={remove}
			onadd={(type) => start(newSearch(type, draft?.id ?? null))}
			class="min-w-0 flex-1 xl:min-h-0"
		/>
	{:else if draft}
		<QuestionEditor
			bind:this={editor}
			bind:draft
			passage={passage && { ...passage, href: passageHref(passage.id) }}
			learningPoints={stage.learningPoints}
			{saving}
			onsave={save}
			onrevert={() => (reseeded += 1)}
			onduplicate={duplicate}
			ondelete={remove}
			class="min-w-0 flex-1 xl:min-h-0"
		/>
	{:else}
		<Empty.Root class="flex-1">
			<Empty.Header>
				<Empty.Media variant="icon">
					<ListChecksIcon />
				</Empty.Media>
				<Empty.Title>{m.practice_no_questions_yet()}</Empty.Title>
				<Empty.Description>{m.practice_stage_empty_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>

{#if importing}
	<ImportDialog stage={stage.name} onimported={imported} onclosed={() => (importing = false)} />
{/if}

<DeleteDialog
	bind:this={deleteDialog}
	title={(target: DeleteTarget) =>
		target.kind === 'passage'
			? m.practice_delete_passage_title()
			: m.practice_delete_question_title()}
	description={(target) => {
		if (target.kind !== 'passage') return m.practice_delete_question_description();
		const count = questionsOn(target.id);
		return count > 0
			? m.practice_delete_passage_description({ count })
			: m.practice_delete_passage_empty();
	}}
	ondeleted={() => pass('', { replace: true })}
/>

<AlertDialog.Root bind:open={() => leaving !== null, (shown) => !shown && (leaving = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.practice_leave_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{draft?.kind === 'passage'
					? m.practice_leave_passage_description()
					: m.practice_leave_description()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.practice_leave_stay()}</AlertDialog.Cancel>
			<Button onclick={discard}>{m.practice_leave_discard()}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
