<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { CLOZE_MODE_LABELS } from '#lib/items/kinds.js';
	import { CLOZE_MODES, type ClozeMode, type ClozePayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getEditor } from '../editor.svelte.js';
	import ChipsField from '../fields/chips-field.svelte';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { hint, number, rows } from '../styles.js';
	import { addMark, carry, editOf, fold, markAt, trim, unfold, type Mark } from './cloze-marks.js';

	/**
	 * A Fill in the Blanks question: the text, the words in it that are blanks,
	 * and how pupils fill them.
	 *
	 * The text is written whole, answers included, in an ordinary text field, so
	 * typing, pasting, undo and Chinese input are the browser's own. A blank is a
	 * marked stretch of that text: its words are the blank's answer. The payload
	 * keeps `{{n}}` in their place, and is written again from the text and the
	 * marks at every change.
	 *
	 * The payload holds only what belongs to the way pupils answer now. What was
	 * written for another way (a blank's wrong choices, the word bank's extra
	 * words) is kept here while the question is open, so trying another way and
	 * coming back loses nothing and leaves nothing behind to save.
	 */
	let { payload = $bindable() }: { payload: ClozePayload } = $props();

	const editor = getEditor();
	const id = $props.id();

	const opened = untrack(() => unfold(payload));
	let source = $state(opened.source);
	let marks = $state(opened.marks);
	/** The word bank's extra words, and whether one of its words can be used twice. */
	let extras = $state(untrack(() => payload.distractors ?? []));
	let reuse = $state(untrack(() => payload.reuse ?? false));

	let field = $state<HTMLTextAreaElement | null>(null);
	/** What is selected in the text field. It stays as it was while a button is pressed. */
	let selection = $state({ start: 0, end: 0 });

	/**
	 * The blank whose answer is being typed (its place in `marks`), and where that typing left
	 * the caret. While the caret stays there, what is typed at the blank's end is still its answer.
	 */
	let open = -1;
	let caret = -1;

	function look() {
		if (!field) return;
		selection = { start: field.selectionStart, end: field.selectionEnd };
		if (selection.start !== caret || selection.end !== caret) open = -1;
	}

	const mode = $derived(payload.mode ?? 'typing');

	function write() {
		const { text, blanks } = fold(source, marks, mode);
		payload.text = text;
		payload.blanks = blanks;
		const bank = mode === 'bank';
		payload.distractors = bank && extras.length > 0 ? [...extras] : undefined;
		payload.reuse = bank && reuse ? true : undefined;
	}

	function retype(next: string) {
		caret = field?.selectionEnd ?? next.length;
		({ marks, open } = carry(next, marks, editOf(source, next, caret), open));
		source = next;
		write();
		look();
	}

	// A mark may hold a space at its end while its answer is being typed; the answer does not.
	const answerOf = (mark: Mark) => source.slice(mark.start, mark.end).trim();

	/** The blank the caret is in, which the button then turns back into words. */
	const here = $derived(markAt(marks, selection));
	const selected = $derived(trim(source, selection));

	/** Makes the selected words a blank, or the blank the caret is in words again. */
	function press() {
		look();
		const blank = here;
		const words = selected;
		if (blank) marks = marks.filter((mark) => mark !== blank);
		else if (words) marks = addMark(source, marks, words);
		else return;
		open = -1;
		write();

		// Back to the text, with the caret behind the new blank so that typing goes on after it.
		field?.focus();
		if (words && !blank) field?.setSelectionRange(words.end, words.end);
		look();
	}

	const modes = CLOZE_MODES.map((value) => ({ value, label: CLOZE_MODE_LABELS[value]() }));

	function setMode(next: ClozeMode) {
		// A question without a mode is answered by typing, so that one is not written down.
		payload.mode = next === 'typing' ? undefined : next;
		write();
	}

	/** The bank's answers: each blank's own, once. */
	const answers = $derived(
		marks.map(answerOf).filter((answer, at, all) => all.indexOf(answer) === at)
	);

	/** The first thing wrong at one key of any blank, or with a blank itself. */
	function blankIssue(key?: 'accepted') {
		for (const at of marks.keys()) {
			const message = key ? editor.issue('blanks', at, key) : editor.issue('blanks', at);
			if (message) return message;
		}
	}

	// No blank is made anywhere but in the text, so what is wrong with the blanks is shown there.
	const textError = $derived(editor.issue('text') ?? editor.issue('blanks') ?? blankIssue());

	/** The text field and the layer under it that marks the blanks: the two must set their text alike. */
	const page =
		'col-start-1 row-start-1 border border-transparent px-3 py-2 text-base leading-9 wrap-break-word whitespace-pre-wrap md:text-sm';

	/** The text cut at its marks, for the layer that draws them. */
	const pieces = $derived.by(() => {
		const list: { text: string; blank?: number }[] = [];
		let from = 0;
		marks.forEach((mark, at) => {
			const { start, end } = trim(source, mark) ?? mark;
			list.push(
				{ text: source.slice(from, start) },
				{ text: source.slice(start, end), blank: at + 1 }
			);
			from = end;
		});
		return [...list, { text: source.slice(from) }];
	});
