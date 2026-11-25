<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
</script>

<!--
	An address that is no page of the app, or a failure before the person's own pages could be
	drawn. The way on is the sign-in page, which sends whoever is signed in to their home and lets a visitor
	sign in.
-->
<div class="flex min-h-dvh items-center justify-center p-4">
	<EmptyState
		icon={CircleAlertIcon}
		title={String(page.status)}
		description={page.status === 404 ? m.error_not_found() : m.error_unexpected()}
	>
		<Button variant="outline" href={resolve('/login')}>{m.error_go_home()}</Button>
	</EmptyState>
</div>
