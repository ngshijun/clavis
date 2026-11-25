<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import SearchField from '#lib/components/app/search-field.svelte';
	import OrganizationFormDialog from '#lib/components/organizations/organization-form-dialog.svelte';
	import OrganizationRow from '#lib/components/organizations/organization-row.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * The organizations: the tuition centers Clavis is sold to, each with its
	 * head counts. Opening one leads to its managers, which is what an admin
	 * comes here to set up; the organization's manager does the rest.
	 */
	let { data }: PageProps = $props();

	let search = $state('');
	const visible = $derived.by(() => {
		const query = search.toLowerCase().trim();
		if (!query) return data.organizations;
		return data.organizations.filter((organization) =>
			organization.name.toLowerCase().includes(query)
		);
	});

	let adding = $state(false);
</script>

{#snippet addOrganization()}
	<Button onclick={() => (adding = true)}>
		<PlusIcon data-icon="inline-start" />
		{m.organizations_add()}
	</Button>
{/snippet}

<PageToolbar>
	<SearchField bind:value={search} placeholder={m.organizations_search()} />
	{@render addOrganization()}
</PageToolbar>

{#if visible.length === 0}
	{#if search}
		<!-- The search field above is the way out, so a search with no match offers no button. -->
		<EmptyState icon={Building2Icon} description={m.organizations_none_found()} />
	{:else}
		<EmptyState
			icon={Building2Icon}
			title={m.organizations_none_title()}
			description={m.organizations_none_description()}
		>
			{@render addOrganization()}
		</EmptyState>
	{/if}
{:else}
	<ListCard>
		{#each visible as organization (organization.id)}
			<OrganizationRow {organization} />
		{/each}
	</ListCard>
{/if}

{#if adding}
	<OrganizationFormDialog onclosed={() => (adding = false)} />
{/if}
