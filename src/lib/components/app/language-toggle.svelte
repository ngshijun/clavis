<script lang="ts">
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, setLocale } from '#lib/paraglide/runtime.js';
</script>

<IconButton
	variant="ghost"
	label={m.toggle_language()}
	onclick={() => setLocale(getLocale() === 'en' ? 'zh' : 'en')}
>
	<LanguagesIcon />
</IconButton>
