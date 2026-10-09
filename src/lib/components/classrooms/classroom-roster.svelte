<script lang="ts">
	import { enhance } from '$app/forms';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UsersIcon from '@lucide/svelte/icons/users';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { initials } from '#lib/initials.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom, MemberKind } from '#lib/server/classrooms.js';
	import MemberPickList, { type PickableMember } from './member-pick-list.svelte';

	/**
	 * One of a classroom's two lists, for the manager who keeps it: who is on
	 * it, a way to take someone off, and a dialog to put more people on. The
	 * page it is on answers with the form actions `add` and `remove`. An
	 * archived classroom's list stands as it was and is only shown.
	 */
	let {
		kind,
		classroom,
		members,
		candidates
	}: {
		kind: MemberKind;
		classroom: Classroom;
		members: PickableMember[];
		/** Everyone of the organization who could be on the list. */
		candidates: PickableMember[];
	} = $props();

	let adding = $state(false);
	let selectedIds = $state<string[]>([]);
	let saving = $state(false);

	const live = $derived(classroom.archivedAt === null);

	const copy = $derived(
		kind === 'students'
			? {
					icon: UsersIcon,
					empty: m.members_no_students(),
					add: m.roster_add_students(),
					title: m.members_add_students(),
					addSelected: m.members_add_selected_students({ count: selectedIds.length }),
					remove: m.members_remove_student(),
					search: m.members_student_search(),
					noneFound: m.members_no_students_found()
				}
			: {
					icon: GraduationCapIcon,
					empty: m.members_no_teachers(),
					add: m.roster_add_teachers(),
					title: m.members_add_teachers(),
					addSelected: m.members_add_selected_teachers({ count: selectedIds.length }),
					remove: m.members_remove_teacher(),
					search: m.members_teacher_search(),
					noneFound: m.members_no_teachers_found()
				}
	);
</script>

{#snippet addButton()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{copy.add}
	</Button>
{/snippet}

{#if members.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<copy.icon />
			</Empty.Media>
			<Empty.Description>{copy.empty}</Empty.Description>
		</Empty.Header>
		{#if live}
			<Empty.Content>{@render addButton()}</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	{#if live}
		<div class="flex justify-end">{@render addButton()}</div>
	{/if}

	<!-- The page's one list, so it stands bare: hairlines between the rows and no box around each. -->
	<Item.Group class="gap-0">
		{#each members as member, index (member.id)}
			{#if index > 0}
				<Item.Separator class="my-0" />
			{/if}
			<Item.Root>
				<Item.Media>
					<Avatar.Root>
						<Avatar.Fallback>{initials(member.name)}</Avatar.Fallback>
					</Avatar.Root>
				</Item.Media>
				<Item.Content class="min-w-0">
					<Item.Title class="truncate">{member.name}</Item.Title>
					{#if member.detail}
						<Item.Description class="truncate">{member.detail}</Item.Description>
					{/if}
				</Item.Content>
				{#if live}
					<Item.Actions>
						<!-- The row leaving the list is the report, so only a refusal is said. -->
						<form
							method="POST"
							action="?/remove"
							use:enhance={() => {
								saving = true;
								return async ({ result }) => {
									await settle(result);
									saving = false;
								};
							}}
						>
							<input type="hidden" name="id" value={member.id} />
							<IconButton type="submit" variant="destructive" disabled={saving} label={copy.remove}>
								<UserMinusIcon />
							</IconButton>
						</form>
					</Item.Actions>
				{/if}
			</Item.Root>
		{/each}
	</Item.Group>
{/if}

<Dialog.Root bind:open={adding} onOpenChangeComplete={(open) => !open && (selectedIds = [])}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{copy.title}</Dialog.Title>
			<Dialog.Description>{m.members_description()}</Dialog.Description>
		</Dialog.Header>

		<MemberPickList
			bind:selectedIds
			members={candidates}
			disabledIds={members.map((member) => member.id)}
			disabledLabel={m.members_already_in()}
			searchPlaceholder={copy.search}
			emptyText={copy.noneFound}
		/>

		<form
			method="POST"
			action="?/add"
			use:enhance={() => {
				saving = true;
				return async ({ result }) => {
					const added = await settle(result);
					saving = false;
					if (added) adding = false;
				};
			}}
		>
			{#each selectedIds as id (id)}
				<input type="hidden" name="ids" value={id} />
			{/each}
			<Dialog.Footer>
				<Button type="button" variant="outline" disabled={saving} onclick={() => (adding = false)}>
					{m.action_cancel()}
				</Button>
				<Button type="submit" disabled={saving || selectedIds.length === 0}>
					{#if saving}
						<Spinner data-icon="inline-start" />
					{/if}
					{copy.addSelected}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
