<script lang="ts">
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PendingSection from '#lib/components/app/pending-section.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<PendingSection icon={FileTextIcon} title={m.section_papers()} description={m.papers_pending()} />
