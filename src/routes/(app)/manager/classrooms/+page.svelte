<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { coverGrid } from '#lib/components/app/cover-card.svelte';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import ClassroomFormDialog from '#lib/components/classrooms/classroom-form-dialog.svelte';
	import ClassroomMembersDialog from '#lib/components/classrooms/classroom-members-dialog.svelte';
	import type { NamedRow } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { postAction } from '#lib/form-actions.js';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { PageProps } from './$types';

	/**
	 * The manager's classroom list. Opening a classroom is the card's own click.
	 * The roster, which is what a manager comes here for, is one button on the
	 * card; the rare actions (edit, archive, delete) are in the More menu
	 * beside it.
	 *
	 * Archived classrooms are a second list, offered once there is one. Only
	 * managers see them, and one can only be restored or deleted.
	 */
	let { data }: PageProps = $props();

	const shelves = [
		{ value: 'live', label: m.classrooms_shelf_live() },
		{ value: 'archived', label: m.classrooms_shelf_archived() }
	] as const;
	let chosenShelf = $state<(typeof shelves)[number]['value']>('live');
	const anyArchived = $derived(data.classrooms.some((classroom) => classroom.archivedAt !== null));
	// When the last archived classroom is restored or deleted, the list it was in is gone.
	const shelf = $derived(anyArchived ? chosenShelf : 'live');

	let search = $state('');
	const visible = $derived.by(() => {
		const query = search.toLowerCase().trim();
		return data.classrooms.filter(
			(classroom) =>
				(classroom.archivedAt !== null) === (shelf === 'archived') &&
				(!query ||
					[classroom.name, classroom.gradeLevelName, classroom.subjectName].some((text) =>
						text.toLowerCase().includes(query)
					))
		);
	});

	/** The classroom the form is open for: null to create one, undefined when closed. */
	let editing = $state<Classroom | null>();
	let deleteDialog = $state<DeleteDialog<NamedRow>>();

	/**
	 * Archiving takes a classroom away from its teachers and students but
	 * deletes nothing and is undone from the other list, so it is not asked
	 * about first. It is said afterwards, since the card leaves the list.
	 */
	async function setArchived(classroom: Classroom, archived: boolean) {
		const form = new FormData();
		form.set('id', classroom.id);
		form.set('archived', String(archived));
		if (await settle(await postAction('?/archive', form))) {
			const { name } = classroom;
			toast.success(archived ? m.classrooms_archived({ name }) : m.classrooms_restored({ name }));
		}
	}

	const membersClassroom = $derived(
		data.classrooms.find((classroom) => classroom.id === data.members?.classroomId)
	);
</script>

{#snippet addClassroom()}
	<Button onclick={() => (editing = null)}>
		<PlusIcon data-icon="inline-start" />
		{m.classrooms_add()}
	</Button>
{/snippet}

<PageToolbar>
	<InputGroup.Root class="me-auto w-80 max-w-full">
		<InputGroup.Addon>
			<SearchIcon />
		</InputGroup.Addon>
		<InputGroup.Input
			bind:value={search}
			type="search"
			aria-label={m.classrooms_search_placeholder()}
			placeholder={m.classrooms_search_placeholder()}
		/>
	</InputGroup.Root>
	{#if anyArchived}
		<Segmented bind:value={chosenShelf} options={shelves} label={m.classrooms_shelf_label()} />
	{/if}
	{@render addClassroom()}
</PageToolbar>

{#if visible.length === 0}
	{#if search}
		<!-- The search field above is the way out, so a search with no match offers no button. -->
		<ClassroomEmpty description={m.classrooms_no_match()} />
	{:else}
		<ClassroomEmpty
			title={m.classrooms_empty_title()}
			description={m.classrooms_empty_description()}
		>
			{@render addClassroom()}
		</ClassroomEmpty>
	{/if}
{:else}
	<div class={coverGrid}>
		{#each visible as classroom (classroom.id)}
			<ClassroomCard {classroom} href={resolve(classroomPath('manager', classroom.id))}>
				{#snippet actions()}
					{#if classroom.archivedAt === null}
						<IconButton
							variant="secondary"
							label={m.classrooms_manage_members()}
							href={resolve(`manager/classrooms?members=${classroom.id}`)}
							data-sveltekit-reset={false}
						>
							<UsersIcon />
						</IconButton>
					{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="secondary" size="icon-sm" aria-label={m.action_more()} {...props}>
									<EllipsisIcon />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Group>
								{#if classroom.archivedAt === null}
									<DropdownMenu.Item onSelect={() => (editing = classroom)}>
										<PencilIcon />
										{m.menu_edit()}
									</DropdownMenu.Item>
									<DropdownMenu.Item onSelect={() => setArchived(classroom, true)}>
										<ArchiveIcon />
										{m.menu_archive()}
									</DropdownMenu.Item>
								{:else}
									<DropdownMenu.Item onSelect={() => setArchived(classroom, false)}>
										<ArchiveRestoreIcon />
										{m.menu_restore()}
									</DropdownMenu.Item>
								{/if}
								<DropdownMenu.Item
									variant="destructive"
									onSelect={() =>
										deleteDialog?.request({
											kind: 'classroom',
											id: classroom.id,
											name: classroom.name
										})}
								>
									<Trash2Icon />
									{m.menu_delete()}
								</DropdownMenu.Item>
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</ClassroomCard>
		{/each}
	</div>
{/if}

{#if editing !== undefined}
	<ClassroomFormDialog
		classroom={editing}
		gradeLevels={data.gradeLevels}
		onclosed={() => (editing = undefined)}
	/>
{/if}

{#if data.members && membersClassroom}
	<ClassroomMembersDialog
		classroom={membersClassroom}
		{...data.members}
		onclose={() => goto(resolve('manager/classrooms'), { reset: false })}
	/>
{/if}

<DeleteDialog
	bind:this={deleteDialog}
	title={(target: NamedRow) => m.classrooms_delete_title({ name: target.name })}
	description={() => m.classrooms_delete_description()}
/>
