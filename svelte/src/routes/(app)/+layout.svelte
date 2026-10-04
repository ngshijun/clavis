<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import LanguageToggle from '#lib/components/app/language-toggle.svelte';
	import ThemeToggle from '#lib/components/app/theme-toggle.svelte';
	import UserMenu from '#lib/components/app/user-menu.svelte';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { navItems } from '#lib/navigation.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Resolved against the person's own classrooms, so an address naming someone
	// else's classroom gets no classroom links rather than links that lead nowhere.
	const classroom = $derived(data.classrooms.find((item) => item.id === page.params.classroomId));
	const items = $derived(navItems(data.user.role, classroom?.id));
	const title = $derived(items.find((item) => resolve(item.href) === page.url.pathname)?.label());
</script>

<Sidebar.Provider>
	<!-- No sidebar where there is nowhere to go: a picker is the whole page. -->
	{#if items.length > 0}
		<AppSidebar role={data.user.role} {items} {classroom} classroomCount={data.classrooms.length} />
	{/if}
	<Sidebar.Inset>
		<header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
			<div class="flex min-w-0 items-center gap-2">
				{#if items.length > 0}
					<Sidebar.Trigger class="-ml-1" />
					<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
				{/if}
				{#if title}
					<Breadcrumb.Root class="min-w-0">
						<Breadcrumb.List>
							<Breadcrumb.Item>
								<Breadcrumb.Page class="truncate">{title}</Breadcrumb.Page>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<LanguageToggle />
				<ThemeToggle />
				<Separator orientation="vertical" class="data-[orientation=vertical]:h-4" />
				<UserMenu user={data.user} />
			</div>
		</header>
		<main class="flex-1 overflow-auto p-6">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
