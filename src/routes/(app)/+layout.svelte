<script lang="ts">
	import { afterNavigate, invalidate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import Notifications from '#lib/components/app/notifications.svelte';
	import { scrollRegion } from '#lib/components/app/scroll-region.svelte.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { ACCOUNT, breadcrumbs, navItems } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Resolved against the person's own classrooms, so an address naming someone
	// else's classroom names no classroom rather than one that leads nowhere.
	const classroom = $derived(data.classrooms.find((item) => item.id === page.params.classroomId));
	const items = $derived(navItems(data.user.role));
	const crumbs = $derived(breadcrumbs(data.user.role, classroom, page.url.pathname, page.data));
	/** The breadcrumb names the page, so the browser tab takes its name from the same place. */
	const title = $derived(crumbs.at(-1)?.label);
	/** The page above this one. A narrow screen has no room for the trail, and shows the way up as an arrow. */
	const parent = $derived(crumbs.at(-2));

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
			scrollRegion.scrollTop = 0;
		}
	});
</script>

<!-- What the person shares across pages is read again when they come back to the tab, in case it changed meanwhile. -->
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'visible') invalidate(ACCOUNT);
	}}
/>

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
			class="relative flex h-14 shrink-0 items-center gap-2 border-b border-transparent bg-background px-4 transition-colors data-scrolled:border-border"
		>
			<Sidebar.Trigger class="-ms-1 me-2 max-md:size-9" />
			{#if parent}
				<Button
					variant="ghost"
					size="icon"
					class="-ms-2 md:hidden"
					href={parent.href}
					aria-label={m.nav_back_to({ name: parent.label })}
				>
					<ChevronLeftIcon />
				</Button>
			{/if}
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
			<!--
				The next page is on its way. It waits a moment before it shows, so a page that
				comes at once does not flash it.
			-->
			{#if navigating.to}
				<div
					role="progressbar"
					aria-label={m.nav_loading()}
					class="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
				>
					<div class="h-full w-1/3 animate-loading rounded-full bg-primary"></div>
				</div>
			{/if}
		</header>

		<div
			bind:this={scroller}
			class="@container/page flex min-h-0 flex-1 flex-col overflow-y-auto"
			style:--pinned-toolbar="{scrollRegion.pinnedHeight}px"
			onscroll={() => (scrollRegion.scrollTop = scroller?.scrollTop ?? 0)}
		>
			<!--
				The inset is the page's `main`; this is only its padding and rhythm. A page is
				held to a column 70rem wide in the middle of a wider window, unless it says it
				lays itself out across the whole of it.
			-->
			<div
				data-wide={page.data.wide ? '' : undefined}
				class="flex flex-1 flex-col gap-4 px-gutter py-page [--gutter:max(var(--page),calc((100cqw_-_70rem)/2))] data-wide:[--gutter:var(--page)]"
			>
				{@render children()}
			</div>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
