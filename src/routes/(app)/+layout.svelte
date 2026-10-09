<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import Notifications from '#lib/components/app/notifications.svelte';
	import { scrollRegion } from '#lib/components/app/scroll-region.svelte.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { breadcrumbs, navItems } from '#lib/navigation.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Resolved against the person's own classrooms, so an address naming someone
	// else's classroom names no classroom rather than one that leads nowhere.
	const classroom = $derived(data.classrooms.find((item) => item.id === page.params.classroomId));
	const items = $derived(navItems(data.user.role));
	const crumbs = $derived(
		breadcrumbs(data.user.role, data.classrooms, classroom, page.url.pathname, page.data)
	);
	/** The breadcrumb names the page, so the browser tab takes its name from the same place. */
	const title = $derived(crumbs.at(-1)?.label);

	/**
	 * The header stays put and only the content scrolls under it. The scroll edge
	 * (a hairline once content has moved beneath) sits under this bar unless the
	 * page pins a toolbar of its own, which then takes it.
	 */
	let scroller = $state<HTMLDivElement>();
	const edge = $derived(scrollRegion.scrolled && !scrollRegion.pinned);

	afterNavigate(({ type, from, to }) => {
		// A new page starts at the top; hash links and back/forward keep the router's own scrolling.
		// A change of the query alone is the same page showing something else, and stays where it is.
		const samePage = from?.url.pathname === to?.url.pathname;
		if (type !== 'popstate' && !samePage && !to?.url.hash && scroller) {
			scroller.scrollTop = 0;
			scrollRegion.scrolled = false;
		}
	});
</script>

<svelte:head>
	<title>{title ? `${title} · Clavis` : 'Clavis'}</title>
</svelte:head>

<Sidebar.Provider class="h-svh overflow-hidden">
	<AppSidebar
		user={data.user}
		{items}
		classrooms={data.classrooms}
		{classroom}
		toDo={data.toDo ?? {}}
	/>
	<Sidebar.Inset class="min-h-0 overflow-hidden">
		<header
			data-scrolled={edge ? '' : undefined}
			class="flex h-14 shrink-0 items-center gap-2 border-b border-transparent bg-background px-4 transition-colors data-scrolled:border-border"
		>
			<Sidebar.Trigger class="-ms-1 me-2" />
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
			{#if data.notifications}
				<div class="ms-auto">
					<Notifications notifications={data.notifications} classrooms={data.classrooms} />
				</div>
			{/if}
		</header>

		<div
			bind:this={scroller}
			class="flex min-h-0 flex-1 flex-col overflow-y-auto"
			style:--pinned-toolbar="{scrollRegion.toolbarHeight}px"
			onscroll={() => (scrollRegion.scrolled = (scroller?.scrollTop ?? 0) > 0)}
		>
			<!-- The inset is the page's `main`; this is only its padding and rhythm. -->
			<div class="flex flex-1 flex-col gap-4 p-page">
				{@render children()}
			</div>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
