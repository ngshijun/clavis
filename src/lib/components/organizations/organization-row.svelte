<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import ListRow from '#lib/components/app/list-row.svelte';
	import { organizationPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { OrganizationSummary } from '#lib/server/organizations.js';

	/** An organization's row in a list: its name over its head counts, leading to its page. */
	let { organization }: { organization: OrganizationSummary } = $props();
</script>

<ListRow title={organization.name} href={resolvePath(organizationPath(organization.id))}>
	{#snippet lead()}
		<span
			class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
		>
			<Building2Icon class="size-4" aria-hidden="true" />
		</span>
	{/snippet}
	{#snippet detail()}
		<span class="tabular-nums">
			{m.count_managers({ count: organization.managerCount })} ·
			{m.count_teachers({ count: organization.teacherCount })} ·
			{m.count_students({ count: organization.studentCount })}
		</span>
	{/snippet}
</ListRow>
