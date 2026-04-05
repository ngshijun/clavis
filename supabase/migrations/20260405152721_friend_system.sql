-- ============================================================
-- 1. Friend code generation + column
-- ============================================================
CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  code TEXT;
  i INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      IF i = 4 THEN code := code || '-'; END IF;
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM student_profiles WHERE friend_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- Add column as nullable first (metadata-only, no row scan)
ALTER TABLE student_profiles
ADD COLUMN friend_code TEXT;

-- Backfill existing students
UPDATE student_profiles
SET friend_code = generate_friend_code()
WHERE friend_code IS NULL;

-- Now add constraints and default
ALTER TABLE student_profiles
ALTER COLUMN friend_code SET NOT NULL,
ALTER COLUMN friend_code SET DEFAULT generate_friend_code(),
ADD CONSTRAINT student_profiles_friend_code_key UNIQUE (friend_code);

-- ============================================================
-- 2. Friendships table
-- ============================================================
CREATE TABLE friendships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
  closeness_xp    INTEGER NOT NULL DEFAULT 0,
  closeness_level INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

CREATE INDEX idx_friendships_requester ON friendships (requester_id) WHERE status IN ('pending', 'accepted');
CREATE INDEX idx_friendships_recipient ON friendships (recipient_id) WHERE status IN ('pending', 'accepted');

CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. Daily coin gifts table
-- ============================================================
CREATE TABLE daily_coin_gifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friendship_id   UUID NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  receiver_id     UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  coins           INTEGER NOT NULL DEFAULT 5,
  sent_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (friendship_id, sender_id, sent_date)
);

CREATE INDEX idx_daily_gifts_mutual_check
  ON daily_coin_gifts (friendship_id, sent_date);

-- ============================================================
-- 4. RLS policies
-- ============================================================
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own friendships" ON friendships
FOR SELECT USING (
  (SELECT auth.uid()) IN (requester_id, recipient_id)
  AND status IN ('pending', 'accepted')
);

CREATE POLICY "create friend request" ON friendships
FOR INSERT WITH CHECK (
  requester_id = (SELECT auth.uid())
);

CREATE POLICY "update own friendships" ON friendships
FOR UPDATE USING (
  (SELECT auth.uid()) IN (requester_id, recipient_id)
);

ALTER TABLE daily_coin_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own gifts" ON daily_coin_gifts
FOR SELECT USING (
  (SELECT auth.uid()) IN (sender_id, receiver_id)
);

CREATE POLICY "send gift" ON daily_coin_gifts
FOR INSERT WITH CHECK (
  sender_id = (SELECT auth.uid())
);

-- ============================================================
-- 5. Column-level grants
-- ============================================================
REVOKE UPDATE ON TABLE public.friendships FROM authenticated;
GRANT UPDATE (status, responded_at, closeness_xp, closeness_level, updated_at)
  ON TABLE public.friendships TO authenticated;

REVOKE UPDATE ON TABLE public.daily_coin_gifts FROM authenticated;

