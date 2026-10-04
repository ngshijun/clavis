<script lang="ts">
	import ClassroomCover from '#lib/components/classrooms/classroom-cover.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	/** The head of every page inside a classroom: which classroom this is. */
	let { classroom }: { classroom: Classroom } = $props();

	const detail = $derived(
		[
			classroom.gradeLevelName,
			classroom.subjectName,
			classroom.counts && m.count_students({ count: classroom.counts.students })
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<!-- As tall as its text needs: a long name wraps on a phone, and the cover grows with it. -->
<header class="relative">
	<ClassroomCover {classroom} class="absolute inset-0 size-full" />
	<!-- A cover can be any picture, so the name sits on a scrim rather than on the picture. -->
	<div
		class="relative flex min-h-40 flex-col justify-end gap-1 bg-linear-to-t from-black/70 to-black/10 px-page py-5 text-white"
	>
		<h1 class="text-3xl leading-tight font-bold wrap-break-word">{classroom.name}</h1>
		<p>{detail}</p>
	</div>
</header>
