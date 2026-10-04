import { defineParams } from '@sveltejs/kit/params';
import { z } from 'zod';

export const params = defineParams({
	/**
	 * The roles whose classroom pages are shared. A teacher's classroom has its
	 * own pages, under `/teacher`.
	 */
	member: (param) => {
		if (param === 'manager' || param === 'student') return param;
	},
	/** A row id. Anything else is not an address, so it never reaches the database. */
	id: (param) => {
		if (z.guid().safeParse(param).success) return param;
	}
});
