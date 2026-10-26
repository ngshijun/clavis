<script lang="ts">
	import Play from '#lib/components/runner/play.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/** A stage being practised: every question in turn, then the marks and the tips. */
	let { data }: PageProps = $props();
</script>

<Play run={data.run} imageBase={data.imageBase} action="?/submit">
	{#snippet more()}
		<Button href={data.practice}>{m.run_back_to_practice()}</Button>
	{/snippet}
</Play>
