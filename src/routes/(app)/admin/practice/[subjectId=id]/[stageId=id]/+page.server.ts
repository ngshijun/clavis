import { error, fail } from '@sveltejs/kit';
import * as z from 'zod';
import { checkCandidates, planImport, type ImportReview, type Stored } from '#lib/items/import.js';
import { MAX_ENTRIES } from '#lib/items/limits.js';
import { DIFFICULTIES } from '#lib/items/payload.js';
import { validateItem, type ItemIssue } from '#lib/items/schema.js';
import { stageTrail } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { validatePassage } from '#lib/passage.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import { postedPictures } from '#lib/server/images.js';
import {
	deletePassage,
	deleteQuestion,
	duplicateQuestion,
	getStage,
	importRows,
	QUESTION_ORDERS,
	reorderPassageQuestions,
	reorderStageEntries,
	savePassage,
	saveQuestion,
	setLearningPoints,
	setQuestionOrder
} from '#lib/server/practice.js';
import { readWorkbook } from '#lib/server/workbook.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * One stage's questions and the builder. Only an admin reaches the page, and
 * the database lets only an admin write a question, so the actions check what
 * was posted and leave who may post it to row level security.
 *
 * The load does not read the address's query: which question is open is the
 * page's own business, so opening another one fetches nothing.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const stage = await getStage(locals.supabase, params.subjectId, params.stageId);
	if (!stage) error(404, 'Stage not found');

	return { stage, trail: stageTrail(stage), title: stage.name };
};

const orderSchema = z.object({ order: z.enum(QUESTION_ORDERS) });
const ids = z.array(z.guid()).min(1);
const reorderSchema = z.discriminatedUnion('kind', [
	/** The stage's one sequence: its passages and its questions on no passage. */
	z.object({ kind: z.literal('entry'), ids }),
	/** The questions of one passage, which is the parent. */
	z.object({ kind: z.literal('passage'), parentId: z.guid(), ids })
]);
const questionSchema = z.object({ kind: z.literal('question'), id: z.guid() });
const rowSchema = z.object({ kind: z.enum(['question', 'passage']), id: z.guid() });
const saveSchema = z.object({
	id: z.guid().optional(),
	passageId: z.guid().optional(),
	difficulty: z.enum(DIFFICULTIES),
	/** The question itself, as JSON. */
	payload: z.string(),
	/** The tags the question is to have. */
	learningPoints: z.array(z.guid()).max(MAX_ENTRIES)
});
const savePassageSchema = z.object({
	id: z.guid().optional(),
	/** The passage's title, text and picture, as JSON. */
	passage: z.string()
});
/**
 * What a Save posted, checked again as if the editor had not: the JSON under
 * `written`, which `validate` finds complete and tidies, and the file of each
 * picture it names as `upload:<key>`. A refusal to answer with comes back
 * instead when it cannot be read, is not complete, or a picture is missing or
 * is not one the bucket takes.
 */
async function readSave<T>(
	form: FormData,
	written: string,
	validate: (posted: unknown) => { value: T } | { issues: ItemIssue[] },
	unreadable: () => string
) {
	let posted: unknown;
	try {
		posted = JSON.parse(written);
	} catch {
		return fail(400, { message: unreadable() });
	}
	const checked = validate(posted);
	if ('issues' in checked) {
		return fail(400, { message: checked.issues[0]?.message ?? unreadable() });
	}
	const pictures = await postedPictures(checked.value, form);
	if (!pictures) return fail(400, { message: m.image_invalid() });
	return { value: checked.value, pictures };
}

/**
 * What the stage holds now, as an import looks at it: the questions a row may
 * repeat and the passages a row's passage may already be.
 */
async function storedIn({ locals, params }: RequestEvent): Promise<Stored> {
	const stage = await getStage(locals.supabase, params.subjectId, params.stageId);
	if (!stage) error(404, 'Stage not found');
	const passages = stage.entries.filter((entry) => entry.kind === 'passage');
	return {
		questions: stage.entries.flatMap((entry) =>
			entry.kind === 'passage' ? entry.questions.map((each) => each.payload) : [entry.payload]
		),
		passages: passages.map(({ id, title, body }) => ({ id, title, body }))
	};
}

