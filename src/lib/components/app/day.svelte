<script lang="ts">
	import { onMount } from 'svelte';
	import { dayOf, timeOf } from '#lib/dates.js';

	/**
	 * The day a moment falls on, as words on a page. The server does not know
	 * where the reader is, and so not which day it is for them: the words are
	 * written once the page is in their browser.
	 */
	let {
		at,
		time = false,
		say = (day) => day,
		class: className
	}: {
		at: string;
		/** Whether the time of day is said too. */
		time?: boolean;
		/** The sentence the day is part of, when it is not said alone. */
		say?: (day: string) => string;
		class?: string;
	} = $props();

	let here = $state(false);
	onMount(() => {
		here = true;
	});

	const words = $derived.by(() => {
		const moment = new Date(at);
		return say(time ? `${dayOf(moment)}, ${timeOf(moment)}` : dayOf(moment));
	});
</script>

<!-- Until then it holds its place, so nothing beside it moves when the words come. -->
<time datetime={at} class={className}>{here ? words : ' '}</time>
