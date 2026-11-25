<script lang="ts">
	import Overview from '#lib/components/staff/overview.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Overview role="teacher" {data} />
