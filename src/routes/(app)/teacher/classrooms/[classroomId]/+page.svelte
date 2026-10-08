<script lang="ts">
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const counts = $derived(data.classroom.counts);
</script>

{#if counts}
	<StatStrip
		stats={[
			{ label: m.section_students(), value: counts.students },
			{ label: m.stat_teachers(), value: counts.teachers }
		]}
	/>
{/if}
