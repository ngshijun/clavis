<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import DeleteOrganizationDialog from '#lib/components/organizations/delete-organization-dialog.svelte';
	import OrganizationFormDialog from '#lib/components/organizations/organization-form-dialog.svelte';
	import PeopleDirectory from '#lib/components/people/people-directory.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * An organization as an admin sets it up: its managers, who do the rest.
	 * Renaming and deleting it are rare, so they are in the More menu beside
	 * the page's one primary action.
	 */
	let { data }: PageProps = $props();

	const people = $derived(
		data.managers.map((manager) => ({
			id: manager.id,
			name: manager.name,
			detail: manager.email
		}))
	);

	let renaming = $state(false);
	let deleting = $state(false);
</script>

<PeopleDirectory role="manager" {people}>
	{#snippet more()}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="icon" aria-label={m.action_more()} {...props}>
						<EllipsisIcon />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Group>
					<DropdownMenu.Item onSelect={() => (renaming = true)}>
						<PencilIcon />
						{m.menu_rename()}
					</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onSelect={() => (deleting = true)}>
						<Trash2Icon />
						{m.menu_delete()}
					</DropdownMenu.Item>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PeopleDirectory>

{#if renaming}
	<OrganizationFormDialog organization={data.organization} onclosed={() => (renaming = false)} />
{/if}

{#if deleting}
	<DeleteOrganizationDialog organization={data.organization} onclosed={() => (deleting = false)} />
{/if}
