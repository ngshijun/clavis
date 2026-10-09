import { fail, type Action } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	addClassroomMembers,
	removeClassroomMember,
	type MemberKind
} from '#lib/server/classrooms.js';
import { unexpected } from '#lib/server/forms.js';

type RosterAction = Action<{ classroomId: string }>;

/**
 * The form actions of one of a classroom's two lists, for the page that
 * shows it. The classroom is the one in the address. Whether the caller may
 * change its roster is the database's to say: only a manager of the
 * classroom's organization may, and only while it is live.
 */
export function rosterActions(kind: MemberKind): { add: RosterAction; remove: RosterAction } {
	return {
		add: async ({ request, locals, params }) => {
			const ids = z
				.array(z.guid())
				.min(1)
				.safeParse((await request.formData()).getAll('ids'));
			if (!ids.success) return fail(400, { message: m.error_unexpected() });

			try {
				await addClassroomMembers(locals.supabase, kind, params.classroomId, ids.data);
			} catch (cause) {
				return unexpected(cause);
			}
		},

		remove: async ({ request, locals, params }) => {
			const id = z.guid().safeParse((await request.formData()).get('id'));
			if (!id.success) return fail(400, { message: m.error_unexpected() });

			try {
				await removeClassroomMember(locals.supabase, kind, params.classroomId, id.data);
			} catch (cause) {
				return unexpected(cause);
			}
		}
	};
}
