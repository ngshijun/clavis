<script lang="ts">
	import { enhance } from '$app/forms';
	import FormRefusal from '#lib/components/app/form-refusal.svelte';
	import { settleForm, type FieldErrors } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { LearningPointSummary, TopicTree } from '#lib/learning-points.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Creates a learning point, or edits the one given: its name and the topics
	 * that offer it. Mounted while it is needed, so every opening starts
	 * afresh. The page it is on answers with the form action `create`, or
	 * `edit` for the one given.
	 */
	let {
		point,
		tree,
		onclosed
	}: {
		/** The learning point to edit; none to create one. */
		point?: LearningPointSummary;
		/** Every topic there is to choose from, under its subject and grade level. */
		tree: TopicTree;
		onclosed: () => void;
	} = $props();

	const copy = $derived(
		point
			? {
					title: m.learning_point_edit_title(),
					description: m.learning_point_edit_description(),
					submit: m.action_save()
				}
			: {
					title: m.learning_point_new_title(),
					description: m.learning_point_new_description(),
					submit: m.learning_point_create()
				}
	);

	// Read once: the dialog is made again for each learning point it edits.
	// svelte-ignore state_referenced_locally
	let topicIds = $state([...(point?.topicIds ?? [])]);

	/** The topics chosen, in the curriculum's order, each with the subject that says which it is. */
	const chosen = $derived(
		tree.flatMap((grade) =>
			grade.subjects.flatMap((subject) =>
				subject.topics
					.filter((topic) => topicIds.includes(topic.id))
					.map((topic) => ({ id: topic.id, name: topic.name, subject: subject.name }))
			)
		)
	);

	let open = $state(true);
	let submitting = $state(false);
	let errors = $state<FieldErrors>({});
	let refusal = $state<string | null>(null);
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{copy.title}</Dialog.Title>
			<Dialog.Description>{copy.description}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action={point ? '?/edit' : '?/create'}
			use:enhance={() => {
				submitting = true;
				return async ({ result }) => {
					const refused = await settleForm(result);
					submitting = false;
					// Taken, the list itself is the report: the row appears behind the dialog.
					if (!refused) open = false;
					else ({ errors, message: refusal } = refused);
				};
			}}
		>
			{#if point}
				<input type="hidden" name="id" value={point.id} />
			{/if}
			{#each topicIds as id (id)}
				<input type="hidden" name="topics" value={id} />
			{/each}

			<Field.FieldGroup>
				<FormRefusal message={refusal} />
				<Field.Field data-invalid={errors.name ? true : undefined}>
					<Field.FieldLabel for="learning-point-name">{m.row_name_label()}</Field.FieldLabel>
					<Input
						id="learning-point-name"
						name="name"
						autocomplete="off"
						maxlength={120}
						value={point?.name ?? ''}
						aria-invalid={errors.name ? true : undefined}
					/>
					<Field.FieldDescription>{m.learning_point_name_hint()}</Field.FieldDescription>
					<Field.FieldError errors={errors.name?.map((message) => ({ message }))} />
				</Field.Field>

				<Field.Field data-invalid={errors.topics ? true : undefined}>
					<Field.FieldLabel for="learning-point-topics">
						{m.learning_point_topics_label()}
					</Field.FieldLabel>
					<Select.Root type="multiple" bind:value={topicIds}>
						<Select.Trigger
							id="learning-point-topics"
							class="w-full"
							aria-invalid={errors.topics ? true : undefined}
						>
							{#if chosen.length === 0}
								<span class="text-muted-foreground">{m.learning_point_topics_placeholder()}</span>
							{:else}
								{m.count_topics({ count: chosen.length })}
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#each tree as grade (grade.id)}
								{#each grade.subjects as subject (subject.id)}
									{#if subject.topics.length > 0}
										<Select.Group>
											<Select.GroupHeading>{grade.name} · {subject.name}</Select.GroupHeading>
											{#each subject.topics as topic (topic.id)}
												<Select.Item value={topic.id} label={topic.name} />
											{/each}
										</Select.Group>
									{/if}
								{/each}
							{/each}
						</Select.Content>
					</Select.Root>
					<!-- The button says how many; which ones is said here, each with its subject. -->
					{#if chosen.length > 0}
						<ul class="flex flex-col gap-0.5 text-sm">
							{#each chosen as topic (topic.id)}
								<li class="wrap-break-word">
									{topic.name}
									<span class="text-muted-foreground">· {topic.subject}</span>
								</li>
							{/each}
						</ul>
					{/if}
					<Field.FieldError errors={errors.topics?.map((message) => ({ message }))} />
				</Field.Field>
			</Field.FieldGroup>

			<Dialog.Footer class="mt-6">
				<Button
					type="button"
					variant="outline"
					disabled={submitting}
					onclick={() => (open = false)}
				>
					{m.action_cancel()}
				</Button>
				<Button type="submit" disabled={submitting}>
					{#if submitting}
						<Spinner data-icon="inline-start" />
					{/if}
					{copy.submit}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
