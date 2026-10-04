<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import ClassroomFormDialog from '#lib/components/classrooms/classroom-form-dialog.svelte';
	import ClassroomMembersDialog from '#lib/components/classrooms/classroom-members-dialog.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { PageProps } from './$types';

	/**
	 * The manager's classroom list. Opening a classroom is the card's own click;
	 * the administrative actions (roster, edit, delete) are named controls on it.
	 */
	let { data }: PageProps = $props();

	let search = $state('');
	const visible = $derived.by(() => {
		const query = search.toLowerCase().trim();
		if (!query) return data.classrooms;
		return data.classrooms.filter((classroom) =>
			[classroom.name, classroom.gradeLevelName, classroom.subjectName].some((text) =>
				text.toLowerCase().includes(query)
			)
		);
	});

	/** The classroom the form is open for: null to create one, undefined when closed. */
	let editing = $state<Classroom | null>();
	let deleting = $state<Classroom>();
	let deleteOpen = $state(false);
	let deletePending = $state(false);

	const membersClassroom = $derived(
		data.classrooms.find((classroom) => classroom.id === data.members?.classroomId)
	);
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<InputGroup.Root class="w-100 max-w-full">
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
	<Button onclick={() => (editing = null)}>
		<PlusIcon data-icon="inline-start" />
		{m.classrooms_add()}
	</Button>
</div>

{#if visible.length === 0}
	<ClassroomEmpty
		title={search ? undefined : m.classrooms_empty_title()}
		description={search ? m.classrooms_no_match() : m.classrooms_empty_description()}
	/>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each visible as classroom (classroom.id)}
			<ClassroomCard {classroom} href={resolve(classroomPath('manager', classroom.id))}>
				{#snippet actions()}
					<IconButton
						variant="secondary"
						label={m.classrooms_manage_members()}
						href={resolve(`manager/classrooms?members=${classroom.id}`)}
						data-sveltekit-reset={false}
					>
						<UsersIcon />
					</IconButton>
					<IconButton
						variant="secondary"
						label={m.action_edit()}
						onclick={() => (editing = classroom)}
					>
						<PencilIcon />
					</IconButton>
					<IconButton
						variant="secondary"
						class="text-destructive hover:text-destructive"
						label={m.action_delete()}
						onclick={() => {
							deleting = classroom;
							deleteOpen = true;
						}}
					>
						<Trash2Icon />
					</IconButton>
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

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.classrooms_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.classrooms_delete_description({ name: deleting?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deletePending = true;
				return async ({ result, update }) => {
					await update();
					deletePending = false;
					if (result.type === 'success') {
						toast.success(m.classrooms_deleted());
						deleteOpen = false;
					} else if (result.type === 'failure' && typeof result.data?.message === 'string') {
						toast.error(result.data.message);
					}
				};
			}}
		>
			<input type="hidden" name="id" value={deleting?.id} />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button" disabled={deletePending}>
					{m.action_cancel()}
				</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={deletePending}>
					{#if deletePending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.action_delete()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
