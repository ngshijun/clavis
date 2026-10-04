<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { classroomsPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutData } from './$types';

	const user = $derived((page.data as LayoutData).user);
	const student = $derived(user.role === 'student');

	/** A 404 under a classroom address is a classroom the person cannot reach. */
	const unknownClassroom = $derived(page.status === 404 && page.params.classroomId !== undefined);
</script>

{#if unknownClassroom}
	<ClassroomEmpty
		description={student ? m.classroom_unknown_student() : m.classroom_unknown_staff()}
	>
		<Button variant="outline" href={resolve(classroomsPath(user.role))}>
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
