/**
 * The looks the answer components share, so fourteen types read as one hand.
 * They are class lists for plain elements and for the layout of `ui/`
 * components; where a `ui/` component exists for the part, that is used.
 */

/** A line that tells the pupil what to do. Words stand further in than boxes, clear of a corner's curve. */
export const hint = 'px-2 text-xs text-muted-foreground';

/** The parts of one answer area, stacked. */
export const column = 'flex flex-col gap-2';

/**
 * A choice to pick or a row to move: a white box the full width. It is laid
 * over a toggle or a button, whose own height, shape and nowrap it replaces.
 */
export const option =
	'h-auto min-h-11 w-full justify-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-start text-sm font-normal whitespace-normal hover:bg-card disabled:opacity-100 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground';

/** The letter or number that leads an option. Add `rounded-full` or `rounded-sm`. */
export const badge =
	'flex size-6 shrink-0 items-center justify-center bg-secondary text-xs font-semibold text-secondary-foreground';

/** A round number that names a part: a blank, a label, a pair. */
export const number =
	'flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground';

/** A row of words to pick up. */
export const chips = 'flex flex-wrap items-center gap-1.5';

/** A word to pick up, laid over a button. */
export const chip = 'h-8 max-w-full rounded-4xl px-3 text-sm font-medium';

/** A place a word is put: empty it is dashed, filled it holds the word. Laid over a button. */
export const slot =
	'h-8 min-w-16 rounded-4xl border border-dashed border-border-strong bg-card px-3 text-sm font-medium disabled:opacity-100 data-[filled]:border-solid data-[filled]:border-transparent data-[filled]:bg-accent data-[filled]:text-accent-foreground data-[active]:border-solid data-[active]:border-primary';

/** An area things are put into: a sentence being built, a group. */
export const zone =
	'flex min-h-12 flex-wrap content-start items-start gap-1.5 rounded-lg border border-dashed border-border-strong bg-card p-2';

/** Running text with blanks in it: tall lines, so the blanks do not touch. */
export const text = 'px-2 text-base leading-10 wrap-break-word whitespace-pre-line';

/** A box for one number or one letter. */
export const cell = 'w-15 shrink-0 px-0 text-center';

/**
 * A part of an answer as it was marked: green and right, or red and wrong.
 * Laid over whatever shows the part, and over what that says of itself
 * (picked, filled, pressed), which is why each class insists.
 */
export const marked = {
	right: 'border-success! bg-success/10! text-foreground! opacity-100!',
	wrong: 'border-destructive! bg-destructive/10! text-foreground! opacity-100!'
};

/** The numbers of a run's questions, as tiles to go to one by. */
export const tiles = 'grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5';

/** One question's number among them. Laid over a button. */
export const tile = 'relative h-10 w-full rounded-lg px-0 text-sm font-bold tabular-nums';
