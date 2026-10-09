<script lang="ts">
	import { page } from '$app/state';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import { homePath } from '#lib/roles.js';
	import type { LayoutData } from './$types';

	const layout = $derived(page.data as LayoutData);
	const user = $derived(layout.user);
	const student = $derived(user.role === 'student');

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

{#if unknownClassroom}
	<ClassroomEmpty
		description={student ? m.classroom_unknown_student() : m.classroom_unknown_staff()}
	>
		<Button variant="outline" href={resolvePath(homePath(user.role))}>
			{student ? m.classroom_back_student() : m.classroom_back_staff()}
		</Button>
	</ClassroomEmpty>
{:else}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>{page.status}</Empty.Title>
			<Empty.Description>
				{page.status === 404 ? m.error_not_found() : m.error_unexpected()}
			</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
