<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { Button, type ButtonSize } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * The way back from a page that is opened from several places, such as a
	 * finished practice: to the page the person came from. Opened on its own,
	 * from a bookmark or a reload, the page has nowhere it came from, and the
	 * button is then a link to the page above it, which it names.
	 */
	let {
		href,
		label,
		size
	}: {
		/** The page above this one. */
		href: string;
		/** What the link to it says: "Back to Practice". */
		label: string;
		size?: ButtonSize;
	} = $props();

	/** Whether this page was reached from another page of the app. */
	let arrived = $state(false);
	afterNavigate(({ from }) => (arrived = from !== null));
</script>

{#if arrived}
	<Button variant="outline" {size} onclick={() => history.back()}>{m.action_back()}</Button>
{:else}
	<Button variant="outline" {size} {href}>{label}</Button>
{/if}
