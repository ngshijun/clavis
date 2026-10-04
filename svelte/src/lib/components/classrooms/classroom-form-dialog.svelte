<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { optimizeImage } from '#lib/image.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom, GradeLevelOption } from '#lib/server/classrooms.js';

	/**
	 * Mounted while it is needed and unmounted once it has closed, so every
	 * opening starts from the classroom it was given rather than from whatever
	 * the last one left behind.
	 */
	let {
		classroom,
		gradeLevels,
		onclosed
	}: {
		/** The classroom being edited; null to create one. */
		classroom: Classroom | null;
		gradeLevels: GradeLevelOption[];
		onclosed: () => void;
	} = $props();

	// The form's working copy, seeded once from the classroom this dialog was opened for.
	const initial = untrack(() => classroom);

	let open = $state(true);
	let submitting = $state(false);
	let errors = $state<Record<string, string[] | undefined>>({});

	let gradeLevelId = $state(initial?.gradeLevelId ?? '');
	let subjectId = $state(initial?.subjectId ?? '');
	// The subjects on offer belong to the chosen grade level.
	const gradeLevel = $derived(gradeLevels.find((grade) => grade.id === gradeLevelId));
	const subject = $derived(gradeLevel?.subjects.find((item) => item.id === subjectId));

	let coverInput = $state<HTMLElement | null>(null);
	let pickedCover = $state<string | null>(null);
	let removeCover = $state(false);
	const coverPreview = $derived(pickedCover ?? (removeCover ? null : (initial?.coverUrl ?? null)));

	onDestroy(() => {
		if (pickedCover) URL.revokeObjectURL(pickedCover);
	});

	function pickCover(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		if (pickedCover) URL.revokeObjectURL(pickedCover);
		pickedCover = URL.createObjectURL(file);
	}

	function clearCover() {
		if (pickedCover) URL.revokeObjectURL(pickedCover);
		pickedCover = null;
		removeCover = true;
		if (coverInput instanceof HTMLInputElement) coverInput.value = '';
	}
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{initial ? m.form_edit_title() : m.form_create_title()}</Dialog.Title>
			<Dialog.Description>
				{initial ? m.form_edit_description() : m.form_create_description()}
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/save"
			enctype="multipart/form-data"
			use:enhance={async ({ formData, cancel }) => {
				submitting = true;
				const cover = formData.get('cover');
				if (cover instanceof File && cover.size > 0) {
					try {
						formData.set('cover', await optimizeImage(cover));
					} catch {
						// A file the browser cannot decode, such as a HEIC photo or a damaged image.
						errors = { cover: [m.form_cover_invalid()] };
						submitting = false;
						cancel();
						return;
					}
				}
				return async ({ result, update }) => {
					await update({ reset: false });
					submitting = false;
					if (result.type === 'success') {
						toast.success(initial ? m.form_updated() : m.form_created());
						open = false;
					} else if (result.type === 'failure') {
						errors = (result.data?.errors as typeof errors | undefined) ?? {};
						if (typeof result.data?.message === 'string') toast.error(result.data.message);
					}
				};
			}}
		>
			{#if initial}
				<input type="hidden" name="id" value={initial.id} />
			{/if}
			<input type="hidden" name="removeCover" value={removeCover} />

			<Field.FieldGroup>
				<Field.Field data-invalid={errors.gradeLevelId ? true : undefined}>
					<Field.FieldLabel for="classroom-grade">{m.form_grade_label()}</Field.FieldLabel>
					<Select.Root
						type="single"
						name="gradeLevelId"
						bind:value={gradeLevelId}
						onValueChange={() => (subjectId = '')}
					>
						<Select.Trigger
							id="classroom-grade"
							class="w-full"
							aria-invalid={errors.gradeLevelId ? true : undefined}
						>
							{gradeLevel?.name ?? m.form_grade_placeholder()}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								{#each gradeLevels as grade (grade.id)}
									<Select.Item value={grade.id} label={grade.name} />
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					<Field.FieldError errors={errors.gradeLevelId?.map((message) => ({ message }))} />
				</Field.Field>

				<Field.Field data-invalid={errors.subjectId ? true : undefined}>
					<Field.FieldLabel for="classroom-subject">{m.form_subject_label()}</Field.FieldLabel>
					<Select.Root type="single" name="subjectId" bind:value={subjectId} disabled={!gradeLevel}>
						<Select.Trigger
							id="classroom-subject"
							class="w-full"
							aria-invalid={errors.subjectId ? true : undefined}
						>
							{subject?.name ?? m.form_subject_placeholder()}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								{#each gradeLevel?.subjects ?? [] as item (item.id)}
									<Select.Item value={item.id} label={item.name} />
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					<Field.FieldError errors={errors.subjectId?.map((message) => ({ message }))} />
				</Field.Field>

				<Field.Field data-invalid={errors.name ? true : undefined}>
					<Field.FieldLabel for="classroom-name">{m.form_name_label()}</Field.FieldLabel>
					<Input
						id="classroom-name"
						name="name"
						value={initial?.name ?? ''}
						placeholder={m.form_name_placeholder()}
						aria-invalid={errors.name ? true : undefined}
					/>
					<Field.FieldError errors={errors.name?.map((message) => ({ message }))} />
				</Field.Field>

				<!-- What tells two same-grade, same-subject classes apart on the cards. Optional:
				     without one the card falls back to a tint. -->
				<Field.Field data-invalid={errors.cover ? true : undefined}>
					<Field.FieldLabel for="classroom-cover">{m.form_cover_label()}</Field.FieldLabel>
					{#if coverPreview}
						<div class="relative overflow-hidden rounded-md border bg-muted">
							<img src={coverPreview} alt="" class="h-28 w-full object-cover" />
							<Button
								type="button"
								variant="secondary"
								size="icon-sm"
								class="absolute top-2 right-2"
								aria-label={m.form_cover_remove()}
								onclick={clearCover}
							>
								<XIcon />
							</Button>
						</div>
					{/if}
					<Input
						bind:ref={coverInput}
						id="classroom-cover"
						name="cover"
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						aria-invalid={errors.cover ? true : undefined}
						onchange={pickCover}
					/>
					<Field.FieldError errors={errors.cover?.map((message) => ({ message }))} />
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
					{initial ? m.action_save() : m.form_create()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
