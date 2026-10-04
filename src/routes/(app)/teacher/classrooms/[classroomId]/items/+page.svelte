<script lang="ts">
	import LibraryIcon from '@lucide/svelte/icons/library';
	import PendingSection from '#lib/components/app/pending-section.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<PendingSection icon={LibraryIcon} title={m.section_items()} description={m.items_pending()} />
