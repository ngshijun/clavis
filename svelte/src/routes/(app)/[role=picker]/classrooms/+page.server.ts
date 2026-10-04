import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { classroomPath } from '#lib/navigation.js';
import type { PageServerLoad } from './$types';

/**
 * Someone with exactly one classroom is sent straight into it. A grid of a
 * single card is a dead screen, and for most teachers and students it would be
 * the only screen they ever saw here.
 */
export const load: PageServerLoad = async ({ parent, params }) => {
	const { classrooms } = await parent();
	const [sole] = classrooms;
	if (sole && classrooms.length === 1) redirect(307, resolve(classroomPath(params.role, sole.id)));
};
