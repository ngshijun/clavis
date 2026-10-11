/**
 * Creates the test accounts on the staging project, where the seed is never
 * loaded: an admin, and in the organization "Clavis Demo Center" a manager,
 * two teachers and two students. Accounts that are already there are left as
 * they are, so it can be run again.
 *
 * The accounts get no classroom: the manager makes those in the app, as a
 * real manager would. The students sign in with their usernames, like every
 * student a manager creates.
 *
 * It needs the project's secret key, which this repository never holds, and a
 * password of your choosing for all six accounts:
 *
 *   SUPABASE_URL=https://mtvxgsubuwckaefqxupw.supabase.co \
 *   SUPABASE_SECRET_KEY=… TEST_PASSWORD=… node scripts/staging-accounts.ts
 *
 * It refuses any project but staging: accounts with a shared password must
 * never exist in production.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.ts';
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	studentEmail
} from '../supabase/functions/create-user/provisioning.ts';

const STAGING_URL = 'https://mtvxgsubuwckaefqxupw.supabase.co';
const ORGANIZATION = 'Clavis Demo Center';

type Account = { name: string } & (
	{ role: 'admin' | 'manager' | 'teacher'; email: string } | { role: 'student'; username: string }
);

const ACCOUNTS: Account[] = [
	{ role: 'admin', name: 'Admin User', email: 'admin@clavis.test' },
	{ role: 'manager', name: 'Mr Wong', email: 'manager@clavis.test' },
	{ role: 'teacher', name: 'Ms Lee', email: 'teacher@clavis.test' },
	{ role: 'teacher', name: 'Mr Kumar', email: 'teacher2@clavis.test' },
	{ role: 'student', name: 'Alice Tan', username: 'alice' },
	{ role: 'student', name: 'Ben Lim', username: 'ben' }
];

function stop(message: string): never {
	console.error(message);
	process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SECRET_KEY, TEST_PASSWORD } = process.env;
if (SUPABASE_URL !== STAGING_URL) stop(`SUPABASE_URL must be the staging project, ${STAGING_URL}`);
if (!SUPABASE_SECRET_KEY) stop('SUPABASE_SECRET_KEY is not set');
if (
	!TEST_PASSWORD ||
	TEST_PASSWORD.length < MIN_PASSWORD_LENGTH ||
	TEST_PASSWORD.length > MAX_PASSWORD_LENGTH
) {
	stop(`TEST_PASSWORD must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long`);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
	auth: { persistSession: false }
});

/** What a query found, or the end of the run when the query failed. */
async function found<Data>(
	query: PromiseLike<{ data: Data; error: { message: string } | null }>
): Promise<Data> {
	const { data, error } = await query;
	if (error) stop(error.message);
	return data;
}

const organization =
	(await found(
		supabase.from('organizations').select('id').eq('name', ORGANIZATION).maybeSingle()
	)) ??
	(await found(
		supabase.from('organizations').insert({ name: ORGANIZATION }).select('id').single()
	));
if (!organization) stop(`Could not create the organization ${ORGANIZATION}`);

// The students are put in the first grade level of the curriculum.
const grade = await found(
	supabase.from('grade_levels').select('id').order('display_order').limit(1).maybeSingle()
);
if (!grade) stop('The curriculum has no grade level to put the students in');

let managerId: string | null = null;

for (const account of ACCOUNTS) {
	const email = account.role === 'student' ? studentEmail(account.username) : account.email;
	const signIn = account.role === 'student' ? account.username : email;

	const existing = await found(
		supabase.from('profiles').select('id').eq('email', email).maybeSingle()
	);
	if (existing) {
		if (account.role === 'manager') managerId = existing.id;
		console.log(`${signIn}: already there`);
		continue;
	}

	const { data: created, error: createError } = await supabase.auth.admin.createUser({
		email,
		password: TEST_PASSWORD,
		email_confirm: true,
		user_metadata: { name: account.name }
	});
	if (createError) stop(`${signIn}: ${createError.message}`);
	const id = created.user.id;

	// A profile hangs from its auth user, so deleting that user undoes a half-made account.
	const { error: profileError } = await supabase.from('profiles').insert({
		id,
		email,
		name: account.name,
		user_type: account.role,
		organization_id: account.role === 'admin' ? null : organization.id
	});
	const { error: studentError } =
		profileError || account.role !== 'student'
			? { error: null }
			: await supabase.from('student_profiles').insert({
					id,
					username: account.username,
					grade_level_id: grade.id,
					created_by: managerId
				});
	const failure = profileError ?? studentError;
	if (failure) {
		await supabase.auth.admin.deleteUser(id);
		stop(`${signIn}: ${failure.message}`);
	}

	if (account.role === 'manager') managerId = id;
	console.log(`${signIn}: created (${account.role})`);
}
