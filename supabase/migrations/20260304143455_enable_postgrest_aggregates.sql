-- Enable PostgREST aggregate functions (count, sum, avg, min, max)
-- This allows using .count(), .sum() etc. in Supabase client queries
-- without hitting the default 1000-row limit for client-side aggregation.
ALTER ROLE authenticator SET pgrst.db_aggregates_enabled = 'true';
NOTIFY pgrst, 'reload config';
