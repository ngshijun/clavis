<script lang="ts">
	import Practice from '#lib/components/staff/practice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Practice role="teacher" {data} />
