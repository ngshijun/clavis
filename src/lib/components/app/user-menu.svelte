<script lang="ts">
	import { resolve } from '$app/paths';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { initials } from '#lib/initials.js';
	import type { NavItem } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { SessionUser } from '#lib/server/session.js';

	let {
		user,
		items
	}: {
		user: SessionUser;
		/** Pages reached from here rather than from the sidebar. */
		items: NavItem[];
	} = $props();

	let logoutForm: HTMLFormElement;
</script>

<form bind:this={logoutForm} method="POST" action={resolve('logout')} hidden></form>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={user.name}
	>
		<Avatar.Root class="size-8">
			{#if user.avatarUrl}
				<Avatar.Image src={user.avatarUrl} alt={user.name} />
			{/if}
			<Avatar.Fallback>{initials(user.name)}</Avatar.Fallback>
		</Avatar.Root>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="min-w-56" align="end">
		<DropdownMenu.Label class="grid leading-tight font-normal">
			<span class="truncate font-medium">{user.name}</span>
			<span class="truncate text-xs text-muted-foreground">{user.email}</span>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		{#if items.length > 0}
			<DropdownMenu.Group>
				{#each items as item (item.href)}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a href={resolve(item.href)} {...props}>
								<item.icon />
								{item.label()}
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
		{/if}
		<DropdownMenu.Group>
			<DropdownMenu.Item onSelect={() => logoutForm.requestSubmit()}>
				<LogOutIcon />
				{m.log_out()}
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
