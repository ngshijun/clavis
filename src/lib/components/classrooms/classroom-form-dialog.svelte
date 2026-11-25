<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import XIcon from '@lucide/svelte/icons/x';
	import FormDialog from '#lib/components/app/form-dialog.svelte';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import PicturePicker from '#lib/components/app/picture-picker.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
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

	let gradeLevelId = $state(initial?.gradeLevelId ?? '');
	let subjectId = $state(initial?.subjectId ?? '');
	// The subjects on offer belong to the chosen grade level.
	const gradeLevel = $derived(gradeLevels.find((grade) => grade.id === gradeLevelId));
	const subject = $derived(gradeLevel?.subjects.find((item) => item.id === subjectId));

	let picker = $state<PicturePicker>();
	/** The picture picked as the new cover, ready to upload, and the address it is shown from. */
	let picked = $state<{ file: File; url: string } | null>(null);
	let removeCover = $state(false);
	const coverPreview = $derived(picked?.url ?? (removeCover ? null : (initial?.coverUrl ?? null)));

	onDestroy(() => {
		if (picked) URL.revokeObjectURL(picked.url);
	});

	function pickCover(file: File) {
		if (picked) URL.revokeObjectURL(picked.url);
		picked = { file, url: URL.createObjectURL(file) };
	}

	function clearCover() {
		if (picked) URL.revokeObjectURL(picked.url);
		picked = null;
		removeCover = true;
	}
</script>

<!-- Taken, the card itself is the report: it appears, or changes, behind the dialog. -->
<FormDialog
	title={initial ? m.form_edit_title() : m.form_create_title()}
	description={initial ? m.form_edit_description() : m.form_create_description()}
	action="?/save"
	submit={initial ? m.action_save() : m.form_create_title()}
	enctype="multipart/form-data"
	prepare={(form) => {
		if (picked) form.set('cover', picked.file);
	}}
	{onclosed}
>
	{#snippet fields(errors)}
		{#if initial}
			<input type="hidden" name="id" value={initial.id} />
		{/if}
		<input type="hidden" name="removeCover" value={removeCover} />

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
		<Field.Field
			aria-labelledby="classroom-cover-label"
			data-invalid={errors.cover ? true : undefined}
		>
			<Field.FieldTitle id="classroom-cover-label">{m.form_cover_label()}</Field.FieldTitle>
			{#if coverPreview}
				<div class="relative overflow-hidden rounded-2xl border bg-muted">
					<img src={coverPreview} alt="" class="h-28 w-full object-cover" />
					<IconButton
						variant="secondary"
						class="absolute end-2 top-2"
						label={m.form_cover_remove()}
						onclick={clearCover}
					>
						<XIcon />
					</IconButton>
				</div>
			{/if}
			<!-- Picked with the app's own picker, which hands over a picture ready to upload:
			     it is held here and posted with the form as `cover`. -->
			<PicturePicker bind:this={picker} onpick={pickCover} />
			<Button
				variant="outline"
				aria-invalid={errors.cover ? true : undefined}
				onclick={() => picker?.open()}
			>
				{#if coverPreview}
					<ImageUpIcon data-icon="inline-start" />
					{m.image_replace()}
				{:else}
					<ImagePlusIcon data-icon="inline-start" />
					{m.practice_image_add()}
				{/if}
			</Button>
			<Field.FieldError errors={errors.cover?.map((message) => ({ message }))} />
		</Field.Field>
	{/snippet}
</FormDialog>
