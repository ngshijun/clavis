/** A share as a whole percent. A share there is none of is a dash, never 0 % (R9.4). */
export function percent(share: number | null | undefined): string {
	return share === null || share === undefined ? '—' : `${Math.round(share * 100)}%`;
}

/** The colour of a learning point's band, for its bar and its key. */
export const BAND_COLOURS = {
	needs_work: 'bg-destructive',
	getting_there: 'bg-warning',
	secure: 'bg-success'
} as const;
