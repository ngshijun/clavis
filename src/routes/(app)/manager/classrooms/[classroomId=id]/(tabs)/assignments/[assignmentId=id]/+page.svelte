<script lang="ts">
	import Assignment from '#lib/components/staff/assignment.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Assignment role="manager" {data} />
