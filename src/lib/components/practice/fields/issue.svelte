<script lang="ts">
	import { FieldError } from '#lib/components/ui/field/index.js';

	/**
	 * What is wrong with one field, in a line beside it. Pass what
	 * `editor.issue(...)` returns: nothing is drawn while nothing is wrong.
	 */
	let { message }: { message: string | undefined } = $props();
</script>

{#if message}
	<FieldError class="text-xs">{message}</FieldError>
{/if}
