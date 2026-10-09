/**
 * The looks the builder's forms share, so fourteen types read
 * as one hand. They are class lists for plain elements; where a shadcn
 * component exists for the part (a button, a field, a select), use that.
 */

/** The small line under a label, or under a control it explains. */
export const hint = 'text-xs text-muted-foreground';

/** A list of rows in a form, each a control with what belongs to it. */
export const rows = 'flex flex-col gap-1.5';

/** A chip: one word or phrase in a row of them. Set them in `chips`. */
export const chips = 'flex flex-wrap items-center gap-1.5';

const chipBase =
	'inline-flex h-7 max-w-full items-center gap-1 rounded-4xl px-2.5 text-sm font-medium whitespace-nowrap';

export const chip = {
	/** A word that is there but is not an answer: an extra word, a chip to move. */
	plain: `${chipBase} bg-secondary text-secondary-foreground`,
	/** An answer, or a chip the pupil has placed. */
	key: `${chipBase} bg-accent text-accent-foreground`,
	/** An empty place for a chip: where one is added in a form. */
	dashed: `${chipBase} border border-dashed border-border-strong/60 text-muted-foreground`
};

/** A round number that names a row: a blank, a label, a place in an order. */
export const number =
	'flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground';

/** The same, for a number that is also on a picture or marks the row as the open one. */
export const numberOn =
	'flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground';
