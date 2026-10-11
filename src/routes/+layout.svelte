<script lang="ts">
	import './layout.css';
	import { dev } from '$app/env';
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import DevTools from '#lib/components/app/dev-tools.svelte';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/*
	 * A new deploy while the tab is open: offer a reload, and take the next page change as a full
	 * load so the old build never fetches chunks that no longer exist. The toast stays until Reload
	 * is pressed, since a practice half done or a form half filled should not be thrown away on a
	 * timer. SvelteKit learns of the deploy from the server's answers and when the tab is looked
	 * at again, and asks once an hour besides.
	 */
	$effect(() => {
		if (!updated.current) return;
		toast(m.app_updated(), {
			id: 'app-updated',
			duration: Infinity,
			action: { label: m.action_reload(), onClick: () => location.reload() }
		});
	});

	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>

<svelte:head>
	<title>Clavis</title>
</svelte:head>

<ModeWatcher />
<!-- Any toast can be closed, and none runs out while the tab is out of sight. -->
<Toaster
	richColors
	closeButton
	closeButtonAriaLabel={m.action_close()}
	pauseWhenPageIsHidden
	position="top-right"
/>
{@render children()}
{#if dev}
	<DevTools />
{/if}
