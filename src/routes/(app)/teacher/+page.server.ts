import { fail, redirect } from '@sveltejs/kit';
import * as z from 'zod';
import { assignmentPath } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { resolvePath } from '#lib/paths.js';
import {
	averagesOf,
	bandsOf,
	classroomSummaryOf,
	peopleOf,
	pointsOf,
	progressOf,
	starTallyOf,
	strugglingOf
} from '#lib/items/dashboard.js';
import { listAssignments, markNotificationsSeen } from '#lib/server/assignments.js';
import {
	listActivity,
	listEnrolments,
	listPointScores,
	listStageBests,
	listWeeks
} from '#lib/server/dashboard.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * The teacher's home: how their classrooms are doing, all of them or the one
 * the address names. Everything is worked out here from what the database
 * hands over, and only what the page shows is sent.
 */
export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const { classrooms } = await parent();
	const chosen = classrooms.find((each) => each.id === url.searchParams.get('classroom'));
	const ids = chosen ? [chosen.id] : classrooms.map((each) => each.id);

	const [enrolments, bests, scores, given, weeks, activity] = await Promise.all([
		listEnrolments(locals.supabase, ids),
		listStageBests(locals.supabase, ids),
		listPointScores(locals.supabase, ids),
		listAssignments(locals.supabase, ids),
		listWeeks(locals.supabase, ids),
		listActivity(locals.supabase, ids)
	]);

	const now = Date.now();
	const averages = averagesOf(bests);
	const points = pointsOf(scores, enrolments);
	const struggling = strugglingOf(enrolments, averages, scores);
	const read = { enrolments, averages, scores, given, struggling };

	return {
		classroomId: chosen?.id ?? null,
		people: peopleOf(enrolments),
		points,
		bands: bandsOf(points),
		struggling,
		progress: progressOf(given, now),
		tally: starTallyOf(bests),
		weeks,
		activity,
		// One classroom is the whole page, so only several are summed up one by one.
		summaries: chosen
			? []
			: classrooms.map((classroom) => ({
					classroom,
					summary: classroomSummaryOf(classroom.id, read, now)
				}))
	};
};

/**
 * What the bell in the top bar posts to, from whichever page it is pressed
 * on: a teacher's notifications belong to no one classroom, and their home
 * is the one page that is always theirs.
 */
export const actions: Actions = {
	/** Opens the assignment a notification is about, and marks what the teacher was told of it as seen. */
	openNotification: async ({ request, locals }) => {
		const parsed = z
			.object({ classroomId: z.guid(), assignmentId: z.guid() })
			.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		const { classroomId, assignmentId } = parsed.data;

		try {
			await markNotificationsSeen(locals.supabase, assignmentId);
		} catch (cause) {
			return unexpected(cause);
		}
		redirect(303, resolvePath(assignmentPath(classroomId, assignmentId)));
	},

	/** Marks every one of the teacher's notifications as seen. */
	readNotifications: async ({ locals }) => {
		try {
			await markNotificationsSeen(locals.supabase, null);
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
