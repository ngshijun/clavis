<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { useSidebar } from '#lib/components/ui/sidebar/index.js';
	import { accountItems } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js';
	import { resolvePath } from '#lib/paths.js';
	import type { SessionUser } from '#lib/server/session.js';

	/**
	 * The signed-in account: the pages that are set up once and seldom visited
	 * again, the person's own language and appearance, and the way out. It opens
	 * beside the sidebar, or above its trigger when the sidebar is a sheet.
	 */
	let {
		user,
		trigger
	}: {
		user: SessionUser;
		trigger: Snippet<[Record<string, unknown>]>;
	} = $props();

	const sidebar = useSidebar();
	const items = $derived(accountItems(user.role));

	/** Each language under its own name, so it can be found by someone who reads no other. */
	const languages: Record<Locale, string> = { en: 'English', zh: '中文' };

	const appearances = [
		{ value: 'system', label: m.appearance_system },
		{ value: 'light', label: m.appearance_light },
		{ value: 'dark', label: m.appearance_dark }
	] as const;

	let logoutForm: HTMLFormElement;
</script>

<form bind:this={logoutForm} method="POST" action={resolve('logout')} hidden></form>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			{@render trigger(props)}
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content
		class="min-w-56"
		side={sidebar.isMobile ? 'top' : 'right'}
		align="end"
		sideOffset={4}
	>
		<DropdownMenu.Group>
			<DropdownMenu.Label class="grid gap-0.5 font-normal">
				<span class="truncate text-sm font-medium text-foreground">{user.name}</span>
				<span class="truncate">{user.login}</span>
			</DropdownMenu.Label>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		{#if items.length > 0}
			<DropdownMenu.Group>
				{#each items as item (item.href)}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a href={resolvePath(item.href)} {...props}>
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
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<LanguagesIcon />
					{m.account_language()}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.RadioGroup
						value={getLocale()}
						onValueChange={(value) => setLocale(value as Locale)}
					>
						{#each locales as locale (locale)}
							<DropdownMenu.RadioItem value={locale} lang={locale} closeOnSelect>
								{languages[locale]}
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<SunMoonIcon />
					{m.account_appearance()}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.RadioGroup
						value={userPrefersMode.current}
						onValueChange={(value) => setMode(value as typeof userPrefersMode.current)}
					>
						{#each appearances as appearance (appearance.value)}
							<DropdownMenu.RadioItem value={appearance.value}>
								{appearance.label()}
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Item onSelect={() => logoutForm.requestSubmit()}>
				<LogOutIcon />
				{m.sign_out()}
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
