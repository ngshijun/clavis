<script lang="ts">
	import StatCard from '#lib/components/app/stat-card.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const counts = $derived(data.classroom.counts);
</script>

{#if counts}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<StatCard label={m.section_students()} value={counts.students} />
		<StatCard label={m.stat_teachers()} value={counts.teachers} />
	</div>
{/if}
