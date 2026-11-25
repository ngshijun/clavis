<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import OrganizationRow from '#lib/components/organizations/organization-row.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * The admin's dashboard: how much is on the platform, and each organization
	 * with its own head counts, leading to its page. Organizations are added on
	 * their own page, which an empty dashboard points to.
	 */
	let { data }: PageProps = $props();

	/** One of the head counts, added up over every organization. */
	const total = (count: 'teacherCount' | 'studentCount' | 'classroomCount') =>
		data.organizations.reduce((sum, organization) => sum + organization[count], 0);

	const stats = $derived([
		{ label: m.nav_organizations(), value: data.organizations.length },
		{ label: m.section_teachers(), value: total('teacherCount') },
		{ label: m.section_students(), value: total('studentCount') },
		{ label: m.nav_classrooms(), value: total('classroomCount') }
	]);
</script>

{#if data.organizations.length === 0}
	<EmptyState
		icon={Building2Icon}
		title={m.organizations_none_title()}
		description={m.organizations_none_description()}
	>
		<Button href={resolve('admin/organizations')}>{m.organizations_go_to()}</Button>
	</EmptyState>
{:else}
	<StatStrip {stats} />

	<ListCard title={m.nav_organizations()}>
		{#each data.organizations as organization (organization.id)}
			<OrganizationRow {organization} />
		{/each}
	</ListCard>
{/if}
