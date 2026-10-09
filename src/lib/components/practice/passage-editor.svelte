<script lang="ts">
	import { flip } from 'svelte/animate';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { dragHandleZone } from 'svelte-dnd-action';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import DragHandle from '#lib/components/rows/drag-handle.svelte';
	import { FLIP_MS, saveOrder } from '#lib/components/rows/reorder.js';
	import PassageView from '#lib/components/runner/passage-view.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { ItemType } from '#lib/items/payload.js';
	import { itemSummary } from '#lib/items/text.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StageQuestion } from '#lib/server/practice.js';
	import { cn } from '#lib/utils.js';
	import AddQuestionMenu from './add-question-menu.svelte';
	import EditorCard from './editor-card.svelte';
	import { editorOf, setEditor, type PassageDraft } from './editor.svelte.js';
	import FormField from './fields/form-field.svelte';
	import Issue from './fields/issue.svelte';
	import PictureField from './fields/picture-field.svelte';
	import QuestionLine from './question-line.svelte';
	import { hint } from './styles.js';

	/**
	 * The open passage: its title, its text and its picture, with the questions
	 * that go with it. The three are a draft, which the page saves. The
	 * questions are not: each is opened and saved as any question is, and
	 * dragging them into order saves the order at once, as in the list.
	 */
	let {
		draft = $bindable(),
		questions,
		first,
		questionHref,
		saving,
		onsave,
		onrevert,
		ondelete,
		onadd,
		class: className
	}: {
		/** Bound, because the fields change it in place. */
		draft: PassageDraft;
		/** The passage's questions as stored, in their order; none for a passage not saved yet. */
		questions: StageQuestion[];
		/** The number its first question has among the stage's questions. */
		first: number;
		/** The address that opens one of its questions. */
		questionHref: (questionId: string) => string;
		/** Whether a Save is on its way. */
		saving: boolean;
		onsave: () => void;
		onrevert: () => void;
		ondelete: () => void;
		/** Starts a question of a type on this passage. */
		onadd: (type: ItemType) => void;
		class?: string;
	} = $props();

	const editor = editorOf(() => draft);
	setEditor(editor);

	const id = $props.id();

	// The order on screen follows a drag at once and goes back to the stored one when the page reloads.
	let rows = $derived(questions);

	let card = $state<EditorCard>();

	/** Puts the form back at its top, for when another passage is opened. */
	export function scrollToTop() {
		card?.scrollToTop();
	}
</script>

<EditorCard bind:this={card} {draft} {saving} {onsave} {onrevert} class={className}>
	{#snippet head()}
		<h2 class="text-lg font-semibold">{m.practice_passage()}</h2>
		<IconButton variant="destructive" label={m.action_delete()} class="ms-auto" onclick={ondelete}>
			<Trash2Icon />
		</IconButton>
	{/snippet}

	{#snippet form()}
		<FormField label={m.practice_passage_title()} for="{id}-title">
			<Input
				id="{id}-title"
				bind:value={draft.content.title}
				aria-invalid={editor.issue('title') ? true : undefined}
			/>
			<Issue message={editor.issue('title')} />
		</FormField>

		<FormField label={m.practice_passage_text()} for="{id}-text">
			<Textarea
				id="{id}-text"
				bind:value={draft.content.body}
				class="min-h-56"
				aria-invalid={editor.issue('body') ? true : undefined}
			/>
			<Issue message={editor.issue('body')} />
			<PictureField
				bind:path={draft.content.image_path}
				label={m.practice_passage_image()}
				invalid={editor.issue('body') !== undefined}
			/>
			<p class={hint}>{m.practice_passage_content_hint()}</p>
		</FormField>

		<FormField label={m.practice_passage_questions()} hint={m.practice_passage_questions_hint()}>
			{#if draft.id === null}
				<!-- Its questions are filed on it by its id, which it gets when it is first saved. -->
				<p class="text-sm text-muted-foreground">{m.practice_passage_save_first()}</p>
			{:else}
				{#if rows.length > 0}
					<div
						class="flex flex-col gap-0.5"
						use:dragHandleZone={{
							items: rows,
							// Not the list's zone of the same questions: a row is not dragged from one to the other.
							type: `passage-editor:${draft.id}`,
							flipDurationMs: FLIP_MS,
							dropTargetStyle: {}
						}}
						onconsider={(event) => (rows = event.detail.items)}
						onfinalize={(event) => {
							rows = event.detail.items;
							if (!draft.id) return;
							saveOrder({ kind: 'passage', parentId: draft.id }, questions, rows).then(
								(saved) => saved || (rows = questions)
							);
						}}
					>
						{#each rows as question, index (question.id)}
							{@const text = itemSummary(question.payload)}
							<!-- Named, so the drag library can say which row is being moved. -->
							<div
								class="flex items-center rounded-xl hover:bg-muted"
								aria-label={text || m.practice_new_question()}
								animate:flip={{ duration: FLIP_MS }}
							>
								<DragHandle label={m.row_reorder({ name: text })} class="ms-1" />
								<a
									href={questionHref(question.id)}
									data-sveltekit-reset={false}
									class="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 ps-1.5 pe-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<QuestionLine
										position={first + index}
										type={question.payload.type}
										difficulty={question.difficulty}
										{text}
									/>
								</a>
							</div>
						{/each}
					</div>
				{/if}
				<div>
					<AddQuestionMenu size="sm" onpick={onadd} />
				</div>
			{/if}
		</FormField>

		<p class={hint}>{m.practice_passage_marking()}</p>
	{/snippet}

	{#snippet preview()}
		<PassageView
			title={draft.content.title}
			body={draft.content.body}
			imageUrl={editor.imageUrl(draft.content.image_path)}
		/>
		{#if questions.length > 0}
			<p class={cn(hint, 'px-2 pb-2')}>
				{m.practice_passage_followed({ count: questions.length })}
			</p>
		{/if}
	{/snippet}
</EditorCard>
