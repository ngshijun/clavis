<script lang="ts">
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getRequestDelete, type NamedRow } from './context.js';

	/**
	 * A row's delete button. With a mouse it shows only on the row being pointed
	 * at, so a page of a hundred rows is not a page of a hundred bins; on a touch
	 * screen, and whenever it has the keyboard's focus, it is always there.
	 */
	let { target }: { target: NamedRow } = $props();

	const requestDelete = getRequestDelete();
</script>

<IconButton
	variant="destructive"
	label={m.action_delete()}
	class="shrink-0 rounded-lg focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100"
	onclick={() => requestDelete(target)}
>
	<Trash2Icon />
</IconButton>
