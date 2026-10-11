<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '#lib/components/ui/button/index.js';

	/** Adds a row to a list in a form: an option, a pair, an item. It sits under the rows. */
	let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<!-- A block of its own, so the button keeps its width in a column that stretches its children. -->
<div>
	<Button variant="ghost" size="sm" {onclick}>
		<PlusIcon data-icon="inline-start" />
		{label}
	</Button>
</div>
