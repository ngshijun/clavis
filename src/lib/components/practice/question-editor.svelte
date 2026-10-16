<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { setRunner } from '#lib/components/runner/context.js';
	import PassageView from '#lib/components/runner/passage-view.svelte';
	import QuestionView from '#lib/components/runner/question-view.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
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
	import PicturedTextarea from './fields/pictured-textarea.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { formOf } from './forms/index.js';
	import { KIND_ICONS } from './kind-icons.js';
	import LearningPoints from './learning-points.svelte';
	import PassageIcon from './passage-icon.svelte';
	import { group, hint } from './styles.js';

	/**
	 * The open question: what every type has (its type, difficulty, question,
	 * picture, tip and learning points) around the type's own form, beside a
	 * picture of what a pupil gets. It edits a draft; the page saves it.
	 *
	 * The form is three groups with a line between them: what is asked, how it
	 * is answered and marked, and what follows an answer.
	 */
	let {
		draft = $bindable(),
		title,
		passage,
		learningPoints,
		makeLearningPoint,
		saving,
		onsave,
		onrevert,
		onduplicate,
		ondelete,
		class: className
	}: {
		/** Bound, because the forms inside change it in place. */
		draft: Draft;
		/** What the card's head calls the question: "Question 4", or that it is new. */
		title: string;
		/** The passage the question is on, as stored, and the address that opens it. */
		passage: (Pick<StagePassage, 'title' | 'body' | 'imagePath'> & { href: string }) | null;
		/** The learning points of the stage's topic, which the question's are chosen from. */
		learningPoints: LearningPoint[];
		/** Has the topic offer the learning point of a name, and answers with it. */
		makeLearningPoint: (name: string) => Promise<LearningPoint | undefined>;
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
	const TypeIcon = $derived(KIND_ICONS[type]);
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

<EditorCard
	bind:this={card}
	{draft}
	{title}
	{saving}
	{onsave}
	{onrevert}
	previewHint={m.practice_pupil_view_try()}
	class={className}
>
	{#snippet actions()}
		<!-- The copy is of what is stored, so there is none to make of unsaved work. -->
		<IconButton
			variant="ghost"
			label={m.practice_duplicate()}
			disabled={draft.id === null || draft.dirty}
			onclick={onduplicate}
		>
			<CopyIcon />
		</IconButton>
		<IconButton variant="destructive" label={m.action_delete()} onclick={ondelete}>
			<Trash2Icon />
		</IconButton>
	{/snippet}

	{#snippet form()}
		<div class={group}>
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

			<!-- Each is as wide as its control, so the two share a row where there is room. -->
			<div class="flex flex-wrap gap-x-6 gap-y-5">
				<div>
					<FormField label={m.practice_type_label()} for="{id}-type">
						<Select.Root
							type="single"
							bind:value={() => type, (next) => draft.setType(next as ItemType)}
						>
							<Select.Trigger id="{id}-type" class="font-medium">
								<span class="flex items-center gap-2">
									<TypeIcon class="text-muted-foreground" aria-hidden="true" />
									{ITEM_KINDS[type].label()}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each KIND_GROUPS as kindGroup (kindGroup)}
									<Select.Group>
										<Select.GroupHeading>{KIND_GROUP_LABELS[kindGroup]()}</Select.GroupHeading>
										{#each ITEM_TYPES.filter((each) => ITEM_KINDS[each].group === kindGroup) as each (each)}
											{@const Icon = KIND_ICONS[each]}
											<Select.Item value={each} label={ITEM_KINDS[each].label()}>
												<Icon class="text-muted-foreground" aria-hidden="true" />
												{ITEM_KINDS[each].label()}
											</Select.Item>
										{/each}
									</Select.Group>
								{/each}
							</Select.Content>
						</Select.Root>
					</FormField>
				</div>
				<div>
					<FormField label={m.practice_difficulty_label()}>
						<Segmented
							bind:value={draft.difficulty}
							options={difficulties}
							label={m.practice_difficulty_label()}
						/>
					</FormField>
				</div>
			</div>

			<FormField label={m.practice_question()} for="{id}-question" error={editor.issue('question')}>
				<!-- Label a Picture is built on its picture, so its own form holds it. -->
				<PicturedTextarea
					id="{id}-question"
					bind:value={() => draft.payload.question ?? '', (text) => (draft.payload.question = text)}
					bind:path={() => draft.payload.image_path, (path) => draft.setImage(path ?? undefined)}
					pictureLabel={m.practice_question_image()}
					picture={type !== 'label_picture'}
					invalid={editor.issue('question') !== undefined}
				/>
			</FormField>
		</div>

		<Separator />

		<div class={group}>
			<Form bind:payload={draft.payload} />
			<!-- How an answer is marked is said with the fields that set the answer. -->
			<p class={[hint, 'flex items-center gap-1.5']}>
				<InfoIcon class="size-3.5 shrink-0" aria-hidden="true" />
				{ITEM_KINDS[type].marking()}
			</p>
		</div>

		<Separator />

		<div class={group}>
			{#if hasTip(type)}
				<FormField label={m.practice_tip()} for="{id}-tip" error={editor.issue('tip')}>
					<!-- A tip may run to a few lines, so the field grows with it and the light stays by its first. -->
					<InputGroup.Root class="items-start">
						<InputGroup.Addon class="py-2.5">
							<LightbulbIcon />
						</InputGroup.Addon>
						<InputGroup.Textarea
							id="{id}-tip"
							rows={1}
							class="min-h-9 py-2"
							bind:value={
								() => draft.payload.tip ?? '', (tip) => (draft.payload.tip = tip || undefined)
							}
							aria-invalid={editor.issue('tip') ? true : undefined}
						/>
					</InputGroup.Root>
					<p class={hint}>{m.practice_tip_hint()}</p>
				</FormField>
			{/if}

			<LearningPoints
				bind:chosen={draft.learningPoints}
				offered={learningPoints}
				make={makeLearningPoint}
			/>
		</div>
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
