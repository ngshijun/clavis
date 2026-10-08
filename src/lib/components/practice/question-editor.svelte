<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { setRunner } from '#lib/components/runner/context.js';
	import PassageView from '#lib/components/runner/passage-view.svelte';
	import QuestionView from '#lib/components/runner/question-view.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import {
		DIFFICULTY_LABELS,
		hasTip,
		ITEM_KINDS,
		KIND_GROUP_LABELS,
		KIND_GROUPS
	} from '#lib/items/kinds.js';
	import { DIFFICULTIES, ITEM_TYPES, type ItemType } from '#lib/items/payload.js';
	import { serveItem } from '#lib/items/serve.js';
	import type { ItemResponse } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LearningPoint, StagePassage } from '#lib/server/practice.js';
	import EditorCard from './editor-card.svelte';
	import { editorOf, setEditor, type Draft } from './editor.svelte.js';
	import FormField from './fields/form-field.svelte';
	import Issue from './fields/issue.svelte';
	import PictureField from './fields/picture-field.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { formOf } from './forms/index.js';
	import LearningPoints from './learning-points.svelte';
	import PassageIcon from './passage-icon.svelte';
	import { hint } from './styles.js';

	/**
	 * The open question: what every type has (its type, difficulty, question,
	 * picture, tip and learning points) around the type's own form, beside a
	 * picture of what a pupil gets. It edits a draft; the page saves it.
	 */
	let {
		draft = $bindable(),
		passage,
		learningPoints,
		saving,
		onsave,
		onrevert,
		onduplicate,
		ondelete,
		class: className
	}: {
		/** Bound, because the forms inside change it in place. */
		draft: Draft;
		/** The passage the question is on, as stored, and the address that opens it. */
		passage: (Pick<StagePassage, 'title' | 'body' | 'imagePath'> & { href: string }) | null;
		/** The learning points of the stage's topic, which the question's are chosen from. */
		learningPoints: LearningPoint[];
		/** Whether a Save is on its way. */
		saving: boolean;
		onsave: () => void;
		onrevert: () => void;
		onduplicate: () => void;
		ondelete: () => void;
		class?: string;
	} = $props();

	const editor = editorOf(() => draft);
	setEditor(editor);

	const id = $props.id();
	const type = $derived(draft.payload.type);
	const Form = $derived(formOf(type));
	// The pupil view is the real thing: the components a pupil answers in, fed the draft as a
	// pupil would get it. It can be tried, and what is tried there goes nowhere.
	setRunner({ imageUrl: editor.imageUrl });
	const served = $derived(serveItem(draft.payload));
	let tried = $state<ItemResponse>({});

	const difficulties = DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value]() }));

	let card = $state<EditorCard>();

	/** Puts the form back at its top, for when another question is opened. */
	export function scrollToTop() {
		card?.scrollToTop();
	}
</script>

<EditorCard bind:this={card} {draft} {saving} {onsave} {onrevert} class={className}>
	{#snippet head()}
		<Select.Root type="single" bind:value={() => type, (next) => draft.setType(next as ItemType)}>
			<Select.Trigger aria-label={m.practice_type_label()} class="font-medium">
				{ITEM_KINDS[type].label()}
			</Select.Trigger>
			<Select.Content>
				{#each KIND_GROUPS as group (group)}
					<Select.Group>
						<Select.GroupHeading>{KIND_GROUP_LABELS[group]()}</Select.GroupHeading>
						{#each ITEM_TYPES.filter((each) => ITEM_KINDS[each].group === group) as each (each)}
							<Select.Item value={each} label={ITEM_KINDS[each].label()} />
						{/each}
					</Select.Group>
				{/each}
			</Select.Content>
		</Select.Root>
		<!--
			In a card too narrow for the three in a row, the difficulty takes a row of its own
			under the other two, so that More keeps its corner whatever the type is called.
		-->
		<div class="order-last basis-full @lg:order-none @lg:basis-auto">
			<Segmented
				bind:value={draft.difficulty}
				options={difficulties}
				label={m.practice_difficulty_label()}
			/>
		</div>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<IconButton variant="ghost" label={m.action_more()} class="ms-auto" {...props}>
						<EllipsisIcon />
					</IconButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Group>
					<!-- The copy is of what is stored, so there is none to make of unsaved work. -->
					<DropdownMenu.Item disabled={draft.id === null || draft.dirty} onSelect={onduplicate}>
						<CopyIcon />
						{m.practice_duplicate()}
					</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onSelect={ondelete}>
						<Trash2Icon />
						{m.menu_delete()}
					</DropdownMenu.Item>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}

	{#snippet form()}
		{#if passage}
			<!-- A question on a passage says so first, and the passage is one press away. -->
			<div class="flex items-center gap-2 rounded-xl border p-2.5">
				<PassageIcon />
				<span class="grid min-w-0 flex-1 leading-snug">
					<span class={hint}>{m.practice_on_passage()}</span>
					<span class="truncate font-semibold">{passage.title}</span>
				</span>
				<Button variant="ghost" size="sm" href={passage.href} data-sveltekit-reset={false}>
					{m.practice_open_passage()}
				</Button>
			</div>
		{/if}

		<FormField label={m.practice_question()} for="{id}-question">
			<Textarea
				id="{id}-question"
				bind:value={() => draft.payload.question ?? '', (text) => (draft.payload.question = text)}
				aria-invalid={editor.issue('question') ? true : undefined}
			/>
			<Issue message={editor.issue('question')} />
			<!-- Label a Picture is built on its picture, so its own form holds it. -->
			{#if type !== 'label_picture'}
				<PictureField
					bind:path={() => draft.payload.image_path, (path) => draft.setImage(path ?? undefined)}
					label={m.practice_question_image()}
				/>
			{/if}
		</FormField>

		<Form bind:payload={draft.payload} />

		{#if hasTip(type)}
			<FormField label={m.practice_tip()} for="{id}-tip" error={editor.issue('tip')}>
				<Input
					id="{id}-tip"
					bind:value={
						() => draft.payload.tip ?? '', (tip) => (draft.payload.tip = tip || undefined)
					}
					aria-invalid={editor.issue('tip') ? true : undefined}
				/>
				<p class={hint}>{m.practice_tip_hint()}</p>
			</FormField>
		{/if}

		<LearningPoints bind:chosen={draft.learningPoints} offered={learningPoints} />

		<p class={hint}>{ITEM_KINDS[type].marking()}</p>
	{/snippet}

	{#snippet preview()}
		{#if passage}
			<PassageView
				title={passage.title}
				body={passage.body}
				imageUrl={editor.imageUrl(passage.imagePath)}
			/>
		{/if}
		<!-- Made again when the type changes: an answer to one type means nothing to another. -->
		{#key type}
			<QuestionView item={served} bind:answer={tried} />
		{/key}
	{/snippet}
</EditorCard>
