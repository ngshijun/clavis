<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import OrganizationFormDialog from '#lib/components/organizations/organization-form-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { organizationPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
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
	<InputGroup.Root class="me-auto w-80 max-w-full">
		<InputGroup.Addon>
			<SearchIcon />
		</InputGroup.Addon>
		<InputGroup.Input
			bind:value={search}
			type="search"
			aria-label={m.organizations_search()}
			placeholder={m.organizations_search()}
		/>
	</InputGroup.Root>
	{@render addOrganization()}
</PageToolbar>

{#if visible.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<Building2Icon />
			</Empty.Media>
			{#if search}
				<!-- The search field above is the way out, so a search with no match offers no button. -->
				<Empty.Description>{m.organizations_none_found()}</Empty.Description>
			{:else}
				<Empty.Title>{m.organizations_none_title()}</Empty.Title>
				<Empty.Description>{m.organizations_none_description()}</Empty.Description>
			{/if}
		</Empty.Header>
		{#if !search}
			<Empty.Content>{@render addOrganization()}</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<!-- The page's one list, so it stands bare: hairlines between the rows and no box around each. -->
	<Item.Group class="gap-0">
		{#each visible as organization, index (organization.id)}
			{#if index > 0}
				<Item.Separator class="my-0" />
			{/if}
			<Item.Root class="active:bg-muted">
				{#snippet child({ props })}
					<a href={resolvePath(organizationPath(organization.id))} {...props}>
						<Item.Media variant="icon">
							<Building2Icon />
						</Item.Media>
						<Item.Content class="min-w-0">
							<Item.Title class="truncate">{organization.name}</Item.Title>
							<Item.Description class="truncate tabular-nums">
								{m.count_managers({ count: organization.managerCount })} ·
								{m.count_teachers({ count: organization.teacherCount })} ·
								{m.count_students({ count: organization.studentCount })}
							</Item.Description>
						</Item.Content>
						<Item.Actions>
							<ChevronRightIcon class="size-4 text-muted-foreground" />
						</Item.Actions>
					</a>
				{/snippet}
			</Item.Root>
		{/each}
	</Item.Group>
{/if}

{#if adding}
	<OrganizationFormDialog onclosed={() => (adding = false)} />
{/if}
