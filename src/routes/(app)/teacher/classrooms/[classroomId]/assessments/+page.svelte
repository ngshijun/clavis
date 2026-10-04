<script lang="ts">
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import PendingSection from '#lib/components/app/pending-section.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<PendingSection
	icon={ClipboardCheckIcon}
	title={m.section_assessments()}
	description={m.assessments_pending()}
/>
