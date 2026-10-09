<script lang="ts">
	import { tick } from 'svelte';
	import type { ActionResult } from '$app/forms';
	import { resolve } from '$app/paths';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileIcon from '@lucide/svelte/icons/file';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';
	import { refusal as refusalOf } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { postAction, unanswered } from '#lib/form-actions.js';
	import { imagePaths, mapImagePaths, uploadKey } from '#lib/item-images.js';
	import {
		fileRefusal,
		pickedRefusal,
		type Candidates,
		type ImportReview
	} from '#lib/items/import.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { readyPictures, splitWorkbook } from '#lib/workbook.js';
	import Chip from './fields/chip.svelte';
	import { hint } from './styles.js';

	/**
	 * Importing an Excel workbook into the stage, in two steps. The first sends
	 * the file to be read and shows what it would add; the second adds it. The
	 * workbook is read on the server only: this page shows what comes back and
	 * hands the ready rows back.
	 *
	 * The pictures are the page's part. A workbook with pictures is too large
	 * to send whole, so the page takes them out before it sends the workbook,
	 * keeps them, and when the import is made uploads each one and writes where
	 * it was stored into the row that names it.
	 *
	 * Mounted while it is needed and unmounted once it has closed, so every
	 * opening starts at the first step.
	 *
	 * The dialog's corners are 26px. It pads 8px, so the drop zone against that
	 * inset has 18px corners; the figures stand 4px further in and have 14px
	 * ones. What is only words brings the rest of its own room (`px-4`).
	 */
	let {
		stage,
		onimported,
		onclosed
	}: {
		/** The name of the stage the questions go into. */
		stage: string;
		/** Brings the page up to date once questions were added. */
		onimported: () => Promise<void>;
		onclosed: () => void;
	} = $props();

	let open = $state(true);
	let busy = $state<'reading' | 'importing' | null>(null);
	let fileName = $state('');
	/** What the file would add. While there is none, the dialog is at its first step. */
	let review = $state.raw<ImportReview | null>(null);
	/** Why the file was not read, or the import not made. */
	let refusal = $state<string | null>(null);
	/** Whether a file is being dragged over the drop zone. */
	let over = $state(false);
	/** The pictures of the file that can be used, ready to upload, by their fingerprint. */
	let files = new Map<string, File>();
	/** How far the upload of the pictures has come, while there is one. */
	let progress = $state<{ done: number; total: number } | null>(null);

	let input = $state<HTMLInputElement | null>(null);
	let chooseButton = $state<HTMLElement | null>(null);
	let importButton = $state<HTMLElement | null>(null);
	let anotherButton = $state<HTMLElement | null>(null);

	/**
	 * A button that must wait is dimmed and stops answering, and is not
	 * disabled: a disabled button lets go of the focus, which would then leave
	 * the dialog.
	 */
	const waiting = 'aria-disabled:pointer-events-none aria-disabled:opacity-50';

	const ready = $derived(review?.rows.questions.length ?? 0);
	/** How many pictures come with the ready rows. Each row has its own, so each is counted by row. */
	const pictures = $derived(
		review
			? [...review.rows.passages, ...review.rows.questions].reduce(
					(count, row) => count + imagePaths(row).length,
					0
				)
			: 0
	);
	const figures = $derived(
		review && [
			{ key: 'ready', count: ready, label: m.practice_import_ready({ count: ready }) },
			{
				key: 'passages',
				count: review.passages,
				label: m.practice_import_passages({ count: review.passages })
			},
			{ key: 'duplicates', count: review.duplicates, label: m.practice_import_duplicates() },
			{
				key: 'problems',
				count: review.problems.length,
				label: m.practice_import_problems({ count: review.problems.length }),
				alarming: review.problems.length > 0
			}
		]
	);

	/**
	 * Sends a picked file to be read, without its pictures, and answers with
	 * what came back, or with why the file was not sent.
	 */
	async function read(file: File): Promise<ActionResult | string> {
		let parts: ReturnType<typeof splitWorkbook>;
		try {
			parts = splitWorkbook(new Uint8Array(await file.arrayBuffer()));
		} catch {
			return m.practice_import_unreadable();
		}
		const workbook = new File([parts.workbook], file.name);
		// Asked here too, so a workbook far too large is refused in our words and not by the host's limit.
		const refused = fileRefusal(workbook);
		if (refused) return refused;

		const usable = await readyPictures(parts.media);
		files = new Map(Array.from(usable.values(), (picture) => [picture.mark, picture.file]));
		const form = new FormData();
		form.set('file', workbook);
		form.set(
			'pictures',
			JSON.stringify(Object.fromEntries(Array.from(usable, ([name, { mark }]) => [name, mark])))
		);
		return postAction('?/review', form);
	}

	async function choose(file: File | undefined) {
		if (!file || busy) return;
		refusal = pickedRefusal(file);
		if (refusal) return;

		fileName = file.name;
		busy = 'reading';
		let result: ActionResult | string;
		try {
			result = await read(file);
		} catch {
			result = m.error_unexpected();
		}
		busy = null;

		if (typeof result === 'string') {
			refusal = result;
		} else if (result.type === 'success' && result.data?.review) {
			review = result.data.review as ImportReview;
			// The button that had the focus has gone with the first step.
			await tick();
			(importButton ?? anotherButton)?.focus();
		} else {
			refusal = refusalOf(result) ?? m.error_unexpected();
		}
	}

	async function another() {
		if (busy) return;
		review = null;
		refusal = null;
		await tick();
		chooseButton?.focus();
	}

	/** Stores one picture a row names for the stage, and answers with where; null if it could not be. */
	async function upload(named: string): Promise<string | null> {
		const file = files.get(uploadKey(named) ?? '');
		if (!file) return null;
		const form = new FormData();
		form.set('file', file);
		const result = await postAction('?/picture', form);
		return result.type === 'success' && typeof result.data?.path === 'string'
			? result.data.path
			: null;
	}

	/**
	 * The ready rows with every picture stored and named by where it is, or
	 * null if one could not be stored. A stored picture belongs to one row, so
	 * each row gets its own. Four rows are seen to at a time. Where each
	 * picture went is noted in `uploaded` as it goes.
	 */
	async function withPictures(rows: Candidates, uploaded: string[]): Promise<Candidates | null> {
		const all = [...rows.passages, ...rows.questions];
		const stored = [...all];
		let next = 0;
		let failed = false;
		const worker = async () => {
			while (!failed && next < all.length) {
				const index = next++;
				const placed: Record<string, string> = {};
				for (const named of imagePaths(all[index])) {
					const path = await upload(named);
					if (path === null) {
						failed = true;
						return;
					}
					uploaded.push(path);
					placed[named] = path;
					if (progress) progress.done += 1;
				}
				stored[index] = mapImagePaths(all[index], (named) => placed[named] ?? named);
			}
		};
		await Promise.all(Array.from({ length: 4 }, worker));
		if (failed) return null;

		const passages = rows.passages.length;
		return {
			passages: stored.slice(0, passages) as Candidates['passages'],
			questions: stored.slice(passages) as Candidates['questions']
		};
	}

	/** Has the pictures stored for an import that was not made removed again. */
	async function discard(paths: string[]) {
		if (paths.length === 0) return;
		const form = new FormData();
		for (const path of paths) form.append('paths', path);
		await postAction('?/discard', form);
	}

	async function add() {
		if (!review || busy) return;
		busy = 'importing';
		refusal = null;
		if (pictures > 0) progress = { done: 0, total: pictures };
		const uploaded: string[] = [];
		// Whatever becomes of the import, the dialog answers again afterwards.
		try {
			const rows = await withPictures(review.rows, uploaded);
			if (!rows) {
				refusal = m.practice_import_picture_failed();
				await discard(uploaded);
				return;
			}
			const form = new FormData();
			form.set('rows', JSON.stringify(rows));
			const result = await postAction('?/import', form);
			if (result.type === 'success' && typeof result.data?.added === 'number') {
				const added = result.data.added;
				await onimported();
				open = false;
				// Nothing is added when the same review is sent twice: the stage has it all by then.
				if (added > 0) toast.success(m.practice_import_done({ count: added }));
				else toast.info(m.practice_import_done_none());
			} else {
				refusal = refusalOf(result) ?? m.error_unexpected();
				// With no answer the import may yet go through, and its pictures are then its questions'.
				if (!unanswered(result)) await discard(uploaded);
			}
		} finally {
			busy = null;
			progress = null;
		}
	}
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<!-- While a file is on its way the dialog stays, so its answer has somewhere to arrive. -->
	<Dialog.Content
		class="p-2 sm:max-w-135"
		showCloseButton={!busy}
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		interactOutsideBehavior={busy ? 'ignore' : 'close'}
	>
		<Dialog.Header class="px-4 pt-4">
			<Dialog.Title>{m.practice_import_title()}</Dialog.Title>
			<Dialog.Description>{m.practice_import_description({ stage })}</Dialog.Description>
		</Dialog.Header>

		{#if !review}
			<div class="flex flex-col gap-3">
				<div
					role="group"
					aria-label={m.practice_import_drop()}
					class={cn(
						'flex min-h-37 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4 text-center transition-colors',
						over && 'border-primary bg-accent'
					)}
					ondragover={(event) => {
						event.preventDefault();
						over = true;
					}}
					ondragleave={() => (over = false)}
					ondrop={(event) => {
						event.preventDefault();
						over = false;
						choose(event.dataTransfer?.files[0]);
					}}
				>
					<span
						class="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground"
					>
						{#if busy}
							<Spinner class="size-5" />
						{:else}
							<UploadIcon class="size-5" aria-hidden="true" />
						{/if}
					</span>
					<span class="font-medium wrap-anywhere" aria-live="polite">
						{busy ? m.practice_import_reading({ name: fileName }) : m.practice_import_drop()}
					</span>
					<Button
						bind:ref={chooseButton}
						variant="outline"
						size="sm"
						aria-disabled={busy !== null}
						class={waiting}
						onclick={() => busy || input?.click()}
					>
						{m.practice_import_choose()}
					</Button>
					<input
						bind:this={input}
						type="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						hidden
						onchange={(event) => {
							const [file] = event.currentTarget.files ?? [];
							// Emptied, so that choosing the same file again, once it is fixed, is a change.
							event.currentTarget.value = '';
							choose(file);
						}}
					/>
				</div>
				<div class="px-4">
					<!-- A plain download: the router leaves a link with `download` to the browser. -->
					<Button
						variant="ghost"
						size="sm"
						href={resolve('admin/practice/import-template.xlsx')}
						download
					>
						<DownloadIcon data-icon="inline-start" />
						{m.practice_import_template()}
					</Button>
				</div>
				<ul class={cn(hint, 'flex list-disc flex-col gap-1 ps-8.5 pe-4')}>
					<li>{m.practice_import_note_sheets()}</li>
					<li>{m.practice_import_note_passages()}</li>
					<li>{m.practice_import_note_pictures()}</li>
				</ul>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				<div class="flex items-center gap-1.5 px-4">
					<Chip class="min-w-0 shrink">
						<FileIcon class="size-3 shrink-0" aria-hidden="true" />
						<span class="truncate">{fileName}</span>
					</Chip>
					<Button
						bind:ref={anotherButton}
						variant="ghost"
						size="sm"
						aria-disabled={busy !== null}
						class={waiting}
						onclick={another}
					>
						{m.practice_import_choose_another()}
					</Button>
				</div>

				<dl class="grid grid-cols-[repeat(auto-fit,minmax(6.25rem,1fr))] gap-2 px-1">
					{#each figures ?? [] as figure (figure.key)}
						<!-- The number is read before what it counts, and stands above it. -->
						<div class="flex flex-col-reverse justify-end rounded-xl bg-background px-3 py-2.5">
							<dt class={hint}>{figure.label}</dt>
							<dd
								class={cn(
									'text-xl leading-tight font-semibold tabular-nums',
									figure.alarming && 'text-destructive'
								)}
							>
								{figure.count}
							</dd>
						</div>
					{/each}
				</dl>

				{#if pictures > 0}
					<p class={cn(hint, 'px-4')} aria-live="polite">
						{progress
							? m.practice_import_uploading(progress)
							: m.practice_import_pictures({ count: pictures })}
					</p>
				{/if}

				{#if review.problems.length > 0}
					<ul aria-label={m.practice_import_problems_label()} class="max-h-52 overflow-y-auto px-4">
						{#each review.problems as problem (`${problem.sheet}:${problem.row}`)}
							<li class="flex gap-3 border-t py-2.5 first:border-t-0">
								<span class="w-40 shrink-0 font-medium">
									{m.practice_import_row({ sheet: problem.sheet, row: problem.row })}
								</span>
								<span class="min-w-0 wrap-anywhere text-muted-foreground">{problem.reason}</span>
							</li>
						{/each}
					</ul>
				{/if}

				<p class={cn(hint, 'px-4')}>{m.practice_import_left_out()}</p>
			</div>
		{/if}

		{#if refusal}
			<p role="alert" class="px-4 text-sm text-destructive">{refusal}</p>
		{/if}

		<Dialog.Footer class="px-4 pb-4">
			<Button
				variant="outline"
				aria-disabled={busy !== null}
				class={waiting}
				onclick={() => busy || (open = false)}
			>
				{m.action_cancel()}
			</Button>
			{#if ready > 0}
				<Button bind:ref={importButton} aria-disabled={busy !== null} class={waiting} onclick={add}>
					{#if busy === 'importing'}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.practice_import_submit({ count: ready })}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
