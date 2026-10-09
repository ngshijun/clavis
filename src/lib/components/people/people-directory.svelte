<script lang="ts" module>
	export interface DirectoryPerson {
		id: string;
		name: string;
		/** Secondary line: "username · grade" for a student, an email for a teacher or a manager. */
		detail: string | null;
		/** How many classrooms they are in. A manager is in none, and has no count. */
		classroomCount?: number;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserCogIcon from '@lucide/svelte/icons/user-cog';
	import UsersIcon from '@lucide/svelte/icons/users';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { initials } from '#lib/initials.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { GradeLevelOption } from '#lib/server/classrooms.js';
	import PersonFormDialog from './person-form-dialog.svelte';
	import ResetPasswordDialog from './reset-password-dialog.svelte';

	/**
	 * Everyone of one kind in an organization, and the way to open an account
	 * for one more. A manager is shown their organization's students or its
	 * teachers, each with how many classrooms they are in and the way to set
	 * their password afresh, which nobody else can do. The students are the
	 * organization's seats, so their page counts them. An admin is shown an
	 * organization's managers.
	 *
	 * The page it is on answers with the form action `create`, and for students
	 * and teachers `resetPassword`.
	 */
	let {
		role,
		people,
		gradeLevels,
		more
	}: {
		role: 'student' | 'teacher' | 'manager';
		people: DirectoryPerson[];
		/** The grade levels a new student can be in. */
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

	let search = $state('');
	const visible = $derived.by(() => {
		const query = search.toLowerCase().trim();
		if (!query) return people;
		return people.filter(
			(person) =>
				person.name.toLowerCase().includes(query) || person.detail?.toLowerCase().includes(query)
		);
	});

	let adding = $state(false);
	/** Whose password is being set afresh. */
	let resetting = $state<DirectoryPerson>();
</script>

{#snippet addPerson()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{copy.add}
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
			aria-label={copy.search}
			placeholder={copy.search}
		/>
	</InputGroup.Root>
	{#if role === 'student' && people.length > 0}
		<span class="text-sm text-muted-foreground tabular-nums">
			{m.count_seats({ count: people.length })}
		</span>
	{/if}
	{@render more?.()}
	{@render addPerson()}
</PageToolbar>

{#if visible.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<copy.icon />
			</Empty.Media>
			{#if search}
				<!-- The search field above is the way out, so a search with no match offers no button. -->
				<Empty.Description>{copy.noneFound}</Empty.Description>
			{:else}
				<Empty.Title>{copy.emptyTitle}</Empty.Title>
				<Empty.Description>{copy.emptyDescription}</Empty.Description>
			{/if}
		</Empty.Header>
		{#if !search}
			<Empty.Content>{@render addPerson()}</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<!-- The page's one list, so it stands bare: hairlines between the rows and no box around each. -->
	<Item.Group class="gap-0">
		{#each visible as person, index (person.id)}
			{#if index > 0}
				<Item.Separator class="my-0" />
			{/if}
			<Item.Root>
				<Item.Media>
					<Avatar.Root>
						<Avatar.Fallback>{initials(person.name)}</Avatar.Fallback>
					</Avatar.Root>
				</Item.Media>
				<Item.Content class="min-w-0">
					<Item.Title class="truncate">{person.name}</Item.Title>
					{#if person.detail}
						<Item.Description class="truncate">{person.detail}</Item.Description>
					{/if}
				</Item.Content>
				{#if role !== 'manager'}
					<Item.Actions class="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
						<span class="max-sm:hidden">
							{person.classroomCount
								? m.count_classrooms({ count: person.classroomCount })
								: m.person_no_classroom()}
						</span>
						<IconButton
							variant="ghost"
							label={m.person_reset_password()}
							onclick={() => (resetting = person)}
						>
							<KeyRoundIcon />
						</IconButton>
					</Item.Actions>
				{/if}
			</Item.Root>
		{/each}
	</Item.Group>
{/if}

{#if adding}
	<PersonFormDialog {role} {gradeLevels} onclosed={() => (adding = false)} />
{/if}

{#if resetting}
	<ResetPasswordDialog person={resetting} onclosed={() => (resetting = undefined)} />
{/if}
