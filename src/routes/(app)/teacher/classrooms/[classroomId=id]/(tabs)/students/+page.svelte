<script lang="ts">
	import Students from '#lib/components/staff/students.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Students role="teacher" {data} />
