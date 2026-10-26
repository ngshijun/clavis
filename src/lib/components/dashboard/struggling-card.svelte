<script lang="ts">
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { Struggling } from '#lib/items/dashboard.js';
	import { initials } from '#lib/initials.js';
	import { studentPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import { percent } from './percent.js';

	/**
	 * The students whose average is below half, the lowest first, each with
	 * the learning points they find hardest. Each opens the student's page in
	 * the classroom they are struggling in. The classroom is named only when
	 * there are several.
	 */
	let {
		students,
		classroomNames
	}: {
		students: Struggling[];
		/** The names of the classrooms, by id, when the dashboard sums up several. */
		classroomNames: Map<string, string> | undefined;
	} = $props();

	/** As many as are shown before the rest are asked for. */
	const FEW = 5;

	let all = $state(false);
	const listed = $derived(all ? students : students.slice(0, FEW));
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.dashboard_struggling_title()}</Card.Title>
		<Card.Description>{m.dashboard_struggling_description()}</Card.Description>
		{#if students.length > 0}
			<Card.Action>
				<Badge variant="destructive">{students.length}</Badge>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-1">
		{#if students.length === 0}
			<p class="text-muted-foreground">{m.dashboard_struggling_empty()}</p>
		{:else}
			<ul class="-mx-2 flex flex-col">
				{#each listed as student (`${student.classroomId}:${student.studentId}`)}
					<li>
						<a
							href={resolvePath(studentPath(student.classroomId, student.studentId))}
							class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							<Avatar.Root class="size-8">
								<Avatar.Fallback class="text-xs">{initials(student.name)}</Avatar.Fallback>
							</Avatar.Root>
							<span class="flex min-w-0 flex-1 flex-col gap-1">
								<span class="flex min-w-0 flex-col leading-tight">
									<span class="truncate font-medium">{student.name}</span>
									{#if classroomNames}
										<span class="truncate text-xs text-muted-foreground">
											{classroomNames.get(student.classroomId)}
										</span>
									{/if}
								</span>
								{#if student.weakest.length > 0}
									<span class="flex flex-wrap gap-1">
										{#each student.weakest as name (name)}
											<Badge variant="destructive" class="max-w-full">
												<span class="truncate first-letter:uppercase">{name}</span>
											</Badge>
										{/each}
									</span>
								{/if}
							</span>
							<span class="font-bold text-destructive tabular-nums">{percent(student.average)}</span
							>
						</a>
					</li>
				{/each}
			</ul>
			{#if students.length > FEW}
				<Button variant="link" size="sm" class="self-start px-0" onclick={() => (all = !all)}>
					{all
						? m.dashboard_points_show_fewer()
						: m.dashboard_struggling_more({ count: students.length - FEW })}
				</Button>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
