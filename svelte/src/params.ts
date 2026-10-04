import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
	/** The roles that work inside a classroom: its pages are shared between them. */
	member: (param) => {
		if (param === 'manager' || param === 'teacher' || param === 'student') return param;
	},
	/**
	 * The roles that choose a classroom from a picker. A manager has a classroom
	 * management page instead, at the same address.
	 */
	picker: (param) => {
		if (param === 'teacher' || param === 'student') return param;
	}
});
