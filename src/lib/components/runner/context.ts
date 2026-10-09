import { createContext } from 'svelte';

/** What an answer component asks of whatever it is drawn in. */
export interface Runner {
	/** The URL to show a picture from; undefined when there is none. */
	imageUrl(path: string | null | undefined): string | undefined;
	/**
	 * Whether the answers drawn are a student's, read by someone else. They
	 * are then not called the reader's own.
	 */
	theirs?: boolean;
}

export const [getRunner, setRunner] = createContext<Runner>();
