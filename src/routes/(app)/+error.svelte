<script lang="ts">
	import { page } from '$app/state';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import { homePath } from '#lib/roles.js';
	import type { LayoutData } from './$types';

	const layout = $derived(page.data as LayoutData);
	const user = $derived(layout.user);
	const student = $derived(user.role === 'student');
	const home = $derived(resolvePath(homePath(user.role)));

	/**
	 * A 404 naming a classroom the person cannot reach. One naming a classroom
	 * they can reach is a missing page inside it, and gets the plain message.
	 */
	const unknownClassroom = $derived(
		page.status === 404 &&
			page.params.classroomId !== undefined &&
			!layout.classrooms.some((classroom) => classroom.id === page.params.classroomId)
	);
</script>

<!-- Whatever went wrong, the page offers the way back to the person's home, their dashboard. -->
{#snippet goHome()}
	<Button variant="outline" href={home}>{m.error_go_home()}</Button>
{/snippet}

{#if unknownClassroom}
	<EmptyState
		icon={SchoolIcon}
		description={student ? m.classroom_unknown_student() : m.classroom_unknown_staff()}
	>
		{@render goHome()}
	</EmptyState>
{:else}
	<EmptyState
		icon={CircleAlertIcon}
		title={String(page.status)}
		description={page.status === 404 ? m.error_not_found() : m.error_unexpected()}
	>
		{@render goHome()}
	</EmptyState>
{/if}
