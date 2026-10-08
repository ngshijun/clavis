import { defineParams } from '@sveltejs/kit/params';
import { z } from 'zod';

export const params = defineParams({
	/** A row id. Anything else is not an address, so it never reaches the database. */
	id: (param) => {
		if (z.guid().safeParse(param).success) return param;
	}
});
