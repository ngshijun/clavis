<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import PendingSection from '#lib/components/app/pending-section.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { initials } from '#lib/initials.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	const student = $derived(data.student);
	const detail = $derived(
		[student.username, student.gradeLevelName].filter((part) => part !== null).join(' · ')
	);
</script>

<div class="flex flex-col gap-6">
	<div>
		<Button
			variant="outline"
			size="sm"
			href={resolve(`teacher/classrooms/${params.classroomId}/students`)}
		>
			<ArrowLeftIcon data-icon="inline-start" />
			{m.section_students()}
		</Button>
	</div>

	<div class="flex items-center gap-4">
		<Avatar.Root class="size-12">
			<Avatar.Fallback>{initials(student.name)}</Avatar.Fallback>
		</Avatar.Root>
		<div class="grid min-w-0">
			<h2 class="truncate text-xl font-semibold">{student.name}</h2>
			{#if detail}
				<p class="truncate text-sm text-muted-foreground">{detail}</p>
			{/if}
		</div>
	</div>

	<PendingSection icon={ChartColumnIcon} description={m.student_pending()} />
</div>
