import { loadDashboard } from '#lib/server/dashboard.js';
import type { PageServerLoad } from './$types';

/**
 * The manager's home: how the organization's live classrooms are doing, all
 * of them or the one the address names.
 */
export const load: PageServerLoad = (event) => loadDashboard('manager', event);
