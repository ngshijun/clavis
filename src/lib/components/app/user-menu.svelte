<script lang="ts">
	import { resolve } from '$app/paths';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { SessionUser } from '#lib/server/session.js';

	let { user }: { user: SessionUser } = $props();

	const initials = $derived(
		user.name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.toUpperCase()
			.slice(0, 2) || '?'
	);

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
			<Avatar.Fallback>{initials}</Avatar.Fallback>
		</Avatar.Root>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="min-w-56" align="end">
		<DropdownMenu.Label class="grid leading-tight font-normal">
			<span class="truncate font-medium">{user.name}</span>
			<span class="truncate text-xs text-muted-foreground">{user.email}</span>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Item onSelect={() => logoutForm.requestSubmit()}>
				<LogOutIcon />
				{m.log_out()}
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
