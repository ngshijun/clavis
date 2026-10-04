<script lang="ts">
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, toggleMode } from 'mode-watcher';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<IconButton variant="ghost" label={m.toggle_theme()} onclick={toggleMode}>
	{#if mode.current === 'dark'}
		<SunIcon />
	{:else}
		<MoonIcon />
	{/if}
</IconButton>
