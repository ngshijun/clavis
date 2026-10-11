<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import * as Alert from '#lib/components/ui/alert/index.js';

	/**
	 * Why the form of a dialog was not taken, when no field of it is to blame.
	 * It is said in the dialog, above the fields, where the person is looking
	 * and for as long as the dialog is open.
	 */
	let { message }: { message: string | null } = $props();
</script>

{#if message}
	<Alert.Root variant="destructive">
		<CircleAlertIcon />
		<Alert.Description>{message}</Alert.Description>
	</Alert.Root>
{/if}
