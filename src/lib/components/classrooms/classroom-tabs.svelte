<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { usePinnedToolbar } from '#lib/components/app/scroll-region.svelte.js';
	import ClassroomBanner from '#lib/components/classrooms/classroom-banner.svelte';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { sectionAt, type NavItem } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	/**
	 * A classroom as every role sees it: its banner, then its pages as tabs.
	 * Which pages there are is the role's own; how a classroom is laid out is
	 * not.
	 */
	let {
		classroom,
		sections,
		children
	}: {
		classroom: Classroom;
		/** The classroom's pages, the first being its own address. */
		sections: NavItem[];
		children: Snippet;
	} = $props();

	/** The address decides which tab is open, so a tab is a link and the page is its panel. */
	const current = $derived(sectionAt(sections, page.url.pathname)?.href ?? '');

	// The tab row pins itself and has its own hairline, which is this view's one scroll edge.
	usePinnedToolbar();
</script>

<!-- Arrow keys move between the tabs; only following a tab's link opens it. -->
<Tabs.Root bind:value={() => current, () => {}} activationMode="manual" class="flex-1 gap-0">
	<!-- The banner and its tabs run edge to edge, out of the page's own margin. -->
	<div class="-mx-page -mt-page">
		<ClassroomBanner {classroom} />
	</div>
	<!-- The banner scrolls away; the tabs stay in reach at the top of the scroll region. -->
	<div
		class="sticky top-0 z-10 -mx-page [scrollbar-width:none] overflow-x-auto border-b bg-background px-page"
	>
		<Tabs.List
			variant="line"
			aria-label={m.classroom_sections()}
			class="gap-2 p-0 group-data-horizontal/tabs:h-12"
		>
			{#each sections as section (section.href)}
				<Tabs.Trigger
					value={section.href}
					class="h-full flex-none px-3 after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:text-primary"
				>
					{#snippet child({ props })}
						<a href={resolvePath(section.href)} {...props}>{section.label()}</a>
					{/snippet}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</div>
	<Tabs.Content value={current} class="flex flex-col gap-4 pt-page">
		{@render children()}
	</Tabs.Content>
</Tabs.Root>
