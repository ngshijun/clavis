<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';

	/** One number with its name. */
	let { label, value }: { label: string; value: number } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Description>{label}</Card.Description>
		<Card.Title class="text-3xl tabular-nums">{value}</Card.Title>
	</Card.Header>
</Card.Root>