export const actions: Actions = {
	/** Whether pupils get the questions in the builder's order or shuffled. */
	order: async ({ request, locals, params }) => {
		const parsed = orderSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			await setQuestionOrder(locals.supabase, params.stageId, parsed.data.order);
		} catch (cause) {
			return unexpected(cause);
		}
	},

	reorder: async ({ request, locals, params }) => {
		const form = await request.formData();
		const parsed = reorderSchema.safeParse({ ...formValues(form), ids: form.getAll('ids') });
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			if (parsed.data.kind === 'entry') {
				await reorderStageEntries(locals.supabase, params.stageId, parsed.data.ids);
			} else {
				await reorderPassageQuestions(
					locals.supabase,
					params.stageId,
					parsed.data.parentId,
					parsed.data.ids
				);
			}
		} catch (cause) {
			return unexpected(cause);
		}
	},

	/**
	 * Writes a question, new or changed, and answers with its id. The editor
	 * has checked it already; it is checked again here, because this is where
	 * it is stored from. A picture picked in the editor arrives as a file under
	 * the key its `upload:<key>` names.
	 *
	 * Its learning points are rows of their own and nothing here writes the two
	 * as one, so the question is written first: if its learning points then
	 * fail, the question is kept, and the answer says so and still names it.
	 */
	save: async ({ request, locals, params }) => {
		const form = await request.formData();
		const parsed = saveSchema.safeParse({
			...formValues(form),
			learningPoints: form.getAll('learningPoints')
		});
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });

		const saved = await readSave(
			form,
			parsed.data.payload,
			(posted) => {
				const checked = validateItem(posted);
				return checked.ok ? { value: checked.payload } : checked;
			},
			() => m.item_invalid()
		);
		if (!('pictures' in saved)) return saved;

		let id: string;
		try {
			id = await saveQuestion(
				locals.supabase,
				params.stageId,
				{
					id: parsed.data.id ?? null,
					passageId: parsed.data.passageId ?? null,
					difficulty: parsed.data.difficulty,
					payload: saved.value
				},
				saved.pictures
			);
		} catch (cause) {
			return unexpected(cause);
		}
		try {
			await setLearningPoints(locals.supabase, params.stageId, id, parsed.data.learningPoints);
		} catch (cause) {
			console.error(cause);
			return fail(500, { message: m.practice_learning_points_not_saved(), id });
		}
		return { id };
	},

	/**
	 * Writes a passage, new or changed, and answers with its id. It is checked
	 * and its picture arrives as a question's are; see `save`.
	 */
	savePassage: async ({ request, locals, params }) => {
		const form = await request.formData();
		const parsed = savePassageSchema.safeParse(formValues(form));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });

		const saved = await readSave(
			form,
			parsed.data.passage,
			(posted) => {
				const checked = validatePassage(posted);
				return checked.ok ? { value: checked.content } : checked;
			},
			() => m.error_unexpected()
		);
		if (!('pictures' in saved)) return saved;

		try {
			const id = await savePassage(
				locals.supabase,
				params.stageId,
				{ id: parsed.data.id ?? null, content: saved.value },
				saved.pictures
			);
			return { id };
		} catch (cause) {
			return unexpected(cause);
		}
	},

	/** Deletes a question, or a passage with every question on it. */
	delete: async ({ request, locals, params }) => {
		const parsed = rowSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			if (parsed.data.kind === 'question') {
				await deleteQuestion(locals.supabase, params.stageId, parsed.data.id);
			} else {
				await deletePassage(locals.supabase, params.stageId, parsed.data.id);
			}
		} catch (cause) {
			return unexpected(cause);
		}
	},

	/**
	 * The first step of an import: reads the workbook and answers with what
	 * importing it would add, and which rows need fixing first. Nothing is
	 * written.
	 */
	review: async (event) => {
		const file = (await event.request.formData()).get('file');
		if (!(file instanceof File)) return fail(400, { message: m.error_unexpected() });
		const read = await readWorkbook(file);
		if (!read.ok) return fail(400, { message: read.message });

		const plan = planImport(read.candidates, await storedIn(event));
		const review: ImportReview = {
			rows: plan.kept,
			passages: plan.passages.length,
			duplicates: plan.duplicates,
			problems: read.problems
		};
		return { review };
	},

	/**
	 * The second step: adds the rows the review found ready, which the page
	 * posts back. They are checked again as if never seen, and what they add is
	 * worked out again from the stage as it is now, so neither an edited page
	 * nor a second press of the button adds a question twice. Answers with how
	 * many questions were added.
	 */
	import: async (event) => {
		let posted: unknown;
		try {
			posted = JSON.parse(String((await event.request.formData()).get('rows')));
		} catch {
			return fail(400, { message: m.practice_import_stale() });
		}
		const candidates = checkCandidates(posted);
		if (!candidates) return fail(400, { message: m.practice_import_stale() });

		const plan = planImport(candidates, await storedIn(event));
		try {
			return { added: await importRows(event.locals.supabase, event.params.stageId, plan) };
		} catch (cause) {
			console.error(cause);
			return fail(500, { message: m.practice_import_failed() });
		}
	},

	/**
	 * Copies a question to the end of its sequence, which is its passage's if it
	 * is on one, and answers with the copy's id.
	 */
	duplicate: async ({ request, locals, params }) => {
		const parsed = questionSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			return { id: await duplicateQuestion(locals.supabase, params.stageId, parsed.data.id) };
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
