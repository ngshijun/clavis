/**
 * How long the text of a question or a passage may be, and how many entries a
 * list may hold. The schemas refuse more, in the editor and in an import
 * alike, and the database's own validator keeps the same numbers.
 *
 * A length is counted in characters as a person counts them (code points, as
 * Postgres' `char_length` does), after the text has been trimmed.
 */

/** A question, and the text of a Fill in the Blanks. */
export const MAX_QUESTION_CHARS = 2000;
/** A tip: the question's, or a wrong option's. */
export const MAX_TIP_CHARS = 500;
/**
 * One entry of a list: an option, a row, an item, a group's or a column's
 * name, a label, an accepted answer, a choice, an extra word, a word of a
 * sentence, an answer word of a True or False.
 */
export const MAX_ENTRY_CHARS = 200;
/** A unit of measurement. */
export const MAX_UNIT_CHARS = 20;
/** An id the editor made for an entry, and anything that points at one. */
export const MAX_ID_CHARS = 36;
/** Where a picture is stored, or the `upload:<key>` that stands for one until Save. */
export const MAX_IMAGE_PATH_CHARS = 200;

/** The entries of any one list of a question: options, rows, items, blanks, labels, answers, extra words. */
export const MAX_ENTRIES = 50;
/** The words a Pick Words sentence, or the chips a Sentence Rearrangement, is cut into. */
export const MAX_WORDS = 100;

export const MAX_PASSAGE_TITLE_CHARS = 200;
export const MAX_PASSAGE_BODY_CHARS = 20_000;
