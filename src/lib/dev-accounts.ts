import type { Role } from '#lib/roles.js';

export interface DevAccount {
	email: string;
	name: string;
	role: Role;
	/** What the account is there to test. */
	note: string;
}

/**
 * The test accounts `supabase/seed.sql` creates, for the developer tools to
 * sign in as: each is there for a case to test, which its note names. They
 * exist only where the seed has been loaded; keep this list in step with it.
 */
export const DEV_ACCOUNTS: DevAccount[] = [
	{ email: 'admin@clavis.test', name: 'Admin User', role: 'admin', note: 'Platform' },
	{
		email: 'manager@clavis.test',
		name: 'Mr Wong',
		role: 'manager',
		note: '7 classrooms, 1 archived'
	},
	{ email: 'teacher@clavis.test', name: 'Ms Lee', role: 'teacher', note: '3 classrooms' },
	{
		email: 'teacher2@clavis.test',
		name: 'Mr Kumar',
		role: 'teacher',
		note: '3 classrooms, 1 shared'
	},
	{ email: 'student@clavis.test', name: 'Alice Tan', role: 'student', note: '3 classrooms' },
	{
		email: 'student2@clavis.test',
		name: 'Ben Lim',
		role: 'student',
		note: '4 classrooms, 1 without questions'
	}
];
