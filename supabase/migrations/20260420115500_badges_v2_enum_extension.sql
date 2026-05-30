-- ============================================================================
-- Badge Catalog v2 — enum extension (must commit before usage)
--
-- ALTER TYPE ... ADD VALUE adds the value to the enum, but Postgres refuses
-- to USE the new value (insert/compare) inside the same transaction. The CLI
-- wraps each migration file in a transaction, so the v2 inserts/function
-- definitions live in a separate migration that runs after this one commits.
-- ============================================================================

alter type badge_trigger_type add value if not exists 'parent_linked';
alter type badge_trigger_type add value if not exists 'subscription_tier_reached';
alter type badge_trigger_type add value if not exists 'total_friends';
alter type badge_trigger_type add value if not exists 'friend_closeness_level_reached';
