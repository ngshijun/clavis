<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { settle } from '#lib/components/rows/feedback.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { OrganizationSummary } from '#lib/server/organizations.js';

	/**
	 * The confirmation for deleting an organization, which takes a tuition
	 * center's classrooms, practice and accounts with it. It is the heaviest
	 * delete there is, so it is hedged three ways: it counts what will go, it
	 * opens with the focus on Cancel, and its button stays off until the
	 * organization's name has been typed. The database checks the name again.
	 *
	 * Mounted while it is needed, so every opening starts empty. The page it
	 * is on answers with the form action `delete`, which leads away from it.
	 */
	let {
		organization,
		onclosed
	}: {
		organization: OrganizationSummary;
		onclosed: () => void;
	} = $props();

	let open = $state(true);
	let pending = $state(false);
	let typed = $state('');
</script>

<AlertDialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<!-- It opens with the focus on Cancel, as every alert does: a delete is never one Return away. -->
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{m.organization_delete_title({ name: organization.name })}</AlertDialog.Title
			>
			<AlertDialog.Description>{m.organization_delete_description()}</AlertDialog.Description>
		</AlertDialog.Header>

		<form
			method="POST"
			action="?/delete"
			class="flex flex-col gap-6"
			use:enhance={() => {
				pending = true;
				return async ({ result }) => {
					try {
						if (result.type === 'redirect') {
							toast.success(m.organization_deleted({ name: organization.name }));
						}
						// Deleted, it leads back to the organizations, where it is no longer listed.
						await settle(result);
					} finally {
						pending = false;
						open = false;
					}
				};
			}}
		>
			<div class="flex flex-col gap-2 text-sm">
				<p class="font-medium">{m.organization_delete_goes()}</p>
				<ul class="flex list-disc flex-col gap-1 ps-5 text-muted-foreground">
					<li>
						{m.organization_delete_accounts({
							managers: m.count_managers({ count: organization.managerCount }),
							teachers: m.count_teachers({ count: organization.teacherCount }),
							students: m.count_students({ count: organization.studentCount })
						})}
					</li>
					<li>
						{m.organization_delete_classrooms({
							classrooms: m.count_classrooms({ count: organization.classroomCount })
						})}
					</li>
				</ul>
			</div>

			<Field.Field>
				<Field.FieldLabel for="organization-delete-name">
					{m.organization_delete_confirm()}
				</Field.FieldLabel>
				<Input
					id="organization-delete-name"
					name="name"
					autocomplete="off"
					autocapitalize="none"
					spellcheck={false}
					bind:value={typed}
				/>
			</Field.Field>

			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button" disabled={pending}>
					{m.action_cancel()}
				</AlertDialog.Cancel>
				<Button
					type="submit"
					variant="destructive"
					disabled={pending || typed !== organization.name}
				>
					{#if pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.organization_delete_submit()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
