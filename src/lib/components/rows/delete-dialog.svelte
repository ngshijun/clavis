<script lang="ts" generics="Target extends DeleteTarget">
	import { enhance } from '$app/forms';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { DeleteTarget } from './context.js';
	import { settle } from './feedback.js';

	/**
	 * The page's one confirmation for deleting a row. The page hands `request`
	 * to its rows (`setRequestDelete`), and this posts the row's kind and id to
	 * the page's `delete` action once the person has confirmed.
	 */
	let {
		title,
		description,
		ondeleted
	}: {
		/** What is asked: "Delete Year 4 Science?" */
		title: (target: Target) => string;
		/** What goes with the row, and what would stop the delete. */
		description: (target: Target) => string;
		ondeleted?: (target: Target) => void;
	} = $props();

	// The row stays named while the dialog closes, so its words do not vanish mid-animation.
	let target = $state<Target>();
	let open = $state(false);
	let pending = $state(false);

	export function request(next: Target) {
		target = next;
		open = true;
	}
</script>

<AlertDialog.Root bind:open>
	<!-- It opens with the focus on Cancel, as every alert does: a delete is never one Return away. -->
	<AlertDialog.Content>
		{#if target}
			{@const row = target}
			<AlertDialog.Header>
				<AlertDialog.Title>{title(row)}</AlertDialog.Title>
				<AlertDialog.Description>{description(row)}</AlertDialog.Description>
			</AlertDialog.Header>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					pending = true;
					return async ({ result }) => {
						try {
							if (await settle(result)) ondeleted?.(row);
						} finally {
							pending = false;
							open = false;
						}
					};
				}}
			>
				<input type="hidden" name="kind" value={row.kind} />
				<input type="hidden" name="id" value={row.id} />
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button" disabled={pending}>
						{m.action_cancel()}
					</AlertDialog.Cancel>
					<!-- Asked for by name and confirmed here, so the plain default button rather than a red one. -->
					<Button type="submit" disabled={pending}>
						{#if pending}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.action_delete()}
					</Button>
				</AlertDialog.Footer>
			</form>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
