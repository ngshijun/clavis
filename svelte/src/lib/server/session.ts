import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import type { Role } from '#lib/roles.js';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	role: Role;
	avatarUrl: string | null;
	/** Null only for a platform admin. */
	organizationId: string | null;
	organizationName: string | null;
}

/**
 * The person behind the request's session cookie, or null for a visitor.
 *
 * `getClaims` verifies the token rather than trusting the cookie, so the id
 * used below is one the auth server vouches for.
 */
export async function loadSessionUser(
	supabase: SupabaseClient<Database>
): Promise<SessionUser | null> {
	const { data: claims } = await supabase.auth.getClaims();
	const userId = claims?.claims.sub;
	if (!userId) return null;

	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('id, email, name, user_type, avatar_path, organization_id, organizations (name)')
		.eq('id', userId)
		.maybeSingle();

	if (profileError) {
		console.error(profileError);
		error(500, 'Could not load the account');
	}
	if (!profile) return null;

	return {
		id: profile.id,
		email: profile.email,
		name: profile.name,
		role: profile.user_type,
		avatarUrl: profile.avatar_path
			? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
			: null,
		organizationId: profile.organization_id,
		organizationName: profile.organizations?.name ?? null
	};
}