-- ============================================================
-- 6. RPC: send_friend_request
-- ============================================================
CREATE OR REPLACE FUNCTION send_friend_request(p_target_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_friend_count INT;
  v_existing RECORD;
  v_friendship_id UUID;
BEGIN
  IF v_caller_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot send friend request to yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT count(*) INTO v_friend_count
  FROM friendships
  WHERE (requester_id = v_caller_id OR recipient_id = v_caller_id)
    AND status = 'accepted';

  IF v_friend_count >= 30 THEN
    RAISE EXCEPTION 'Friend limit reached (max 30)';
  END IF;

  SELECT id, status INTO v_existing
  FROM friendships
  WHERE (requester_id = v_caller_id AND recipient_id = p_target_id)
     OR (requester_id = p_target_id AND recipient_id = v_caller_id)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already pending';
    ELSIF v_existing.status = 'accepted' THEN
      RAISE EXCEPTION 'Already friends';
    ELSIF v_existing.status IN ('declined', 'removed') THEN
      UPDATE friendships
      SET requester_id = v_caller_id,
          recipient_id = p_target_id,
          status = 'pending',
          responded_at = NULL,
          closeness_xp = 0,
          closeness_level = 0,
          updated_at = now()
      WHERE id = v_existing.id
      RETURNING id INTO v_friendship_id;
      RETURN v_friendship_id;
    END IF;
  END IF;

  INSERT INTO friendships (requester_id, recipient_id)
  VALUES (v_caller_id, p_target_id)
  RETURNING id INTO v_friendship_id;

  RETURN v_friendship_id;
END;
$$;

-- ============================================================
-- 6b. RPC: respond_friend_request
-- ============================================================
CREATE OR REPLACE FUNCTION respond_friend_request(p_friendship_id UUID, p_accept BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_friendship RECORD;
  v_friend_count INT;
BEGIN
  SELECT * INTO v_friendship
  FROM friendships
  WHERE id = p_friendship_id;

  IF v_friendship IS NULL THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_friendship.recipient_id <> v_caller_id THEN
    RAISE EXCEPTION 'Only the recipient can respond to this request';
  END IF;

  IF v_friendship.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is no longer pending';
  END IF;

  IF p_accept THEN
    SELECT count(*) INTO v_friend_count
    FROM friendships
    WHERE (requester_id = v_caller_id OR recipient_id = v_caller_id)
      AND status = 'accepted';

    IF v_friend_count >= 30 THEN
      RAISE EXCEPTION 'Friend limit reached (max 30)';
    END IF;

    UPDATE friendships
    SET status = 'accepted', responded_at = now()
    WHERE id = p_friendship_id;
  ELSE
    UPDATE friendships
    SET status = 'declined', responded_at = now()
    WHERE id = p_friendship_id;
  END IF;
END;
$$;

-- ============================================================
-- 6c. RPC: send_daily_coins
-- ============================================================
CREATE OR REPLACE FUNCTION send_daily_coins(p_friendship_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_friendship RECORD;
  v_receiver_id UUID;
  v_is_mutual BOOLEAN := FALSE;
  v_new_xp INT;
  v_new_level INT;
  v_level_thresholds INT[] := ARRAY[0, 5, 15, 35, 70, 120];
BEGIN
  SELECT * INTO v_friendship
  FROM friendships
  WHERE id = p_friendship_id;

  IF v_friendship IS NULL THEN
    RAISE EXCEPTION 'Friendship not found';
  END IF;

  IF v_friendship.status <> 'accepted' THEN
    RAISE EXCEPTION 'Can only send coins to accepted friends';
  END IF;

  IF v_friendship.requester_id = v_caller_id THEN
    v_receiver_id := v_friendship.recipient_id;
  ELSIF v_friendship.recipient_id = v_caller_id THEN
    v_receiver_id := v_friendship.requester_id;
  ELSE
    RAISE EXCEPTION 'You are not part of this friendship';
  END IF;

  INSERT INTO daily_coin_gifts (friendship_id, sender_id, receiver_id)
  VALUES (p_friendship_id, v_caller_id, v_receiver_id);

  UPDATE student_profiles
  SET coins = COALESCE(coins, 0) + 5
  WHERE id = v_receiver_id;

  SELECT EXISTS (
    SELECT 1 FROM daily_coin_gifts
    WHERE friendship_id = p_friendship_id
      AND sender_id = v_receiver_id
      AND sent_date = CURRENT_DATE
  ) INTO v_is_mutual;

  IF v_is_mutual THEN
    v_new_xp := v_friendship.closeness_xp + 1;
    v_new_level := 0;
    FOR i IN REVERSE array_upper(v_level_thresholds, 1)..1 LOOP
      IF v_new_xp >= v_level_thresholds[i] THEN
        v_new_level := i - 1;
        EXIT;
      END IF;
    END LOOP;

    UPDATE friendships
    SET closeness_xp = v_new_xp, closeness_level = v_new_level
    WHERE id = p_friendship_id;
  END IF;

  RETURN jsonb_build_object(
    'receiver_id', v_receiver_id,
    'is_mutual', v_is_mutual,
    'closeness_xp', CASE WHEN v_is_mutual THEN v_new_xp ELSE v_friendship.closeness_xp END,
    'closeness_level', CASE WHEN v_is_mutual THEN v_new_level ELSE v_friendship.closeness_level END
  );
END;
$$;

-- ============================================================
-- 6d. RPC: remove_friend
-- ============================================================
CREATE OR REPLACE FUNCTION remove_friend(p_friendship_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_friendship RECORD;
BEGIN
  SELECT * INTO v_friendship
  FROM friendships
  WHERE id = p_friendship_id;

  IF v_friendship IS NULL THEN
    RAISE EXCEPTION 'Friendship not found';
  END IF;

  IF v_caller_id NOT IN (v_friendship.requester_id, v_friendship.recipient_id) THEN
    RAISE EXCEPTION 'You are not part of this friendship';
  END IF;

  -- Accepted: either party can remove. Pending: only requester can cancel.
  IF v_friendship.status = 'accepted' THEN
    UPDATE friendships
    SET status = 'removed', updated_at = now()
    WHERE id = p_friendship_id;
  ELSIF v_friendship.status = 'pending' AND v_friendship.requester_id = v_caller_id THEN
    UPDATE friendships
    SET status = 'removed', updated_at = now()
    WHERE id = p_friendship_id;
  ELSE
    RAISE EXCEPTION 'Cannot remove this friendship';
  END IF;
END;
$$;

-- ============================================================
-- 7. Closeness decay function + cron
-- ============================================================
CREATE OR REPLACE FUNCTION decay_closeness_xp()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level_thresholds INT[] := ARRAY[0, 5, 15, 35, 70, 120];
BEGIN
  UPDATE friendships f
  SET
    closeness_xp = GREATEST(closeness_xp - 1, 0),
    closeness_level = CASE
      WHEN GREATEST(closeness_xp - 1, 0) >= v_level_thresholds[6] THEN 5
      WHEN GREATEST(closeness_xp - 1, 0) >= v_level_thresholds[5] THEN 4
      WHEN GREATEST(closeness_xp - 1, 0) >= v_level_thresholds[4] THEN 3
      WHEN GREATEST(closeness_xp - 1, 0) >= v_level_thresholds[3] THEN 2
      WHEN GREATEST(closeness_xp - 1, 0) >= v_level_thresholds[2] THEN 1
      ELSE 0
    END
  WHERE f.status = 'accepted'
    AND f.closeness_xp > 0
    AND NOT EXISTS (
      SELECT 1
      FROM daily_coin_gifts g1
      JOIN daily_coin_gifts g2
        ON g1.friendship_id = g2.friendship_id
        AND g1.sent_date = g2.sent_date
        AND g1.sender_id = g2.receiver_id
        AND g1.receiver_id = g2.sender_id
      WHERE g1.friendship_id = f.id
        AND g1.sent_date = CURRENT_DATE - INTERVAL '1 day'
    );
END;
$$;

SELECT cron.schedule(
  'decay-closeness-xp',
  '0 0 * * *',
  $$SELECT decay_closeness_xp()$$
);

-- Indexes for fetchFriends gift query: WHERE (sender_id = ? OR receiver_id = ?) AND sent_date = ?
CREATE INDEX idx_daily_gifts_sender_date
  ON daily_coin_gifts (sender_id, sent_date);
CREATE INDEX idx_daily_gifts_receiver_date
  ON daily_coin_gifts (receiver_id, sent_date);
