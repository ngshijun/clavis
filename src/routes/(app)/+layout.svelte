<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import LanguageToggle from '#lib/components/app/language-toggle.svelte';
	import ThemeToggle from '#lib/components/app/theme-toggle.svelte';
	import UserMenu from '#lib/components/app/user-menu.svelte';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { accountItems, breadcrumbs, navItems } from '#lib/navigation.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Resolved against the person's own classrooms, so an address naming someone
	// else's classroom gets no classroom links rather than links that lead nowhere.
	const classroom = $derived(data.classrooms.find((item) => item.id === page.params.classroomId));
	const items = $derived(navItems(data.user.role, classroom?.id));
	const crumbs = $derived(
		breadcrumbs(data.user.role, classroom, page.url.pathname, page.data.title)
	);
	/** The breadcrumb names the page, so the browser tab takes its name from the same place. */
	const title = $derived(crumbs.at(-1)?.label);
</script>

<svelte:head>
	<title>{title ? `${title} · Clavis` : 'Clavis'}</title>
</svelte:head>

<Sidebar.Provider>
	<!-- No sidebar where there is nowhere to go: a student's picker is the whole page. -->
	{#if items.length > 0}
		<AppSidebar role={data.user.role} {items} classrooms={data.classrooms} {classroom} />
	{/if}
	<Sidebar.Inset>
		<header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
			<div class="flex min-w-0 items-center gap-2">
				{#if items.length > 0}
					<Sidebar.Trigger class="-ml-1" />
					<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
				{/if}
				{#if crumbs.length > 0}
					<Breadcrumb.Root class="min-w-0">
						<Breadcrumb.List class="flex-nowrap">
							{#each crumbs as crumb, index (crumb.href + index)}
								{#if index === crumbs.length - 1}
									<Breadcrumb.Item class="min-w-0">
										<Breadcrumb.Page class="truncate font-semibold">{crumb.label}</Breadcrumb.Page>
									</Breadcrumb.Item>
								{:else}
									<!-- On a narrow screen only the page itself is named. -->
									<Breadcrumb.Item class="hidden md:inline-flex">
										<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
									</Breadcrumb.Item>
									<Breadcrumb.Separator class="hidden md:block" />
								{/if}
							{/each}
						</Breadcrumb.List>
					</Breadcrumb.Root>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<LanguageToggle />
				<ThemeToggle />
				<Separator orientation="vertical" class="data-[orientation=vertical]:h-4" />
				<UserMenu user={data.user} items={accountItems(data.user.role)} />
			</div>
		</header>
		<main class="flex-1 overflow-auto p-page">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
