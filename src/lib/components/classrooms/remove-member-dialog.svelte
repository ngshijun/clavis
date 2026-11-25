<script lang="ts">
	import { enhance } from '$app/forms';
	import { settle } from '#lib/components/rows/feedback.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom, MemberKind } from '#lib/server/classrooms.js';

	/**
	 * Asks before someone is taken off one of a classroom's two lists, and
	 * says what goes with them. The page it is on answers with the form
	 * action `remove`.
	 */
	let {
		open = $bindable(),
		kind,
		member,
		classroom
	}: {
		open: boolean;
		kind: MemberKind;
		/** Who is being taken off. */
		member: { id: string; name: string } | undefined;
		classroom: Classroom;
	} = $props();

	let saving = $state(false);
</script>

<AlertDialog.Root bind:open>
	<!-- It opens with the focus on Cancel, as every alert does: nobody leaves a classroom by one Return. -->
	<AlertDialog.Content>
		{#if member}
			<AlertDialog.Header>
				<AlertDialog.Title>
					{m.members_remove_title({ name: member.name, classroom: classroom.name })}
				</AlertDialog.Title>
				<AlertDialog.Description>
					{kind === 'students'
						? m.members_remove_student_description()
						: m.members_remove_teacher_description()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<!-- The page without them is the report, so only a refusal is said. -->
			<form
				method="POST"
				action="?/remove"
				use:enhance={() => {
					saving = true;
					return async ({ result }) => {
						try {
							await settle(result);
						} finally {
							saving = false;
							open = false;
						}
					};
				}}
			>
				<input type="hidden" name="id" value={member.id} />
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button" disabled={saving}>
						{m.action_cancel()}
					</AlertDialog.Cancel>
					<!-- Asked for by name and confirmed here, so the plain default button rather than a red one. -->
					<Button type="submit" disabled={saving}>
						{#if saving}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.action_remove()}
					</Button>
				</AlertDialog.Footer>
			</form>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
