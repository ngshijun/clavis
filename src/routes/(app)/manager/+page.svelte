<script lang="ts">
	import Dashboard from '#lib/components/dashboard/dashboard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Dashboard role="manager" {data} />
