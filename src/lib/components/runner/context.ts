import { createContext } from 'svelte';

/** What an answer component asks of whatever it is drawn in. */
export interface Runner {
	/** The URL to show a picture from; undefined when there is none. */
	imageUrl(path: string | null | undefined): string | undefined;
}

export const [getRunner, setRunner] = createContext<Runner>();
