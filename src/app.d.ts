import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import type { SessionUser } from '#lib/server/session.js';

declare global {
	namespace App {
		interface Locals {
			/** Acts as the signed-in person, so row level security applies to every call. */
			supabase: SupabaseClient<Database>;
			/** The signed-in person, or null for a visitor. */
			user: SessionUser | null;
		}
		interface PageData {
			/**
			 * The pages between a nested page and the sidebar link it sits under,
			 * outermost first: the breadcrumb's middle, which the address alone does not name.
			 */
			trail?: { label: string; href: string }[];
			/** What a detail page is showing, by name: the last crumb of the breadcrumb. */
			title?: string;
		}
	}
}

export {};
