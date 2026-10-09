<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { coverGrid } from '#lib/components/app/cover-card.svelte';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import ClassroomFormDialog from '#lib/components/classrooms/classroom-form-dialog.svelte';
	import type { NamedRow } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { postAction } from '#lib/form-actions.js';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { PageProps, Snapshot } from './$types';

	/**
	 * The manager's classroom list, grade level by grade level in the
	 * curriculum's order. Opening a classroom is the card's own click and leads
	 * to its roster, which is what a manager comes here for; the rare actions
	 * are in the More menu on the card.
	 *
	 * Archived classrooms are a second list, offered once there is one. Only
	 * managers see them, and one can only be restored or deleted. Deleting is
	 * offered there alone, so a classroom is put away before it is destroyed.
	 */
	let { data }: PageProps = $props();

	const shelves = [
		{ value: 'live', label: m.classrooms_shelf_live() },
		{ value: 'archived', label: m.classrooms_shelf_archived() }
	] as const;
	type Shelf = (typeof shelves)[number]['value'];

	let chosenShelf = $state<Shelf>('live');
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
					[
						classroom.name,
						classroom.gradeLevelName,
						classroom.subjectName,
						...classroom.teachers
					].some((text) => text.toLowerCase().includes(query)))
		);
	});
	const groups = $derived(
		data.gradeLevels
			.map((grade) => ({
				grade,
				classrooms: visible.filter((classroom) => classroom.gradeLevelId === grade.id)
			}))
			.filter((group) => group.classrooms.length > 0)
	);

	/** Which list was showing and what was searched for, kept for coming back from a classroom. */
	export const snapshot: Snapshot<{ shelf: Shelf; search: string }> = {
		capture: () => ({ shelf: chosenShelf, search }),
		restore: (value) => {
			chosenShelf = value.shelf;
			search = value.search;
		}
	};

	/** The classroom the form is open for: null to create one, undefined when closed. */
	let editing = $state<Classroom | null>();
	let deleteDialog = $state<DeleteDialog<NamedRow>>();

	/**
	 * Archiving takes a classroom away from its teachers and students but
	 * deletes nothing, so it is not asked about first. It is said afterwards,
	 * since the card leaves the list, and what says it offers to take it back.
	 * Taking it back is its own report: the card returns.
	 */
	async function setArchived(classroom: Classroom, archived: boolean, undoing = false) {
		const form = new FormData();
		form.set('id', classroom.id);
		form.set('archived', String(archived));
		if (!(await settle(await postAction('?/archive', form))) || undoing) return;

		const { name } = classroom;
		if (archived) {
			toast.success(m.classrooms_archived({ name }), {
				action: { label: m.action_undo(), onClick: () => setArchived(classroom, false, true) }
			});
		} else {
			toast.success(m.classrooms_restored({ name }));
		}
	}
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
	<div class="flex flex-col gap-6">
		{#each groups as group (group.grade.id)}
			<section class="flex flex-col gap-4">
				<h2 class="text-lg font-semibold">{group.grade.name}</h2>
				<div class={coverGrid}>
					{#each group.classrooms as classroom (classroom.id)}
						<ClassroomCard {classroom} href={resolvePath(classroomPath('manager', classroom.id))}>
							{#snippet actions()}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button
												variant="secondary"
												size="icon-sm"
												aria-label={m.action_more()}
												{...props}
											>
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
											{/if}
										</DropdownMenu.Group>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/snippet}
						</ClassroomCard>
					{/each}
				</div>
			</section>
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

<DeleteDialog
	bind:this={deleteDialog}
	title={(target: NamedRow) => m.classrooms_delete_title({ name: target.name })}
	description={() => m.classrooms_delete_description()}
/>
