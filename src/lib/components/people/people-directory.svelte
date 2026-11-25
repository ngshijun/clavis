<script lang="ts" module>
	export interface DirectoryPerson {
		id: string;
		name: string;
		/** Secondary line: "username · grade" for a student, an email for a teacher or a manager. */
		detail: string | null;
		/** How many classrooms they are in. A manager is in none, and has no count. */
		classroomCount?: number;
		/** A student's grade level, which editing them starts from. */
		gradeLevelId?: string | null;
		/** When their account was closed; null while it is open. */
		closedAt: string | null;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import Day from '#lib/components/app/day.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import PersonRow from '#lib/components/app/person-row.svelte';
	import SearchField from '#lib/components/app/search-field.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { postAction } from '#lib/form-actions.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { GradeLevelOption } from '#lib/server/classrooms.js';
	import CloseAccountDialog from './close-account-dialog.svelte';
	import PersonFormDialog from './person-form-dialog.svelte';
	import ResetPasswordDialog from './reset-password-dialog.svelte';

	/**
	 * Everyone of one kind in an organization, and the way to open an account
	 * for one more. A manager is shown their organization's students or its
	 * teachers, each with how many classrooms they are in and, in the More menu
	 * on their row, the ways to put their name right, to set their password
	 * afresh, which nobody else can do, and to close their account. The
	 * students are the organization's seats, so their page counts them. An
	 * admin is shown an organization's managers, whose menu edits and closes.
	 *
	 * Closed accounts are a second list, offered once there is one. They
	 * cannot sign in, are in no classroom and take no seat, and one can only
	 * be opened again.
	 *
	 * The page it is on answers with the form actions `create`, `update` and
	 * `setClosed`, and for students and teachers `resetPassword`.
	 */
	let {
		role,
		people,
		gradeLevels,
		more
	}: {
		role: 'student' | 'teacher' | 'manager';
		people: DirectoryPerson[];
		/** The grade levels a student can be in. */
		gradeLevels?: GradeLevelOption[];
		/** The page's rare actions, shown in the toolbar beside the way to add someone. */
		more?: Snippet;
	} = $props();

	const copies = $derived({
		student: {
			icon: UsersIcon,
			search: m.members_student_search(),
			add: m.people_add_student(),
			emptyTitle: m.people_no_students_title(),
			emptyDescription: m.people_no_students_description(),
			noneFound: m.members_no_students_found()
		},
		teacher: {
			icon: GraduationCapIcon,
			search: m.members_teacher_search(),
			add: m.people_add_teacher(),
			emptyTitle: m.people_no_teachers_title(),
			emptyDescription: m.people_no_teachers_description(),
			noneFound: m.members_no_teachers_found()
		},
		manager: {
			icon: UserCogIcon,
			search: m.members_manager_search(),
			add: m.people_add_manager(),
			emptyTitle: m.people_no_managers_title(),
			emptyDescription: m.people_no_managers_description(),
			noneFound: m.members_no_managers_found()
		}
	});
	const copy = $derived(copies[role]);

	const shelves = [
		{ value: 'open', label: m.people_shelf_open() },
		{ value: 'closed', label: m.people_shelf_closed() }
	] as const;

	let chosenShelf = $state<(typeof shelves)[number]['value']>('open');
	const openCount = $derived(people.filter((person) => person.closedAt === null).length);
	const anyClosed = $derived(openCount < people.length);
	// When the last closed account is opened again, the list it was in is gone.
	const shelf = $derived(anyClosed ? chosenShelf : 'open');

	let search = $state('');
	const visible = $derived.by(() => {
		const query = search.toLowerCase().trim();
		return people.filter(
			(person) =>
				(person.closedAt !== null) === (shelf === 'closed') &&
				(!query ||
					person.name.toLowerCase().includes(query) ||
					person.detail?.toLowerCase().includes(query))
		);
	});

	let adding = $state(false);
	/** Who is being edited. */
	let editing = $state<DirectoryPerson>();
	/** Whose password is being set afresh. */
	let resetting = $state<DirectoryPerson>();
	/** Whose account is about to be closed. */
	let closing = $state<DirectoryPerson>();

	/**
	 * Opens a closed account again. Nothing is taken from anyone, so it is not
	 * asked about first. It is said afterwards, since the row leaves the list,
	 * and with it what is left to do: they are back in no classroom.
	 */
	async function reopen(person: DirectoryPerson) {
		const form = new FormData();
		form.set('personId', person.id);
		form.set('closed', 'false');
		if (!(await settle(await postAction('?/setClosed', form)))) return;

		// The list went with its last account, and is not to come back on show when the next one is closed.
		if (!anyClosed) chosenShelf = 'open';
		const { name } = person;
		toast.success(
			role === 'manager'
				? m.reopen_account_toast_manager({ name })
				: m.reopen_account_toast_member({ name })
		);
	}
</script>

{#snippet addPerson()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{copy.add}
	</Button>
{/snippet}

<PageToolbar>
	<SearchField bind:value={search} placeholder={copy.search} />
	{#if anyClosed}
		<Segmented bind:value={chosenShelf} options={shelves} label={m.people_shelf_label()} />
	{/if}
	{#if role === 'student' && openCount > 0}
		<span class="text-sm text-muted-foreground tabular-nums">
			{m.count_seats({ count: openCount })}
		</span>
	{/if}
	{@render more?.()}
	{@render addPerson()}
</PageToolbar>

{#if visible.length === 0}
	{#if search}
		<!-- The search field above is the way out, so a search with no match offers no button. -->
		<EmptyState icon={copy.icon} description={copy.noneFound} />
	{:else}
		<EmptyState icon={copy.icon} title={copy.emptyTitle} description={copy.emptyDescription}>
			{@render addPerson()}
		</EmptyState>
	{/if}
{:else}
	<ListCard>
		{#each visible as person (person.id)}
			{#if person.closedAt === null}
				<PersonRow name={person.name} detail={person.detail}>
					{#snippet tail()}
						{#if role !== 'manager'}
							<span
								class="text-sm whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden"
							>
								{person.classroomCount
									? m.count_classrooms({ count: person.classroomCount })
									: m.person_no_classroom()}
							</span>
						{/if}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<IconButton variant="ghost" label={m.action_more()} {...props}>
										<EllipsisIcon />
									</IconButton>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Group>
									<DropdownMenu.Item onSelect={() => (editing = person)}>
										<PencilIcon />
										{m.menu_edit()}
									</DropdownMenu.Item>
									{#if role !== 'manager'}
										<DropdownMenu.Item onSelect={() => (resetting = person)}>
											<KeyRoundIcon />
											{m.person_reset_password()}
										</DropdownMenu.Item>
									{/if}
									<DropdownMenu.Item variant="destructive" onSelect={() => (closing = person)}>
										<UserXIcon />
										{m.person_close_account()}
									</DropdownMenu.Item>
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/snippet}
				</PersonRow>
			{:else}
				{@const closedAt = person.closedAt}
				<PersonRow name={person.name}>
					{#snippet detail()}
						{#if person.detail}{person.detail} ·{/if}
						<Day at={closedAt} say={(day) => m.close_account_closed_on({ day })} />
					{/snippet}
					{#snippet tail()}
						<IconButton variant="ghost" label={m.reopen_account()} onclick={() => reopen(person)}>
							<UserCheckIcon />
						</IconButton>
					{/snippet}
				</PersonRow>
			{/if}
		{/each}
	</ListCard>
{/if}

{#if adding}
	<PersonFormDialog {role} {gradeLevels} onclosed={() => (adding = false)} />
{/if}

{#if editing}
	<PersonFormDialog {role} person={editing} {gradeLevels} onclosed={() => (editing = undefined)} />
{/if}

{#if resetting}
	<ResetPasswordDialog person={resetting} onclosed={() => (resetting = undefined)} />
{/if}

{#if closing}
	<CloseAccountDialog {role} person={closing} onclosed={() => (closing = undefined)} />
{/if}
