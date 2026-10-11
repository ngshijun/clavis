import { defineEnvVars } from '@sveltejs/kit/env';
import * as z from 'zod';

export const variables = defineEnvVars({
	SUPABASE_URL: {
		description: 'The Supabase project the app talks to',
		schema: z.url()
	},
	SUPABASE_PUBLISHABLE_KEY: {
		description: 'The publishable key of that project; row level security does the authorizing',
		schema: z.string().min(1)
	}
});
