<script lang="ts">
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import PersonRow from '#lib/components/app/person-row.svelte';
	import SearchField from '#lib/components/app/search-field.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import AddMembersDialog from './add-members-dialog.svelte';
	import type { PickableMember } from './member-pick-list.svelte';
	import RemoveMemberDialog from './remove-member-dialog.svelte';

	/**
	 * A classroom's teachers, for the manager who keeps the list: who is on
	 * it, a way to take someone off, which asks first, and a dialog to put
	 * more on. A teacher has no page of their own in a classroom, so they are
	 * taken off from their row. The page it is on answers with the form
	 * actions `add` and `remove`. An archived classroom's list stands as it
	 * was and is only shown.
	 */
	let {
		classroom,
		members,
		candidates
	}: {
		classroom: Classroom;
		members: PickableMember[];
		/** Every teacher of the organization: any of them could be on the list. */
		candidates: PickableMember[];
	} = $props();

	let adding = $state(false);

	// Who is being taken off. They stay named while the dialog closes, so its words do not vanish mid-animation.
	let leaving = $state<PickableMember>();
	let confirming = $state(false);

	const live = $derived(classroom.archivedAt === null);

	let search = $state('');
	const visible = $derived.by(() => {
		const query = search.toLowerCase().trim();
		if (!query) return members;
		return members.filter(
			(member) =>
				member.name.toLowerCase().includes(query) || member.detail?.toLowerCase().includes(query)
		);
	});
</script>

{#snippet addButton()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{m.roster_add_teachers()}
	</Button>
{/snippet}

<PageToolbar>
	<SearchField bind:value={search} placeholder={m.members_teacher_search()} />
	{#if live}
		{@render addButton()}
	{/if}
</PageToolbar>

{#if visible.length === 0}
	{#if search}
		<!-- The search field above is the way out, so a search with no match offers no button. -->
		<EmptyState icon={GraduationCapIcon} description={m.members_no_teachers_found()} />
	{:else}
		<EmptyState
			icon={GraduationCapIcon}
			title={m.people_no_teachers_title()}
			description={m.members_no_teachers()}
		>
			{#if live}
				{@render addButton()}
			{/if}
		</EmptyState>
	{/if}
{:else}
	<ListCard>
		{#each visible as member (member.id)}
			<PersonRow name={member.name} detail={member.detail}>
				{#snippet tail()}
					{#if live}
						<IconButton
							variant="ghost"
							label={m.members_remove_teacher()}
							onclick={() => {
								leaving = member;
								confirming = true;
							}}
						>
							<UserMinusIcon />
						</IconButton>
					{/if}
				{/snippet}
			</PersonRow>
		{/each}
	</ListCard>
{/if}

<RemoveMemberDialog bind:open={confirming} kind="teachers" member={leaving} {classroom} />

<AddMembersDialog
	bind:open={adding}
	kind="teachers"
	memberIds={members.map((member) => member.id)}
	{candidates}
/>
