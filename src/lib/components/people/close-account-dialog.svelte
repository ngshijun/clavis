<script lang="ts">
	import { enhance } from '$app/forms';
	import { settle } from '#lib/components/rows/feedback.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Asks before an account is closed, and says what that takes from the
	 * person: their way in, and a teacher's or a student's classrooms. Nothing
	 * they did is deleted, so the account can be opened again. Mounted while it
	 * is needed. The page it is on answers with the form action `setClosed`.
	 */
	let {
		role,
		person,
		onclosed
	}: {
		role: 'student' | 'teacher' | 'manager';
		person: { id: string; name: string };
		onclosed: () => void;
	} = $props();

	const descriptions = {
		student: m.close_account_student_description,
		teacher: m.close_account_teacher_description,
		manager: m.close_account_manager_description
	};

	let open = $state(true);
	let pending = $state(false);
</script>

<AlertDialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<!-- It opens with the focus on Cancel, as every alert does: nobody is shut out by one Return. -->
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.close_account_title({ name: person.name })}</AlertDialog.Title>
			<AlertDialog.Description>{descriptions[role]()}</AlertDialog.Description>
		</AlertDialog.Header>
		<!-- The list without them is the report, so only a refusal is said. -->
		<form
			method="POST"
			action="?/setClosed"
			use:enhance={() => {
				pending = true;
				return async ({ result }) => {
					try {
						await settle(result);
					} finally {
						pending = false;
						open = false;
					}
				};
			}}
		>
			<input type="hidden" name="personId" value={person.id} />
			<input type="hidden" name="closed" value="true" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button" disabled={pending}>
					{m.action_cancel()}
				</AlertDialog.Cancel>
				<!-- Asked for by name and confirmed here, so the plain default button rather than a red one. -->
				<Button type="submit" disabled={pending}>
					{#if pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.close_account_submit()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
