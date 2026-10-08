<script lang="ts">
	import './layout.css';
	import { dev } from '$app/env';
	import { ModeWatcher } from 'mode-watcher';
	import DevTools from '#lib/components/app/dev-tools.svelte';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>Clavis</title>
</svelte:head>

<ModeWatcher />
<Toaster richColors position="top-right" />
{@render children()}
{#if dev}
	<DevTools />
{/if}