</script>

<FormField label={m.practice_cloze_text()} for="{id}-text">
	<!--
		The field is see-through and lies on a copy of its own text, in which only the blanks are
		drawn: a chip behind each answer and its number at the corner. The copy also gives the two
		their height, so the field grows with the text and never scrolls away from its marks.
	-->
	<div class="grid min-h-16 rounded-2xl bg-input/50">
		<!-- The text keeps its spaces and line breaks here, so none may come from the markup. -->
		<!-- prettier-ignore -->
		<div aria-hidden="true" class={cn(page, 'pointer-events-none text-transparent select-none')}>{#each pieces as piece, at (at)}{#if piece.blank}<span class="relative -mx-0.5 rounded-sm bg-primary/15 px-0.5 py-1"><span class="absolute -top-3.5 -left-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] leading-none font-bold text-primary-foreground">{piece.blank}</span>{piece.text}</span>{:else}{piece.text}{/if}{/each}&#8203;</div>
		<Textarea
			id="{id}-text"
			bind:ref={field}
			bind:value={() => source, retype}
			class={cn(page, 'relative min-h-0 overflow-hidden bg-transparent')}
			placeholder={m.practice_cloze_text_placeholder()}
			aria-describedby="{id}-text-hint"
			aria-invalid={textError ? true : undefined}
			onselectionchange={look}
			onselect={look}
			onkeyup={look}
			onpointerup={look}
			onfocus={look}
		/>
	</div>
	<p id="{id}-text-hint" class={hint}>{m.practice_cloze_text_hint()}</p>
	<div>
		<!-- Dimmed rather than disabled, so the button can be reached with Tab while words are selected. -->
		<Button
			variant="outline"
			size="sm"
			aria-disabled={!here && !selected}
			class="aria-disabled:pointer-events-none aria-disabled:opacity-50"
			onclick={press}
		>
			{here ? m.practice_cloze_remove_blank() : m.practice_cloze_make_blank()}
		</Button>
	</div>
	<Issue message={textError} />
</FormField>

<FormField label={m.practice_answer_mode()}>
	<!-- A block of its own, so the buttons keep their width in a column that stretches its children. -->
	<div>
		<Segmented label={m.practice_answer_mode()} options={modes} bind:value={() => mode, setMode} />
	</div>
</FormField>

{#if mode === 'bank'}
	<FormField
		label={m.practice_cloze_bank()}
		hint={m.practice_cloze_bank_hint()}
		error={blankIssue('accepted') ?? editor.issue('distractors')}
	>
		<ChipsField
			lead={answers}
			tone="plain"
			addLabel={m.practice_extra_word()}
			invalid={editor.issue('distractors') !== undefined}
			bind:values={
				() => extras,
				(list) => {
					extras = list;
					write();
				}
			}
		/>
		<Label class="font-normal">
			<Switch
				size="sm"
				aria-invalid={editor.issue('reuse') ? true : undefined}
				bind:checked={
					() => reuse,
					(on) => {
						reuse = on;
						write();
					}
				}
			/>
			{m.practice_cloze_reuse()}
		</Label>
		<Issue message={editor.issue('reuse')} />
	</FormField>
{:else if marks.length > 0}
	{@const choosing = mode === 'choices'}
	<FormField
		label={choosing ? m.practice_cloze_choices() : m.practice_accepted_answers()}
		hint={choosing ? m.practice_cloze_choices_hint() : m.practice_cloze_accepted_hint()}
	>
		<div class={rows}>
			{#each marks as mark, at (at)}
				{@const error = editor.issue('blanks', at, choosing ? 'choices' : 'accepted')}
				<div class="flex flex-col gap-1">
					<div
						role="group"
						aria-label={m.practice_cloze_blank({ n: at + 1 })}
						class="flex items-start gap-1.5"
					>
						<span class={cn(number, 'mt-0.5')}>{at + 1}</span>
						{#if choosing}
							<!-- The answer is the first choice, so three more make the four a blank may have. -->
							<ChipsField
								lead={[answerOf(mark)]}
								tone="plain"
								max={3}
								addLabel={m.practice_cloze_add_choice()}
								invalid={error !== undefined}
								bind:values={
									() => mark.wrong,
									(list) => {
										mark.wrong = list;
										write();
									}
								}
							/>
						{:else}
							<ChipsField
								lead={[answerOf(mark)]}
								tone="plain"
								addLabel={m.practice_add_answer()}
								invalid={error !== undefined}
								bind:values={
									() => mark.others,
									(list) => {
										mark.others = list;
										write();
									}
								}
							/>
						{/if}
					</div>
					<Issue message={error} />
				</div>
			{/each}
		</div>
	</FormField>
{/if}
