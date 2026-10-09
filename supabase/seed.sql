-- =============================================================================
-- CLAVIS SEED DATA — LOCAL STACK ONLY
-- =============================================================================
-- Loaded by `pnpm supabase db reset`, into the empty database the migrations
-- have just built. Never run it against staging or production: it creates
-- accounts with a known password.
--
-- Every account signs in with the password Test1234! — or, on the dev server,
-- from the developer tools (the wrench), which list them all
-- (src/lib/dev-accounts.ts; keep the two in step).
--
-- ACCOUNTS (all of the Clavis Demo Center, but the admin, who has no centre)
--   admin@clavis.test     Admin User  platform admin
--   manager@clavis.test   Mr Wong     manager: seven classrooms, one archived
--   teacher@clavis.test   Ms Lee      teaches three classrooms (+ the archived one)
--   teacher2@clavis.test  Mr Kumar    teaches three, one of them with Ms Lee
--   student@clavis.test   Alice Tan   three classrooms (+ the archived one)
--   student2@clavis.test  Ben Lim     four classrooms, one with nothing to practise
--
-- CLASSROOMS (section 9)                             teachers     students
--   Year 1 Math (Group A)                            Lee          Alice Ben
--   Year 1 Math (Group B)   same subject as Group A  Lee          Alice
--   Year 4 Science          every question type      Lee, Kumar   Alice Ben
--   Year 2 English                                   Kumar        Ben
--   Year 5 Bahasa Melayu    nothing to practise yet  Kumar        Ben
--   Year 3 Math (New)       just created             —            —
--   Year 1 Math (2025)      archived                 Lee          Alice
--
-- WHERE THE QUESTIONS ARE
--   Year 4 Science > Chapter 1 > Basic Knowledge   all fourteen question types,
--       every variant of each, and a passage with its own questions (8a)
--   Year 1 Mathematics   five stages over two topics, one in random order (8, 8c)
--   Year 2 English, Year 3 Mathematics   a few questions each (8)
--   Every other subject has stages and no questions.
--
-- Pictures: the files under supabase/seed/ are uploaded to their buckets by
-- the same `db reset` (config.toml, objects_path).
--
-- Reference data (grade levels, subjects, topics, stages) uses the same UUIDs
-- as production, so the curriculum mirrors the real one.
-- =============================================================================

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ORGANIZATION                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- A migration also creates the demo center; ON CONFLICT keeps that row.

INSERT INTO public.organizations (name)
VALUES ('Clavis Demo Center')
ON CONFLICT (name) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. TEST ACCOUNTS                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- One list drives the three rows an account needs: the auth user, its email
-- identity (without which it cannot sign in) and its profile. The admin
-- belongs to no centre. It is one statement because the seed is sent as one
-- batch, in which a later statement cannot read a table an earlier one made.

WITH account (id, email, name, user_type, centre) AS (
  VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@clavis.test', 'Admin User', 'admin', NULL),
    ('00000000-0000-0000-0000-000000000005', 'manager@clavis.test',  'Mr Wong',   'manager', 'Clavis Demo Center'),
    ('00000000-0000-0000-0000-000000000006', 'teacher@clavis.test',  'Ms Lee',    'teacher', 'Clavis Demo Center'),
    ('00000000-0000-0000-0000-000000000007', 'teacher2@clavis.test', 'Mr Kumar',  'teacher', 'Clavis Demo Center'),
    ('00000000-0000-0000-0000-000000000002', 'student@clavis.test',  'Alice Tan', 'student', 'Clavis Demo Center'),
    ('00000000-0000-0000-0000-000000000003', 'student2@clavis.test', 'Ben Lim',   'student', 'Clavis Demo Center')
),
auth_user AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  )
  SELECT
    '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
    crypt('Test1234!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', a.name),
    now(), now(), '', '', '', ''
  FROM account a
),
identity AS (
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), a.id, a.id::text, 'email',
         jsonb_build_object('sub', a.id, 'email', a.email), now(), now(), now()
  FROM account a
)
INSERT INTO public.profiles (id, name, email, user_type, organization_id)
SELECT a.id, a.name, a.email, a.user_type::public.user_role, o.id
FROM account a
LEFT JOIN public.organizations o ON o.name = a.centre;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. GRADE LEVELS (matches prod — SJKC Year 1–6)                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.grade_levels (id, name, display_order)
VALUES
  ('54081b95-ee5f-43d0-8f95-d640d48bb734', '一年级 Year 1',  4),
  ('b4b60a7d-e2b9-49be-b2f9-6a5f54a59e3a', '二年级 Year 2',  6),
  ('9a557264-da34-4c15-912d-8b8c724b5fda', '三年级 Year 3',  7),
  ('7a2bbc12-4ef3-4436-b8a5-9a7bd07116c8', '四年级 Year 4',  8),
  ('e513937d-9509-43eb-b9f8-41f29436385d', '五年级 Year 5',  9),
  ('11b62311-f934-4d88-9bcb-0fa0f112ba27', '六年级 Year 6', 10)
ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. STUDENT PROFILES                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- A student is set up by the manager of their centre (created_by). Usernames
-- stay NULL: these accounts sign in with their email.

INSERT INTO public.student_profiles (id, grade_level_id, created_by)
SELECT p.id, '54081b95-ee5f-43d0-8f95-d640d48bb734',  -- Year 1
       m.id
FROM public.profiles p
JOIN public.profiles m ON m.organization_id = p.organization_id AND m.user_type = 'manager'
WHERE p.user_type = 'student';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. SUBJECTS (4 per grade × 6 grades = 24)                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.subjects (id, grade_level_id, name, display_order)
VALUES
  -- 一年级 Year 1
  ('9d077a3d-b673-4760-9c44-218f0f25b2b1', '54081b95-ee5f-43d0-8f95-d640d48bb734', '一年级数学 Year 1 Mathematics',    1),
  ('527e9417-4508-4320-bbcf-71137c503d9b', '54081b95-ee5f-43d0-8f95-d640d48bb734', '一年级科学 Year 1 Science',        2),
  ('2589b6b7-a0e1-488b-9d61-ba4aafd37cd1', '54081b95-ee5f-43d0-8f95-d640d48bb734', '一年级国文 Year 1 Bahasa Melayu',  3),
  ('2f692418-c881-4c00-a236-a6f3fabf12a8', '54081b95-ee5f-43d0-8f95-d640d48bb734', '一年级英文 Year 1 English',        4),
  -- 二年级 Year 2
  ('195106a3-6930-415e-8421-8460c97cbc50', 'b4b60a7d-e2b9-49be-b2f9-6a5f54a59e3a', '二年级数学 Year 2 Mathematics',    1),
  ('c3609ab7-af1b-4a87-b032-94db800cdf6a', 'b4b60a7d-e2b9-49be-b2f9-6a5f54a59e3a', '二年级科学 Year 2 Science',        2),
  ('8fb74fbd-cc5a-4ecf-a274-9639709c47ed', 'b4b60a7d-e2b9-49be-b2f9-6a5f54a59e3a', '二年级国文 Year 2 Bahasa Melayu',  3),
  ('f73988ca-1c4e-4b22-8455-eb32c5c1e1c8', 'b4b60a7d-e2b9-49be-b2f9-6a5f54a59e3a', '二年级英文 Year 2 English',        4),
  -- 三年级 Year 3
  ('3ac69c39-64d4-4d60-8c90-0dea1b2cd39a', '9a557264-da34-4c15-912d-8b8c724b5fda', '三年级数学 Year 3 Mathematics',    1),
  ('c3d0042c-9308-40b8-9b68-781f500a36df', '9a557264-da34-4c15-912d-8b8c724b5fda', '三年级科学 Year 3 Science',        2),
  ('282b813f-a131-4467-bee2-aa6a054250d0', '9a557264-da34-4c15-912d-8b8c724b5fda', '三年级国文 Year 3 Bahasa Melayu',  3),
  ('3e659c9e-b3fe-4046-a3d7-3f16d321e502', '9a557264-da34-4c15-912d-8b8c724b5fda', '三年级英文 Year 3 English',        4),
  -- 四年级 Year 4
  ('63882b88-5103-4bd0-830a-01a45c1fc692', '7a2bbc12-4ef3-4436-b8a5-9a7bd07116c8', '四年级数学 Year 4 Mathematics',    1),
  ('1129720c-0a04-4832-8bbd-a8ffabfd8bc6', '7a2bbc12-4ef3-4436-b8a5-9a7bd07116c8', '四年级科学 Year 4 Science',        2),
  ('ab9488e7-9e4d-4d5a-bb94-d845cf812a80', '7a2bbc12-4ef3-4436-b8a5-9a7bd07116c8', '四年级国文 Year 4 Bahasa Melayu',  3),
  ('b04d8778-7bc9-49b0-9695-30279098e93c', '7a2bbc12-4ef3-4436-b8a5-9a7bd07116c8', '四年级英文 Year 4 English',        4),
  -- 五年级 Year 5
  ('4cc03b8e-fabc-46fe-8e76-5acf91f0ea18', 'e513937d-9509-43eb-b9f8-41f29436385d', '五年级数学 Year 5 Mathematics',    1),
  ('8a3f82ce-c09d-4142-9b50-be8aff758327', 'e513937d-9509-43eb-b9f8-41f29436385d', '五年级科学 Year 5 Science',        2),
  ('870a3904-e38c-45de-819c-fc36bc71535a', 'e513937d-9509-43eb-b9f8-41f29436385d', '五年级国文 Year 5 Bahasa Melayu',  3),
  ('0ad73544-6c28-439a-85d9-534e50304363', 'e513937d-9509-43eb-b9f8-41f29436385d', '五年级英文 Year 5 English',        4),
  -- 六年级 Year 6
  ('e2151d12-9023-4e3b-bab9-a04171c94eed', '11b62311-f934-4d88-9bcb-0fa0f112ba27', '六年级数学 Year 6 Mathematics',    1),
  ('cce8098e-fc9e-4f9c-8455-58e5ed395d3f', '11b62311-f934-4d88-9bcb-0fa0f112ba27', '六年级科学 Year 6 Science',        2),
  ('cd1184a0-9c6a-414f-8f71-c7f5b40328a7', '11b62311-f934-4d88-9bcb-0fa0f112ba27', '六年级国文 Year 6 Bahasa Melayu',  3),
  ('44c895d6-a8e3-4fa3-b407-b7c9d49b70ff', '11b62311-f934-4d88-9bcb-0fa0f112ba27', '六年级英文 Year 6 English',        4)
ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. TOPICS (2 per subject = 48)                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.topics (id, subject_id, name, display_order)
VALUES
  -- Y1 Mathematics
  ('bc9fb793-5026-4241-94ac-54ab709f0518', '9d077a3d-b673-4760-9c44-218f0f25b2b1', '第一课 100 以内的整数 Chapter 1',                  1),
  ('f73c2614-9ce0-45eb-81ac-21f7c6575bb5', '9d077a3d-b673-4760-9c44-218f0f25b2b1', '第二课 基本运算 Chapter 2',                        2),
  -- Y1 Science
  ('9a3c031a-3e84-4fa2-bcf8-ea9fabd465b9', '527e9417-4508-4320-bbcf-71137c503d9b', '第一课 科学技能 Chapter 1',                        1),
  ('ac5596ff-df46-44a7-8c07-4ff7567659e4', '527e9417-4508-4320-bbcf-71137c503d9b', '第二课 科学室规则 Chapter 2',                      2),
  -- Y1 Bahasa Melayu
  ('8084e08f-bc38-4237-b246-ad8408a8d1c7', '2589b6b7-a0e1-488b-9d61-ba4aafd37cd1', '理解与应用 Kefahaman',                              1),
  ('8870ae63-523b-41b9-892d-968f00751941', '2589b6b7-a0e1-488b-9d61-ba4aafd37cd1', '语法 Tatabahasa',                                  2),
  -- Y1 English
  ('77aa0a6a-d81f-4be3-8182-eabdf4a8ed93', '2f692418-c881-4c00-a236-a6f3fabf12a8', '理解与词汇 Comprehension and Vocabulary',          1),
  ('89d50d90-f658-458a-9fa3-a61a8a7f32a0', '2f692418-c881-4c00-a236-a6f3fabf12a8', '语法 Grammar',                                    2),
  -- Y2 Mathematics
  ('78ea0dbf-5ba2-4d48-9582-35b24a02fc61', '195106a3-6930-415e-8421-8460c97cbc50', '第一课 1 000 以内的整数 Chapter 1',                1),
  ('53633514-3d1b-4638-888c-e38bcea5ba13', '195106a3-6930-415e-8421-8460c97cbc50', '第二课 基本运算 Chapter 2',                        2),
  -- Y2 Science
  ('ebb96cb5-e144-496c-b01d-44b1f7d18fa5', 'c3609ab7-af1b-4a87-b032-94db800cdf6a', '第一课 科学技能 Chapter 1',                        1),
  ('46f5ad21-e6d6-43e1-a278-7519c598643c', 'c3609ab7-af1b-4a87-b032-94db800cdf6a', '第二课 科学室规则 Chapter 2',                      2),
  -- Y2 Bahasa Melayu
  ('3d425961-bd2c-4b26-acbb-534b32269345', '8fb74fbd-cc5a-4ecf-a274-9639709c47ed', '理解 Pemahaman',                                    1),
  ('8b240570-75f3-4d84-bc8c-dade1672e206', '8fb74fbd-cc5a-4ecf-a274-9639709c47ed', '词汇 Kosa Kata',                                    2),
  ('51d046a7-d734-4c78-8d2c-f52aae6b9bf3', '8fb74fbd-cc5a-4ecf-a274-9639709c47ed', '语法 Tatabahasa',                                  3),
  -- Y2 English
  ('90b488c3-853d-415b-878c-9f40e2c2db2e', 'f73988ca-1c4e-4b22-8455-eb32c5c1e1c8', '理解与词汇 Comprehension and Vocabulary',          1),
  ('50da1a03-8668-4da5-bc88-086ca1cccd2b', 'f73988ca-1c4e-4b22-8455-eb32c5c1e1c8', '语法 Grammar',                                    2),
  -- Y3 Mathematics
  ('8a4e610f-7e19-4e48-9508-f50d59407d73', '3ac69c39-64d4-4d60-8c90-0dea1b2cd39a', '第一课 10 000 以内的整数 Chapter 1',               1),
  ('41834e81-7190-4454-9975-2995cb133f9d', '3ac69c39-64d4-4d60-8c90-0dea1b2cd39a', '第二课 基本运算 Chapter 2',                        2),
  -- Y3 Science
  ('0f4623ab-10d6-4a4d-bb28-b6babafec219', 'c3d0042c-9308-40b8-9b68-781f500a36df', '第一课 科学技能 Chapter 1',                        1),
  ('9562f586-8676-4400-ac66-a59f1fdc1d1a', 'c3d0042c-9308-40b8-9b68-781f500a36df', '第二课 科学室规则 Chapter 2',                      2),
  -- Y3 Bahasa Melayu
  ('90f09a52-1dfc-438d-816b-f06c96c685f5', '282b813f-a131-4467-bee2-aa6a054250d0', '理解与应用 Kefahaman',                              1),
  ('1d909542-6826-46f6-bc47-9ad1895969b2', '282b813f-a131-4467-bee2-aa6a054250d0', '语法 Tatabahasa',                                  2),
  -- Y3 English
  ('18140ecb-f258-40e9-b5e5-d4dfff5e500e', '3e659c9e-b3fe-4046-a3d7-3f16d321e502', '理解与词汇 Comprehension and Vocabulary',          1),
  ('52a7860a-c482-4c3b-b946-9206819670ad', '3e659c9e-b3fe-4046-a3d7-3f16d321e502', '语法 Grammar',                                    2),
  -- Y4 Mathematics
  ('2982daf2-130a-4a28-8789-75113fbddf27', '63882b88-5103-4bd0-830a-01a45c1fc692', '第一课 整数与运算 Chapter 1',                      1),
  ('df926034-7708-4e17-8f8f-83445a1b38ca', '63882b88-5103-4bd0-830a-01a45c1fc692', '第二课 分数、小数与百分比 Chapter 2',              2),
  -- Y4 Science
  ('f99902cc-d0d2-4358-8367-6f35448c2302', '1129720c-0a04-4832-8bbd-a8ffabfd8bc6', '第一课 科学技能 Chapter 1',                        1),
  ('d063b07a-059f-4c07-890d-9a4948e41507', '1129720c-0a04-4832-8bbd-a8ffabfd8bc6', '第二课 人类 Chapter 2',                            2),
  -- Y4 Bahasa Melayu
  ('7e2a794a-9688-4446-9d0b-5a55c2cb3434', 'ab9488e7-9e4d-4d5a-bb94-d845cf812a80', '理解与应用 Kefahaman',                              1),
  ('6da7dfd1-8785-4941-9fda-b2877441e5d8', 'ab9488e7-9e4d-4d5a-bb94-d845cf812a80', '语法 Tatabahasa',                                  2),
  -- Y4 English
  ('d96f611f-216e-48e5-a434-14cae4561ceb', 'b04d8778-7bc9-49b0-9695-30279098e93c', '理解与词汇 Comprehension and Vocabulary',          1),
  ('0bafab5e-cec8-4066-a9fa-c00b58808ef2', 'b04d8778-7bc9-49b0-9695-30279098e93c', '语法 Grammar',                                    2),
  -- Y5 Mathematics
  ('5da37b44-3d12-4935-a997-6c7238b54f9e', '4cc03b8e-fabc-46fe-8e76-5acf91f0ea18', '第一课 整数与运算 Chapter 1',                      1),
  ('f41d5b96-63a0-4315-8e93-34d66e6ade34', '4cc03b8e-fabc-46fe-8e76-5acf91f0ea18', '第二课 分数、小数与百分比 Chapter 2',              2),
  -- Y5 Science
  ('8046f9e7-62d2-4f2f-86ea-310b4013ca7c', '8a3f82ce-c09d-4142-9b50-be8aff758327', '第一课 科学技能 Chapter 1',                        1),
  ('7c833117-d92c-41e8-9ed2-fa01a8de4e70', '8a3f82ce-c09d-4142-9b50-be8aff758327', '第二课 人类 Chapter 2',                            2),
  -- Y5 Bahasa Melayu
  ('161ebf52-766e-42c7-9318-78eadab9d80e', '870a3904-e38c-45de-819c-fc36bc71535a', '理解与应用 Kefahaman',                              1),
  ('eab90da9-6fe7-403d-883c-03ea010f9c6f', '870a3904-e38c-45de-819c-fc36bc71535a', '语法 Tatabahasa',                                  2),
  -- Y5 English
  ('9adc0b44-7550-4631-9b12-ab2151de97ee', '0ad73544-6c28-439a-85d9-534e50304363', '理解与词汇 Comprehension and Vocabulary',          1),
  ('b3f89957-6f45-4a9c-a884-c1d5db355e1b', '0ad73544-6c28-439a-85d9-534e50304363', '语法 Grammar',                                    2),
  -- Y6 Mathematics
  ('2a9e0be2-7748-484d-8786-31cdd98aa768', 'e2151d12-9023-4e3b-bab9-a04171c94eed', '第一课 整数与运算 Chapter 1',                      1),
  ('5efe79c6-73c3-4fec-a316-f51beead0a09', 'e2151d12-9023-4e3b-bab9-a04171c94eed', '第二课 分数、小数与百分比 Chapter 2',              2),
  -- Y6 Science
  ('e38b4395-37bc-446d-b72f-37880ca61640', 'cce8098e-fc9e-4f9c-8455-58e5ed395d3f', '第一课 科学技能 Chapter 1',                        1),
  ('e3d47dce-be3d-476c-b464-2f475934f93c', 'cce8098e-fc9e-4f9c-8455-58e5ed395d3f', '第二课 人类 Chapter 2',                            2),
  -- Y6 Bahasa Melayu
  ('72f8a682-c4ac-4dee-894c-f10265379d77', 'cd1184a0-9c6a-414f-8f71-c7f5b40328a7', '理解与应用 Kefahaman',                              1),
  ('f74ed2f2-691c-4fb5-acb3-baf8cd120a77', 'cd1184a0-9c6a-414f-8f71-c7f5b40328a7', '语法 Tatabahasa',                                  2),
  -- Y6 English
  ('0cc55179-ccbe-4d31-bcbe-fd51461a7a16', '44c895d6-a8e3-4fa3-b407-b7c9d49b70ff', '理解与词汇 Comprehension and Vocabulary',          1),
  ('c475e6c5-34a8-4fbb-aadb-158e66b2a3da', '44c895d6-a8e3-4fa3-b407-b7c9d49b70ff', '语法 Grammar',                                    2)
ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. STAGES — the practice map (P19a)                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Practice is ordered STAGES under a topic; each holds its own questions.
-- The ids are the ones production has, but for Number Patterns, which is
-- the seed's own so that a topic has three stages to lay along the path.

INSERT INTO public.stages (id, topic_id, name, display_order)
VALUES
  -- Y1 Math > Chapter 1
  ('4e61c11b-d12e-449f-bdd6-44cf5639a692', 'bc9fb793-5026-4241-94ac-54ab709f0518', '基础计算 Basic Calculation',         1),
  ('b1000000-0000-4000-8000-000000000001', 'bc9fb793-5026-4241-94ac-54ab709f0518', '数字规律 Number Patterns',           2),
  ('a5cf5c0e-a7d6-4009-97fe-d453445791ee', 'bc9fb793-5026-4241-94ac-54ab709f0518', '高阶思维 Higher-Order Thinking',      3),
  -- Y1 Math > Chapter 2
  ('ae3333dc-fc77-44e6-bd19-d8032ee310b5', 'f73c2614-9ce0-45eb-81ac-21f7c6575bb5', '基础计算 Basic Calculation',         1),
  ('d0c0da71-c5b9-4ebd-8f2a-df880f7994a9', 'f73c2614-9ce0-45eb-81ac-21f7c6575bb5', '高阶思维 Higher-Order Thinking',      2),
  -- Y1 Science > Chapter 1
  ('2d9bbfd1-4de1-4ad4-ac35-83751c7e9c66', '9a3c031a-3e84-4fa2-bcf8-ea9fabd465b9', '基础知识 Basic Knowledge',           1),
  ('28cda5b7-1854-4a14-9a6d-7be4ac800a96', '9a3c031a-3e84-4fa2-bcf8-ea9fabd465b9', '研究思维 Research Thinking',          2),
  -- Y1 Science > Chapter 2
  ('b9a15996-f927-4e95-88f8-d109d57260d2', 'ac5596ff-df46-44a7-8c07-4ff7567659e4', '基础知识 Basic Knowledge',           1),
  ('4bd4f7cc-e0d6-47b9-b024-a1a41408750e', 'ac5596ff-df46-44a7-8c07-4ff7567659e4', '研究思维 Research Thinking',          2),
  -- Y2 Math > Chapter 1
  ('a4f43deb-d4ac-4192-95e9-adf439ef7755', '78ea0dbf-5ba2-4d48-9582-35b24a02fc61', '基础计算 Basic Calculation',         1),
  ('09cb171d-c162-4375-bb67-bedf908aa406', '78ea0dbf-5ba2-4d48-9582-35b24a02fc61', '高阶思维 Higher-Order Thinking',      2),
  -- Y2 Math > Chapter 2
  ('812a3389-559d-4c93-b1e4-15b78df61046', '53633514-3d1b-4638-888c-e38bcea5ba13', '基础计算 Basic Calculation',         1),
  ('31a37ed5-4a4c-4612-ac34-4c14baca0678', '53633514-3d1b-4638-888c-e38bcea5ba13', '高阶思维 Higher-Order Thinking',      2),
  -- Y2 Science > Chapter 1
  ('09c18a98-faa9-469e-b370-169ac1a6e30b', 'ebb96cb5-e144-496c-b01d-44b1f7d18fa5', '基础知识 Basic Knowledge',           1),
  ('02845495-b195-428b-9192-4a83f721c741', 'ebb96cb5-e144-496c-b01d-44b1f7d18fa5', '研究思维 Research Thinking',          2),
  -- Y2 Science > Chapter 2
  ('29c35e5d-04ce-4bfa-b4d9-eb71c5b68651', '46f5ad21-e6d6-43e1-a278-7519c598643c', '基础知识 Basic Knowledge',           1),
  ('2f9ac97d-a338-4bd9-825d-537c5c0365c0', '46f5ad21-e6d6-43e1-a278-7519c598643c', '研究思维 Research Thinking',          2),
  -- Y2 BM > Pemahaman
  ('b5351699-47a6-4b17-9c62-57727a390167', '8b240570-75f3-4d84-bc8c-dade1672e206', 'Tema 1 & Tema 2',                     1),
  -- Y2 English > Comprehension and Vocabulary
  ('3e7aa63a-900f-42f1-af4d-774b42e6020f', '90b488c3-853d-415b-878c-9f40e2c2db2e', 'Unit 5 - Free Time',                  1),
  -- Y2 English > Grammar
  ('8e74125c-d629-4b0e-ab11-c5dfb57856aa', '50da1a03-8668-4da5-bc88-086ca1cccd2b', 'Verbs',                               1),
  -- Y3 Math > Chapter 1
  ('7c8010f8-7616-4ead-9431-1a9c2d6224d3', '8a4e610f-7e19-4e48-9508-f50d59407d73', '基础计算 Basic Calculation',         1),
  ('b8acac8d-064e-4ba3-b26f-5b0ccb2f0d35', '8a4e610f-7e19-4e48-9508-f50d59407d73', '高阶思维 Higher-Order Thinking',      2),
  -- Y3 Math > Chapter 2
  ('044060db-7c76-414a-b9ac-5f9cb25292f3', '41834e81-7190-4454-9975-2995cb133f9d', '基础计算 Basic Calculation',         1),
  ('5107fce5-94b1-4db9-8425-5739d12720ec', '41834e81-7190-4454-9975-2995cb133f9d', '高阶思维 Higher-Order Thinking',      2),
  -- Y3 Science > Chapter 1
  ('f529cc5c-a73e-4d05-992c-450584905193', '0f4623ab-10d6-4a4d-bb28-b6babafec219', '基础知识 Basic Knowledge',           1),
  ('0020b555-fb2d-47a2-9af0-d0a94df98d9f', '0f4623ab-10d6-4a4d-bb28-b6babafec219', '研究思维 Research Thinking',          2),
  -- Y3 Science > Chapter 2
  ('b3df363b-ce7f-47ea-9066-42ee923b4e0e', '9562f586-8676-4400-ac66-a59f1fdc1d1a', '基础知识 Basic Knowledge',           1),
  ('633f0234-096b-4ad4-bc94-2c8897d20de2', '9562f586-8676-4400-ac66-a59f1fdc1d1a', '研究思维 Research Thinking',          2),
  -- Y4 Math > Chapter 1
  ('67180109-a297-4dae-a1fa-76dcdfa0fdb1', '2982daf2-130a-4a28-8789-75113fbddf27', '基础计算 Basic Calculation',         3),
  ('a341734d-5084-490b-806e-3115b67766fe', '2982daf2-130a-4a28-8789-75113fbddf27', '高阶思维 Higher-Order Thinking',      4),
  -- Y4 Math > Chapter 2
  ('c31e0af6-55d8-43be-a30b-a07e91e82845', 'df926034-7708-4e17-8f8f-83445a1b38ca', '基础计算 Basic Calculation',         3),
  ('b0cf32e1-3758-4484-8189-357ec39645b6', 'df926034-7708-4e17-8f8f-83445a1b38ca', '高阶思维 Higher-Order Thinking',      4),
  -- Y4 Science > Chapter 1
  ('7d8028fe-a9c7-4b60-9a9b-102a07e984f4', 'f99902cc-d0d2-4358-8367-6f35448c2302', '基础知识 Basic Knowledge',           1),
  ('5394dfcc-4eb7-414c-b4aa-acde0b6ede5f', 'f99902cc-d0d2-4358-8367-6f35448c2302', '研究思维 Research Thinking',          2),
  -- Y4 Science > Chapter 2
  ('8fba7b3d-e192-496a-ad0e-39869f14b7f6', 'd063b07a-059f-4c07-890d-9a4948e41507', '基础知识 Basic Knowledge',           1),
  ('a29bde23-4548-440f-9b69-470eb90ad62a', 'd063b07a-059f-4c07-890d-9a4948e41507', '研究思维 Research Thinking',          2),
  -- Y5 Math > Chapter 1
  ('d5a066f2-9180-4044-8345-cbd8c4e4c0e5', '5da37b44-3d12-4935-a997-6c7238b54f9e', '基础计算 Basic Calculation',         3),
  ('7b3f9b87-a48d-4de8-8e66-847c8b167db2', '5da37b44-3d12-4935-a997-6c7238b54f9e', '高阶思维 Higher-Order Thinking',      4),
  -- Y5 Math > Chapter 2
  ('3a70f42f-572d-4b6b-bb3e-0a19aa5d475e', 'f41d5b96-63a0-4315-8e93-34d66e6ade34', '基础计算 Basic Calculation',         3),
  ('51fae49a-4c36-4348-9e5a-85b5a0589de8', 'f41d5b96-63a0-4315-8e93-34d66e6ade34', '高阶思维 Higher-Order Thinking',      4),
  -- Y5 Science > Chapter 1
  ('59e8a1db-f75c-40de-aa70-1944f0359126', '8046f9e7-62d2-4f2f-86ea-310b4013ca7c', '基础知识 Basic Knowledge',           1),
  ('643c7e4b-40bf-49d9-842e-d8787014ff03', '8046f9e7-62d2-4f2f-86ea-310b4013ca7c', '研究思维 Research Thinking',          2),
  -- Y5 Science > Chapter 2
  ('531ffee8-6541-4304-a198-9112a94680ff', '7c833117-d92c-41e8-9ed2-fa01a8de4e70', '基础知识 Basic Knowledge',           1),
  ('ed809fde-0ead-41ec-bbf9-562cba8426e0', '7c833117-d92c-41e8-9ed2-fa01a8de4e70', '研究思维 Research Thinking',          2),
  -- Y6 Math > Chapter 1
  ('ec9d3ac0-871a-458a-9011-316d272cfb5f', '2a9e0be2-7748-484d-8786-31cdd98aa768', '基础计算 Basic Calculation',         3),
  ('9af8121d-74bf-478d-b1c3-95597066f4f5', '2a9e0be2-7748-484d-8786-31cdd98aa768', '高阶思维 Higher-Order Thinking',      4),
  -- Y6 Math > Chapter 2
  ('360e8aee-7aab-459e-98a3-c4d4d09be2c0', '5efe79c6-73c3-4fec-a316-f51beead0a09', '基础计算 Basic Calculation',         3),
  ('dbcd3536-084e-40c1-985d-1712ba8a01a6', '5efe79c6-73c3-4fec-a316-f51beead0a09', '高阶思维 Higher-Order Thinking',      4),
  -- Y6 Science > Chapter 1
  ('e0865315-14fc-44e6-940f-02f9ca658ea4', 'e38b4395-37bc-446d-b72f-37880ca61640', '基础知识 Basic Knowledge',           1),
  ('a49119a8-ce76-4420-b0b6-83fb3dc9701d', 'e38b4395-37bc-446d-b72f-37880ca61640', '研究思维 Research Thinking',          2),
  -- Y6 Science > Chapter 2
  ('67df6469-72e9-4b16-990d-651ff4feabba', 'e3d47dce-be3d-476c-b464-2f475934f93c', '基础知识 Basic Knowledge',           1),
  ('eb401dbf-f4b5-4704-9625-14ca5d59a93c', 'e3d47dce-be3d-476c-b464-2f475934f93c', '研究思维 Research Thinking',          2),
  -- Y6 English > Comprehension and Vocabulary
  ('35e1aeeb-3ed5-4321-a808-a5ada0e2bfac', '0cc55179-ccbe-4d31-bcbe-fd51461a7a16', '语法 Grammar',                       1)
ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. PRACTICE QUESTIONS                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- A practice question is ONE item payload, of one of the fourteen item
-- types. This section seeds the seven that predate the builder; section 8a
-- adds a stage that shows all fourteen. Option numbers are positions in
-- `options`, so an mcq may carry any number of them.
--
-- Tips: mcq/mrq carry a `tip` per WRONG option (shown when the student picked
-- it); every other type carries one question-level `tip` (shown when the
-- question was answered wrong). Neither ever reveals the answer.
--
-- grade_level_id and subject_id are auto-populated by the
-- populate_question_hierarchy trigger from the stage chain.

INSERT INTO public.questions (id, stage_id, payload) VALUES

  -- ── Y1 Math > Chapter 1 > Basic Calculation (Chinese) — MCQ ──────────────

  ('073d50c7-22e1-43c1-be30-ba53e7b04e66', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "mcq",
     "question": "在 15, 20, 25, 30 中，下一个数是多少？",
     "options": [
       {"text": "31", "is_correct": false, "tip": "这是五个五个地数，不是加 1。"},
       {"text": "35", "is_correct": true},
       {"text": "40", "is_correct": false, "tip": "你跳过了一个数，先数到 35。"},
       {"text": "45", "is_correct": false, "tip": "太大了，30 的下一步是 35。"}
     ]}'::jsonb),

  ('0c97d45a-f8a1-4a3d-96d9-f7449ab81607', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "mcq",
     "question": "在数字 7 中，个位数值是多少？",
     "options": [
       {"text": "70", "is_correct": false, "tip": "70 是七十，那是十位，不是个位。"},
       {"text": "7", "is_correct": true},
       {"text": "0", "is_correct": false, "tip": "0 表示没有，再看看数字本身。"},
       {"text": "1", "is_correct": false, "tip": "1 是位数的个数，不是数值。"}
     ]}'::jsonb),

  ('11e08503-3ca0-409a-a46d-5bc1f2f5f50f', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "mcq",
     "question": "哪个数字最大？",
     "options": [
       {"text": "19", "is_correct": false, "tip": "先比十位：1 比 9 小。"},
       {"text": "91", "is_correct": true},
       {"text": "49", "is_correct": false, "tip": "十位是 4，比 9 小。"},
       {"text": "90", "is_correct": false, "tip": "十位相同，再比个位：0 比 1 小。"}
     ]}'::jsonb),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — MRQ (multiple correct) ──────

  ('a1000000-0000-4000-8000-000000000001', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "mrq",
     "question": "以下哪些是双数（可选多个）？",
     "options": [
       {"text": "2", "is_correct": true},
       {"text": "3", "is_correct": false, "tip": "3 除以 2 有余数，是单数。"},
       {"text": "4", "is_correct": true},
       {"text": "5", "is_correct": false, "tip": "5 是单数，末位是 5。"}
     ]}'::jsonb),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — short answer ────────────────

  ('a1000000-0000-4000-8000-000000000002', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "short_answer",
     "question": "10 + 10 = ？",
     "accepted_answers": ["20", "二十"],
     "tip": "两个十合起来是几个十？"}'::jsonb),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — true / false ────────────────
  -- Answered with response {"value": true|false}.

  ('a1000000-0000-4000-8000-000000000004', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "true_false",
     "question": "25 比 52 大。",
     "answer": false,
     "tip": "先比十位：2 个十和 5 个十，哪个多？"}'::jsonb),

  ('a1000000-0000-4000-8000-000000000005', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "true_false",
     "question": "10 个一等于 1 个十。",
     "answer": true,
     "tip": "数一数：十根小棒捆成一捆，是几个十？"}'::jsonb),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — numeric ─────────────────────
  -- Answered with text_answer; `tolerance` and `unit` are optional.

  ('a1000000-0000-4000-8000-000000000006', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "numeric",
     "question": "18 + 7 = ？",
     "answer": 25,
     "tip": "先凑十：18 加几等于 20？剩下的再加上去。"}'::jsonb),

  ('a1000000-0000-4000-8000-000000000007', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "numeric",
     "question": "一支铅笔长 9.5 厘米。两支一样的铅笔接起来有多长？",
     "answer": 19,
     "tolerance": 0.5,
     "unit": "厘米",
     "tip": "两支一样长，就是把同一个数加两次。"}'::jsonb),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — cloze ───────────────────────
  -- Blanks are {{n}} markers in `text`; answered with
  -- response {"blanks": [{"index": n, "value": "..."}]}.

  ('a1000000-0000-4000-8000-000000000008', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "cloze",
     "question": "五个五个地数，填上漏掉的数。",
     "text": "5, 10, {{1}}, 20, {{2}}, 30",
     "blanks": [
       {"index": 1, "accepted": ["15", "十五"]},
       {"index": 2, "accepted": ["25", "二十五"]}
     ],
     "tip": "每一步都比前一个数多 5。"}'::jsonb),

  ('a1000000-0000-4000-8000-000000000009', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "cloze",
     "text": "34 里面有 {{1}} 个十和 {{2}} 个一。",
     "blanks": [
       {"index": 1, "accepted": ["3", "三"]},
       {"index": 2, "accepted": ["4", "四"]}
     ],
     "tip": "左边的数字是十位，右边的数字是个位。"}'::jsonb),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — matching ────────────────────
  -- One pair per left item; the right column carries a distractor. Answered
  -- with response {"pairs": [{"left_id": "...", "right_id": "..."}]}.

  ('a1000000-0000-4000-8000-00000000000a', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "matching",
     "question": "把数字和它的读法连起来。",
     "left": [
       {"id": "l1", "text": "12"},
       {"id": "l2", "text": "20"},
       {"id": "l3", "text": "15"}
     ],
     "right": [
       {"id": "r1", "text": "二十"},
       {"id": "r2", "text": "十五"},
       {"id": "r3", "text": "十二"},
       {"id": "r4", "text": "二十一"}
     ],
     "pairs": [
       {"left_id": "l1", "right_id": "r3"},
       {"left_id": "l2", "right_id": "r1"},
       {"left_id": "l3", "right_id": "r2"}
     ],
     "tip": "先读十位，再读个位：1 个十读作“十”。"}'::jsonb),

  ('a1000000-0000-4000-8000-00000000000b', '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '{"type": "matching",
     "question": "每个数是单数还是双数？",
     "left": [
       {"id": "l1", "text": "6"},
       {"id": "l2", "text": "9"},
       {"id": "l3", "text": "14"},
       {"id": "l4", "text": "17"}
     ],
     "right": [
       {"id": "r1", "text": "单数"},
       {"id": "r2", "text": "双数"}
     ],
     "pairs": [
       {"left_id": "l1", "right_id": "r2"},
       {"left_id": "l2", "right_id": "r1"},
       {"left_id": "l3", "right_id": "r2"},
       {"left_id": "l4", "right_id": "r1"}
     ],
     "tip": "看个位：0、2、4、6、8 结尾的是双数。"}'::jsonb),

  -- ── Y3 Math > Chapter 1 > Basic Calculation — MCQ ────────────────────────

  ('0183618e-b41f-42c4-b838-c7caa9647fa6', '7c8010f8-7616-4ead-9431-1a9c2d6224d3',
   '{"type": "mcq",
     "question": "3 个千、14 个十和 5 个一组成的数是？",
     "options": [
       {"text": "3145", "is_correct": true},
       {"text": "3415", "is_correct": false, "tip": "14 个十是 140，要进位到百位。"},
       {"text": "31405", "is_correct": false, "tip": "不要把 14 个十直接写进数字里。"},
       {"text": "3195", "is_correct": false, "tip": "14 个十是 140，不是 190。"}
     ]}'::jsonb),

  -- ── Y3 Math > Chapter 1 > Basic Calculation — MRQ ────────────────────────

  ('a1000000-0000-4000-8000-000000000003', '7c8010f8-7616-4ead-9431-1a9c2d6224d3',
   '{"type": "mrq",
     "question": "以下哪些数大于 3000（可选多个）？",
     "options": [
       {"text": "3145", "is_correct": true},
       {"text": "2999", "is_correct": false, "tip": "2999 比 3000 小 1。"},
       {"text": "3001", "is_correct": true},
       {"text": "2130", "is_correct": false, "tip": "2130 的千位是 2，小于 3。"}
     ]}'::jsonb),

  -- ── Y2 English > Grammar > Verbs — MCQ ───────────────────────────────────

  ('49f16772-57a6-44a8-8d27-76d8f29eb8bc', '8e74125c-d629-4b0e-ab11-c5dfb57856aa',
   '{"type": "mcq",
     "question": "Choose the correct answer\n\nI _______ my teeth.",
     "options": [
       {"text": "comb", "is_correct": false, "tip": "You comb your hair, not your teeth."},
       {"text": "brush", "is_correct": true},
       {"text": "ride", "is_correct": false, "tip": "You ride a bike or a horse."},
       {"text": "read", "is_correct": false, "tip": "You read books, not teeth."}
     ]}'::jsonb),

  ('bd94736c-87a9-45fb-98b7-b5dbf1da58e3', '8e74125c-d629-4b0e-ab11-c5dfb57856aa',
   '{"type": "mcq",
     "question": "Choose the correct answer\n\nI _______ books.",
     "options": [
       {"text": "read", "is_correct": true},
       {"text": "watch", "is_correct": false, "tip": "You watch movies or TV, not books."},
       {"text": "comb", "is_correct": false, "tip": "You comb hair, not books."},
       {"text": "feed", "is_correct": false, "tip": "You feed animals, not books."}
     ]}'::jsonb),

  -- ── Y2 English > Comprehension > Unit 5 (days of the week) — MCQ ──────────

  ('05054756-a6c3-4074-80c4-a6dbb3f5ec00', '3e7aa63a-900f-42f1-af4d-774b42e6020f',
   '{"type": "mcq",
     "question": "Which group of days is written in the correct order?",
     "options": [
       {"text": "Wednesday, Thursday, Tuesday", "is_correct": false, "tip": "Tuesday comes before Wednesday, not after Thursday."},
       {"text": "Monday, Tuesday, Wednesday", "is_correct": true},
       {"text": "Saturday, Sunday, Friday", "is_correct": false, "tip": "Friday comes before Saturday in the week."},
       {"text": "Tuesday, Thursday, Wednesday", "is_correct": false, "tip": "Wednesday comes before Thursday."}
     ]}'::jsonb)

ON CONFLICT (id) DO NOTHING;

-- The builder's order (P23a): each stage's questions in the order they are
-- listed above. Without this they would all sit at display_order 0.
UPDATE public.questions q
SET display_order = o.ord
FROM (
  -- Y1 Math > Chapter 1 > Basic Calculation
  SELECT s.id, s.ord
  FROM unnest(ARRAY[
    '073d50c7-22e1-43c1-be30-ba53e7b04e66', '0c97d45a-f8a1-4a3d-96d9-f7449ab81607',
    '11e08503-3ca0-409a-a46d-5bc1f2f5f50f', 'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000006',
    'a1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000008',
    'a1000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-00000000000a',
    'a1000000-0000-4000-8000-00000000000b'
  ]::uuid[]) WITH ORDINALITY AS s(id, ord)
  UNION ALL
  -- Y3 Math > Chapter 1 > Basic Calculation
  SELECT s.id, s.ord
  FROM unnest(ARRAY[
    '0183618e-b41f-42c4-b838-c7caa9647fa6', 'a1000000-0000-4000-8000-000000000003'
  ]::uuid[]) WITH ORDINALITY AS s(id, ord)
  UNION ALL
  -- Y2 English > Grammar > Verbs
  SELECT s.id, s.ord
  FROM unnest(ARRAY[
    '49f16772-57a6-44a8-8d27-76d8f29eb8bc', 'bd94736c-87a9-45fb-98b7-b5dbf1da58e3'
  ]::uuid[]) WITH ORDINALITY AS s(id, ord)
  UNION ALL
  -- Y2 English > Comprehension > Unit 5
  SELECT s.id, s.ord
  FROM unnest(ARRAY['05054756-a6c3-4074-80c4-a6dbb3f5ec00']::uuid[]) WITH ORDINALITY AS s(id, ord)
) AS o
WHERE q.id = o.id;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 8a. THE BUILDER'S SAMPLE STAGE (P23a)                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- One stage — Year 4 Science > Chapter 1 > Basic Knowledge — laid out the way
-- the admin practice builder lays a stage out: a question of each of the
-- fourteen practice types, every variant a type has (a true/false with its
-- own labels; a cloze answered by typing, from a word bank and from choices;
-- a number in each of its seven forms), then a passage with three questions
-- of its own.
--
-- display_order: the passage and the questions on no passage share ONE
-- sequence (1–24); the passage's questions are a second sequence inside it
-- (1–3). Item ids inside a payload are random short strings, never
-- positional, so an id never gives an answer away.
--
-- The picture of the label_picture question is an object in the
-- question-images bucket. Its file is under supabase/seed/question-images/,
-- at the same path, and `db reset` uploads it (config.toml, objects_path).

INSERT INTO public.passages (id, stage_id, title, body, display_order)
VALUES (
  'a3000000-0000-4000-8000-000000000001',
  '7d8028fe-a9c7-4b60-9a9b-102a07e984f4',
  'Aina’s Bean Plant',
  'Aina planted a bean seed in a pot on Monday. She put the pot near a window and watered it every morning. On Thursday a small root pushed out of the seed. By the next Monday the seedling had two green leaves and was 6 cm tall. Aina put a second pot in a dark cupboard. Its seedling grew tall and thin, and its leaves turned yellow.',
  24
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.questions (id, stage_id, passage_id, display_order, difficulty, payload) VALUES

  -- ── Choose ───────────────────────────────────────────────────────────────

  ('a2000000-0000-4000-8000-000000000001', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 1, 'low',
   '{"type": "mcq",
     "question": "Which part of a plant takes in water from the soil?",
     "options": [
       {"text": "Leaf", "is_correct": false, "tip": "Leaves make food. They do not take in water."},
       {"text": "Root", "is_correct": true},
       {"text": "Stem", "is_correct": false, "tip": "The stem carries water up the plant. It does not take it in."},
       {"text": "Flower", "is_correct": false}
     ]}'::jsonb),

  ('a2000000-0000-4000-8000-000000000002', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 2, 'medium',
   '{"type": "mrq",
     "question": "Tick two things a plant needs to make its own food.",
     "options": [
       {"text": "Sunlight", "is_correct": true},
       {"text": "Water", "is_correct": true},
       {"text": "Soil", "is_correct": false, "tip": "Soil holds the plant and its water. It is not used to make food."},
       {"text": "Darkness", "is_correct": false}
     ]}'::jsonb),

  ('a2000000-0000-4000-8000-000000000003', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 3, 'low',
   '{"type": "true_false",
     "question": "A cactus stores water in its stem.",
     "answer": true,
     "tip": "Think about why a cactus stem is so thick."}'::jsonb),

  -- true_false with its own labels: the word for true, then the word for false.
  ('a2000000-0000-4000-8000-000000000004', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 4, 'low',
   '{"type": "true_false",
     "question": "Can a green plant make food in a dark cupboard?",
     "answer": false,
     "labels": ["Yes", "No"],
     "tip": "Think about what a leaf needs to trap."}'::jsonb),

  -- tick_table: `groups` are the columns, `items` the rows; group_id is the
  -- column a row is ticked under. Answered with response
  -- {"items": [{"id": "...", "group_id": "..."}]}.
  ('a2000000-0000-4000-8000-000000000005', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 5, 'medium',
   '{"type": "tick_table",
     "question": "Tick the part of the plant that does each job.",
     "groups": [
       {"id": "c41f09ab", "text": "Roots"},
       {"id": "7be2d5c0", "text": "Stem"},
       {"id": "e9a3716d", "text": "Leaves"}
     ],
     "items": [
       {"id": "2f8c1a47", "text": "Takes in water from the soil", "group_id": "c41f09ab"},
       {"id": "b06d93e1", "text": "Carries water to the leaves", "group_id": "7be2d5c0"},
       {"id": "91c4f7a8", "text": "Makes food using sunlight", "group_id": "e9a3716d"},
       {"id": "d3a75b2c", "text": "Holds the plant in the ground", "group_id": "c41f09ab"}
     ],
     "tip": "Go through the parts one at a time: roots, stem, leaves."}'::jsonb),

  -- pick_words: the sentence cut into words, in order. Answered with
  -- selected_options, the 1-based positions of the words picked.
  ('a2000000-0000-4000-8000-000000000006', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 6, 'low',
   '{"type": "pick_words",
     "question": "Underline the part of the plant that takes in water.",
     "options": [
       {"text": "The", "is_correct": false},
       {"text": "roots", "is_correct": true},
       {"text": "grow", "is_correct": false},
       {"text": "down", "is_correct": false},
       {"text": "into", "is_correct": false},
       {"text": "the", "is_correct": false},
       {"text": "soil", "is_correct": false},
       {"text": "while", "is_correct": false},
       {"text": "the", "is_correct": false},
       {"text": "leaves", "is_correct": false},
       {"text": "face", "is_correct": false},
       {"text": "the", "is_correct": false},
       {"text": "sun.", "is_correct": false}
     ],
     "tip": "This part is under the ground."}'::jsonb),

  -- ── Fill in ──────────────────────────────────────────────────────────────

  -- cloze, typing (no `mode` = typing).
  ('a2000000-0000-4000-8000-000000000007', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 7, 'medium',
   '{"type": "cloze",
     "question": "Fill in the blanks with the correct words.",
     "text": "The {{1}} take in water from the soil. The {{2}} carries the water to the {{3}}.",
     "blanks": [
       {"index": 1, "accepted": ["roots", "root"]},
       {"index": 2, "accepted": ["stem"]},
       {"index": 3, "accepted": ["leaves", "leaf"]}
     ],
     "tip": "Follow the water: it goes in at the bottom and travels up."}'::jsonb),

  -- cloze, word bank: the bank is every blank's first accepted answer plus
  -- the distractors.
  ('a2000000-0000-4000-8000-000000000008', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 8, 'medium',
   '{"type": "cloze",
     "mode": "bank",
     "question": "Use the words in the box to fill in the blanks.",
     "text": "A seed needs {{1}}, air and warmth to start growing. First a {{2}} pushes out of the seed, then a {{3}} grows up towards the light.",
     "blanks": [
       {"index": 1, "accepted": ["water"]},
       {"index": 2, "accepted": ["root"]},
       {"index": 3, "accepted": ["shoot"]}
     ],
     "distractors": ["flower", "fruit"],
     "tip": "Which part of a seedling do you see first?"}'::jsonb),

  -- cloze, choices: two to four choices a blank, the answer among them.
  ('a2000000-0000-4000-8000-000000000009', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 9, 'low',
   '{"type": "cloze",
     "mode": "choices",
     "question": "Choose the correct word for each blank.",
     "text": "The {{1}} of a plant makes its seeds. Bees carry {{2}} from one flower to another.",
     "blanks": [
       {"index": 1, "accepted": ["flower"], "choices": ["flower", "leaf", "root"]},
       {"index": 2, "accepted": ["pollen"], "choices": ["pollen", "water", "soil", "seeds"]}
     ],
     "tip": "Bees visit the colourful part of the plant."}'::jsonb),

  ('a2000000-0000-4000-8000-00000000000a', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 10, 'high',
   '{"type": "short_answer",
     "question": "Name the green substance in leaves that traps sunlight.",
     "accepted_answers": ["chlorophyll", "klorofil"],
     "tip": "Its name starts with “chloro”, which means green."}'::jsonb),

  -- word_completion: one box a letter. Answered with text_answer, the whole word.
  ('a2000000-0000-4000-8000-00000000000b', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 11, 'low',
   '{"type": "word_completion",
     "question": "The flat green part of a plant that makes food.",
     "answer": "leaf",
     "reveal_first": true,
     "tip": "A tree drops these in dry weather."}'::jsonb),

  -- numeric, one of each form. No `form` = number.
  ('a2000000-0000-4000-8000-00000000000c', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 12, 'medium',
   '{"type": "numeric",
     "question": "A seedling is 4.5 cm tall. It grows 1.2 cm every week. How tall is it after 3 weeks?",
     "answer": 8.1,
     "tolerance": 0,
     "unit": "cm",
     "tip": "Work out how much it grows in three weeks first."}'::jsonb),

  -- fraction: parts = [numerator, denominator].
  ('a2000000-0000-4000-8000-00000000000d', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 13, 'medium',
   '{"type": "numeric",
     "form": "fraction",
     "question": "8 seeds were planted and 6 of them sprouted. What fraction of the seeds sprouted? Give the simplest form.",
     "parts": [3, 4],
     "tip": "Divide the top and the bottom by the same number."}'::jsonb),

  -- mixed: parts = [whole, numerator, denominator].
  ('a2000000-0000-4000-8000-00000000000e', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 14, 'medium',
   '{"type": "numeric",
     "form": "mixed",
     "question": "Each pot needs ½ ℓ of water. How much water do 5 pots need?",
     "parts": [2, 1, 2],
     "improper": true,
     "unit": "ℓ",
     "tip": "Two halves make one whole."}'::jsonb),

  -- ratio: parts = [a, b] or [a, b, c].
  ('a2000000-0000-4000-8000-00000000000f', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 15, 'low',
   '{"type": "numeric",
     "form": "ratio",
     "question": "A garden has 5 rose plants and 7 orchid plants. What is the ratio of rose plants to orchid plants?",
     "parts": [5, 7],
     "equivalent": true,
     "tip": "Write the number of rose plants first."}'::jsonb),

  -- money: answer in ringgit.
  ('a2000000-0000-4000-8000-000000000010', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 16, 'low',
   '{"type": "numeric",
     "form": "money",
     "question": "A pot costs RM4.80. How much do 4 pots cost?",
     "answer": 19.2,
     "tip": "Multiply the ringgit and the sen separately, then add them."}'::jsonb),

  -- time: parts = [hour, minute]; period am / pm, or null for a 24-hour clock.
  ('a2000000-0000-4000-8000-000000000011', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 17, 'high',
   '{"type": "numeric",
     "form": "time",
     "question": "Watering starts at 4:35 p.m. and takes 1 hour 15 minutes. At what time does it end?",
     "parts": [5, 50],
     "period": "pm",
     "tip": "Add the hour first, then the minutes."}'::jsonb),

  -- measure: parts = [large, small] in the two `units`.
  ('a2000000-0000-4000-8000-000000000012', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 18, 'high',
   '{"type": "numeric",
     "form": "measure",
     "question": "6 ℓ 450 mℓ of water is shared equally among 3 trays. How much water is in each tray?",
     "parts": [2, 150],
     "units": ["ℓ", "mℓ"],
     "tip": "Share the litres first, then the millilitres."}'::jsonb),

  -- ── Arrange ──────────────────────────────────────────────────────────────

  -- matching: one pair a left item; the right column carries an extra answer.
  ('a2000000-0000-4000-8000-000000000013', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 19, 'medium',
   '{"type": "matching",
     "question": "Match each part of a plant to what it does.",
     "left": [
       {"id": "5d1e8f30", "text": "Roots"},
       {"id": "a7c92b64", "text": "Leaves"},
       {"id": "0e6f4d19", "text": "Flower"}
     ],
     "right": [
       {"id": "f28b0c75", "text": "Make food"},
       {"id": "63d9a1e2", "text": "Make seeds"},
       {"id": "bc50e7f8", "text": "Take in water"},
       {"id": "19a4c3d6", "text": "Carry water up the plant"}
     ],
     "pairs": [
       {"left_id": "5d1e8f30", "right_id": "bc50e7f8"},
       {"left_id": "a7c92b64", "right_id": "f28b0c75"},
       {"left_id": "0e6f4d19", "right_id": "63d9a1e2"}
     ],
     "tip": "Start with the part you are surest about."}'::jsonb),

  -- ordering: answered with response {"order": ["...", "..."]}.
  ('a2000000-0000-4000-8000-000000000014', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 20, 'medium',
   '{"type": "ordering",
     "question": "Put the stages of a bean plant’s growth in order.",
     "items": [
       {"id": "8a3f5c21", "text": "Seed"},
       {"id": "d47e09b6", "text": "Seedling"},
       {"id": "2c6b8e93", "text": "Young plant"},
       {"id": "e15d7a04", "text": "Adult plant"}
     ],
     "correct_order": ["8a3f5c21", "d47e09b6", "2c6b8e93", "e15d7a04"],
     "tip": "Every plant here starts as a seed."}'::jsonb),

  -- rearrange: the chips of one sentence; the whole sentence must be in order.
  ('a2000000-0000-4000-8000-000000000015', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 21, 'low',
   '{"type": "rearrange",
     "question": "Arrange the words to make a sentence.",
     "items": [
       {"id": "74b1e0c9", "text": "Plants"},
       {"id": "c08d36a5", "text": "need"},
       {"id": "3e97f41b", "text": "sunlight"},
       {"id": "a5627d80", "text": "and"},
       {"id": "916c0be3", "text": "water"},
       {"id": "f3d85a17", "text": "to"},
       {"id": "0b4a92ce", "text": "grow."}
     ],
     "correct_order": ["74b1e0c9", "c08d36a5", "3e97f41b", "a5627d80", "916c0be3", "f3d85a17", "0b4a92ce"],
     "tip": "A sentence starts with a capital letter."}'::jsonb),

  -- classify: answered with response {"items": [{"id": "...", "group_id": "..."}]}.
  ('a2000000-0000-4000-8000-000000000016', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 22, 'high',
   '{"type": "classify",
     "question": "Sort the plants into two groups.",
     "groups": [
       {"id": "6e2a9f58", "text": "Flowering plants"},
       {"id": "b9173c4d", "text": "Non-flowering plants"}
     ],
     "items": [
       {"id": "41c8d0a7", "text": "Hibiscus", "group_id": "6e2a9f58"},
       {"id": "d5f61b39", "text": "Fern", "group_id": "b9173c4d"},
       {"id": "07ae4c82", "text": "Paddy", "group_id": "6e2a9f58"},
       {"id": "9c3b75e6", "text": "Moss", "group_id": "b9173c4d"},
       {"id": "e80d2f14", "text": "Durian tree", "group_id": "6e2a9f58"},
       {"id": "2a94b6c0", "text": "Pine", "group_id": "b9173c4d"}
     ],
     "tip": "Ferns and mosses make spores, not flowers."}'::jsonb),

  -- ── On a picture ─────────────────────────────────────────────────────────

  -- label_picture: x and y are percent of the picture's width and height.
  -- Answered with response {"labels": [{"id": "...", "value": "..."}]}.
  ('a2000000-0000-4000-8000-000000000017', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', NULL, 23, 'medium',
   '{"type": "label_picture",
     "question": "Label the parts of the plant.",
     "image_path": "stages/7d8028fe-a9c7-4b60-9a9b-102a07e984f4/5b0c9d4e-6f1a-4c7e-9b1d-2a3e4f5a6b7c.png",
     "mode": "bank",
     "labels": [
       {"id": "c7e1a359", "text": "Flower", "x": 50, "y": 20},
       {"id": "38f0b6d2", "text": "Leaf", "x": 33, "y": 46},
       {"id": "a94d5e70", "text": "Stem", "x": 50, "y": 58},
       {"id": "5b2c8f1e", "text": "Roots", "x": 50, "y": 86}
     ],
     "distractors": ["Seed"],
     "tip": "The roots are the part under the soil."}'::jsonb),

  -- ── On the passage "Aina’s Bean Plant" ───────────────────────────────────

  ('a2000000-0000-4000-8000-000000000018', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', 'a3000000-0000-4000-8000-000000000001', 1, 'low',
   '{"type": "mcq",
     "question": "What grew out of the seed first?",
     "options": [
       {"text": "A root", "is_correct": true},
       {"text": "A leaf", "is_correct": false, "tip": "Read what happened on Thursday."},
       {"text": "A flower", "is_correct": false}
     ]}'::jsonb),

  ('a2000000-0000-4000-8000-000000000019', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', 'a3000000-0000-4000-8000-000000000001', 2, 'medium',
   '{"type": "mrq",
     "question": "Tick two things Aina did for the first seedling.",
     "options": [
       {"text": "Watered it every morning", "is_correct": true},
       {"text": "Put it near a window", "is_correct": true},
       {"text": "Kept it in a cupboard", "is_correct": false, "tip": "That was the second pot."},
       {"text": "Covered it with a box", "is_correct": false}
     ]}'::jsonb),

  ('a2000000-0000-4000-8000-00000000001a', '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', 'a3000000-0000-4000-8000-000000000001', 3, 'high',
   '{"type": "short_answer",
     "question": "What did the seedling in the cupboard not get?",
     "accepted_answers": ["sunlight", "light", "cahaya matahari"],
     "tip": "Read the last two sentences again."}'::jsonb)

ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 8c. YEAR 1 MATHEMATICS — THE REST OF ITS PATH                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Year 1 Mathematics is the subject of three classrooms, so its path is the
-- one pupils see most: with these, both of its topics have stages to play
-- (three and two). Higher-Order Thinking of Chapter 1 serves its questions in
-- random order; every other stage keeps the builder's order.

UPDATE public.stages
SET question_order = 'random'
WHERE id = 'a5cf5c0e-a7d6-4009-97fe-d453445791ee';

INSERT INTO public.questions (id, stage_id, display_order, difficulty, payload) VALUES

  -- ── Chapter 1 > Number Patterns ──────────────────────────────────────────

  ('a4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1, 'low',
   '{"type": "mcq",
     "question": "2, 4, 6, 8, 下一个数是多少？",
     "options": [
       {"text": "9", "is_correct": false, "tip": "这是两个两个地数，不是加 1。"},
       {"text": "10", "is_correct": true},
       {"text": "12", "is_correct": false, "tip": "你跳过了一个数。"},
       {"text": "11", "is_correct": false, "tip": "每一步都是双数。"}
     ]}'::jsonb),

  ('a4000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 2, 'low',
   '{"type": "numeric",
     "question": "10, 20, 30, 下一个数是多少？",
     "answer": 40,
     "tip": "每一步都多一个十。"}'::jsonb),

  ('a4000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 3, 'low',
   '{"type": "true_false",
     "question": "5, 10, 15, 20 是五个五个地数。",
     "answer": true,
     "tip": "看看相邻的两个数相差多少。"}'::jsonb),

  ('a4000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 4, 'medium',
   '{"type": "ordering",
     "question": "把这些数从小到大排列。",
     "items": [
       {"id": "k3f81b2a", "text": "27"},
       {"id": "p9d04c7e", "text": "9"},
       {"id": "m5a62e19", "text": "43"},
       {"id": "t1c97f40", "text": "18"}
     ],
     "correct_order": ["p9d04c7e", "t1c97f40", "k3f81b2a", "m5a62e19"],
     "tip": "先比十位，十位相同再比个位。"}'::jsonb),

  -- ── Chapter 1 > Higher-Order Thinking (random order) ─────────────────────

  ('a4000000-0000-4000-8000-000000000005', 'a5cf5c0e-a7d6-4009-97fe-d453445791ee', 1, 'high',
   '{"type": "mcq",
     "question": "小明有 12 颗糖，给了弟弟 5 颗，又买了 3 颗。他现在有多少颗糖？",
     "options": [
       {"text": "10", "is_correct": true},
       {"text": "7", "is_correct": false, "tip": "别忘了他后来又买了 3 颗。"},
       {"text": "20", "is_correct": false, "tip": "给出去的糖要减掉，不是加上。"},
       {"text": "4", "is_correct": false, "tip": "买来的糖要加上，不是减掉。"}
     ]}'::jsonb),

  ('a4000000-0000-4000-8000-000000000006', 'a5cf5c0e-a7d6-4009-97fe-d453445791ee', 2, 'high',
   '{"type": "numeric",
     "question": "我是一个两位数，十位是 4，个位比十位多 3。我是多少？",
     "answer": 47,
     "tip": "先算出个位：4 加 3 是多少？"}'::jsonb),

  ('a4000000-0000-4000-8000-000000000007', 'a5cf5c0e-a7d6-4009-97fe-d453445791ee', 3, 'medium',
   '{"type": "short_answer",
     "question": "比 59 大 1 的数是多少？",
     "accepted_answers": ["60", "六十"],
     "tip": "个位满十，要向十位进一。"}'::jsonb),

  ('a4000000-0000-4000-8000-000000000008', 'a5cf5c0e-a7d6-4009-97fe-d453445791ee', 4, 'medium',
   '{"type": "mrq",
     "question": "以下哪些数的十位是 3（可选多个）？",
     "options": [
       {"text": "34", "is_correct": true},
       {"text": "43", "is_correct": false, "tip": "43 的十位是 4，个位才是 3。"},
       {"text": "30", "is_correct": true},
       {"text": "13", "is_correct": false, "tip": "13 的十位是 1。"}
     ]}'::jsonb),

  -- ── Chapter 2 > Basic Calculation ────────────────────────────────────────

  ('a4000000-0000-4000-8000-000000000009', 'ae3333dc-fc77-44e6-bd19-d8032ee310b5', 1, 'low',
   '{"type": "mcq",
     "question": "7 + 5 = ？",
     "options": [
       {"text": "12", "is_correct": true},
       {"text": "11", "is_correct": false, "tip": "先凑十：7 加 3 是 10，还剩几？"},
       {"text": "13", "is_correct": false, "tip": "多数了一个，再数一次。"},
       {"text": "2", "is_correct": false, "tip": "这是加法，不是减法。"}
     ]}'::jsonb),

  ('a4000000-0000-4000-8000-00000000000a', 'ae3333dc-fc77-44e6-bd19-d8032ee310b5', 2, 'low',
   '{"type": "numeric",
     "question": "15 − 6 = ？",
     "answer": 9,
     "tip": "先减 5 到 10，再减 1。"}'::jsonb),

  ('a4000000-0000-4000-8000-00000000000b', 'ae3333dc-fc77-44e6-bd19-d8032ee310b5', 3, 'medium',
   '{"type": "cloze",
     "question": "填上正确的数。",
     "text": "8 + {{1}} = 10，10 − {{2}} = 7",
     "blanks": [
       {"index": 1, "accepted": ["2", "二"]},
       {"index": 2, "accepted": ["3", "三"]}
     ],
     "tip": "想一想：几和几合起来是 10？"}'::jsonb),

  ('a4000000-0000-4000-8000-00000000000c', 'ae3333dc-fc77-44e6-bd19-d8032ee310b5', 4, 'low',
   '{"type": "true_false",
     "question": "9 + 9 = 19。",
     "answer": false,
     "tip": "9 加 9 比 10 加 9 少 1。"}'::jsonb),

  ('a4000000-0000-4000-8000-00000000000d', 'ae3333dc-fc77-44e6-bd19-d8032ee310b5', 5, 'medium',
   '{"type": "matching",
     "question": "把算式和答案连起来。",
     "left": [
       {"id": "h2b7d915", "text": "6 + 4"},
       {"id": "q8e13a6c", "text": "12 − 5"},
       {"id": "w4f90c2b", "text": "3 + 8"}
     ],
     "right": [
       {"id": "n6a51e83", "text": "11"},
       {"id": "z0c84d7f", "text": "10"},
       {"id": "r3d29b54", "text": "7"},
       {"id": "y7e60a1d", "text": "9"}
     ],
     "pairs": [
       {"left_id": "h2b7d915", "right_id": "z0c84d7f"},
       {"left_id": "q8e13a6c", "right_id": "r3d29b54"},
       {"left_id": "w4f90c2b", "right_id": "n6a51e83"}
     ],
     "tip": "先算你最有把握的那一题。"}'::jsonb),

  -- ── Chapter 2 > Higher-Order Thinking ────────────────────────────────────

  ('a4000000-0000-4000-8000-00000000000e', 'd0c0da71-c5b9-4ebd-8f2a-df880f7994a9', 1, 'high',
   '{"type": "mcq",
     "question": "巴士上有 9 个人。到站后下去了 4 个人，又上来了 6 个人。现在巴士上有多少个人？",
     "options": [
       {"text": "11", "is_correct": true},
       {"text": "5", "is_correct": false, "tip": "别忘了又上来了 6 个人。"},
       {"text": "19", "is_correct": false, "tip": "下车的人要减掉。"},
       {"text": "7", "is_correct": false, "tip": "上车的人要加上，不是减掉。"}
     ]}'::jsonb),

  ('a4000000-0000-4000-8000-00000000000f', 'd0c0da71-c5b9-4ebd-8f2a-df880f7994a9', 2, 'high',
   '{"type": "numeric",
     "question": "一本书 8 令吉，一支笔 3 令吉。买一本书和两支笔要多少令吉？",
     "answer": 14,
     "unit": "令吉",
     "tip": "先算两支笔一共多少钱。"}'::jsonb),

  ('a4000000-0000-4000-8000-000000000010', 'd0c0da71-c5b9-4ebd-8f2a-df880f7994a9', 3, 'medium',
   '{"type": "classify",
     "question": "把算式分成两组。",
     "groups": [
       {"id": "g5c18e0a", "text": "答案是 10"},
       {"id": "g9d47b3f", "text": "答案不是 10"}
     ],
     "items": [
       {"id": "i1a83f6d", "text": "4 + 6", "group_id": "g5c18e0a"},
       {"id": "i7b20c9e", "text": "7 + 2", "group_id": "g9d47b3f"},
       {"id": "i3e96d41", "text": "5 + 5", "group_id": "g5c18e0a"},
       {"id": "i8f05a2c", "text": "13 − 3", "group_id": "g5c18e0a"},
       {"id": "i6c71e98", "text": "8 + 3", "group_id": "g9d47b3f"}
     ],
     "tip": "一题一题算出来，再放进对的组。"}'::jsonb);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 8b. QUESTION LEARNING-POINT TAGS (Revamp 2.3 — decision 57/59)           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Platform-global, admin-managed vocabulary (names lowercased + trimmed).
-- question_tags cascades from questions, so section 8's DELETE FROM questions
-- clears the join rows on a re-run; both inserts below re-create them.

INSERT INTO public.tags (id, name)
VALUES
  ('a7000000-0000-4000-8000-000000000001', 'place value'),
  ('a7000000-0000-4000-8000-000000000002', 'counting'),
  ('a7000000-0000-4000-8000-000000000003', 'even and odd numbers'),
  ('a7000000-0000-4000-8000-000000000004', 'addition'),
  ('a7000000-0000-4000-8000-000000000005', 'verbs'),
  ('a7000000-0000-4000-8000-000000000006', 'days of the week'),
  ('a7000000-0000-4000-8000-000000000007', 'parts of a plant'),
  ('a7000000-0000-4000-8000-000000000008', 'what plants need'),
  ('a7000000-0000-4000-8000-000000000009', 'observing and measuring')
ON CONFLICT (id) DO NOTHING;

-- Learning points are scoped to TOPICS since P19a, and a tag offered nowhere
-- shows up in no picker. The five number tags belong to Year 1 Mathematics;
-- the two language ones to Year 2 English; the three plant ones to the topic
-- of the builder's sample stage (8a), Year 4 Science, so its picker has
-- something to offer.
INSERT INTO public.tag_topics (tag_id, topic_id)
VALUES
  ('a7000000-0000-4000-8000-000000000001', 'bc9fb793-5026-4241-94ac-54ab709f0518'),
  ('a7000000-0000-4000-8000-000000000002', 'bc9fb793-5026-4241-94ac-54ab709f0518'),
  ('a7000000-0000-4000-8000-000000000003', 'bc9fb793-5026-4241-94ac-54ab709f0518'),
  ('a7000000-0000-4000-8000-000000000004', 'f73c2614-9ce0-45eb-81ac-21f7c6575bb5'),
  ('a7000000-0000-4000-8000-000000000005', '50da1a03-8668-4da5-bc88-086ca1cccd2b'),
  ('a7000000-0000-4000-8000-000000000006', '50da1a03-8668-4da5-bc88-086ca1cccd2b'),
  ('a7000000-0000-4000-8000-000000000007', 'f99902cc-d0d2-4358-8367-6f35448c2302'),
  ('a7000000-0000-4000-8000-000000000008', 'f99902cc-d0d2-4358-8367-6f35448c2302'),
  ('a7000000-0000-4000-8000-000000000009', 'f99902cc-d0d2-4358-8367-6f35448c2302')
ON CONFLICT DO NOTHING;

-- Tag several seeded questions (a question may carry multiple tags).
INSERT INTO public.question_tags (question_id, tag_id)
VALUES
  -- 15,20,25,30 -> next  (counting)
  ('073d50c7-22e1-43c1-be30-ba53e7b04e66', 'a7000000-0000-4000-8000-000000000002'),
  -- ones digit of 7  (place value)
  ('0c97d45a-f8a1-4a3d-96d9-f7449ab81607', 'a7000000-0000-4000-8000-000000000001'),
  -- largest number  (place value)
  ('11e08503-3ca0-409a-a46d-5bc1f2f5f50f', 'a7000000-0000-4000-8000-000000000001'),
  -- which are even (MRQ)  (even/odd + counting)
  ('a1000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003'),
  ('a1000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002'),
  -- 10 + 10  (addition)
  ('a1000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000004'),
  -- 3 thousands 14 tens 5 ones  (place value + addition)
  ('0183618e-b41f-42c4-b838-c7caa9647fa6', 'a7000000-0000-4000-8000-000000000001'),
  ('0183618e-b41f-42c4-b838-c7caa9647fa6', 'a7000000-0000-4000-8000-000000000004'),
  -- brush my teeth  (verbs)
  ('49f16772-57a6-44a8-8d27-76d8f29eb8bc', 'a7000000-0000-4000-8000-000000000005'),
  -- read books  (verbs)
  ('bd94736c-87a9-45fb-98b7-b5dbf1da58e3', 'a7000000-0000-4000-8000-000000000005'),
  -- days order  (days of the week)
  ('05054756-a6c3-4074-80c4-a6dbb3f5ec00', 'a7000000-0000-4000-8000-000000000006')
ON CONFLICT DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. CLASSROOMS AND WHO IS IN THEM                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Each classroom is there for a case to test; the table at the top of the
-- file lists them. All are the demo center's, created by its manager. The one from 2025 is archived at the end of the file, once its
-- practice is on record.

INSERT INTO public.classrooms (id, organization_id, grade_level_id, subject_id, name, created_by)
SELECT v.id, m.organization_id, s.grade_level_id, s.id, v.name, m.id
FROM (VALUES
  ('c1000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-0000-0000-000000000005'::uuid,
   '9d077a3d-b673-4760-9c44-218f0f25b2b1'::uuid, '一年级数学 A组 Year 1 Math (Group A)'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000005',
   '9d077a3d-b673-4760-9c44-218f0f25b2b1', '一年级数学 B组 Year 1 Math (Group B)'),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000005',
   '1129720c-0a04-4832-8bbd-a8ffabfd8bc6', '四年级科学 Year 4 Science'),
  ('c1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000005',
   'f73988ca-1c4e-4b22-8455-eb32c5c1e1c8', '二年级英文 Year 2 English'),
  ('c1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000005',
   '870a3904-e38c-45de-819c-fc36bc71535a', '五年级国文 Year 5 Bahasa Melayu'),
  ('c1000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000005',
   '3ac69c39-64d4-4d60-8c90-0dea1b2cd39a', '三年级数学 Year 3 Math (New)'),
  ('c1000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000005',
   '9d077a3d-b673-4760-9c44-218f0f25b2b1', '一年级数学 2025 Year 1 Math (2025)')
) AS v(id, manager_id, subject_id, name)
JOIN public.profiles m ON m.id = v.manager_id
JOIN public.subjects s ON s.id = v.subject_id;

INSERT INTO public.classroom_teachers (classroom_id, teacher_id)
VALUES
  -- Ms Lee: both Year 1 groups, Year 4 Science and the class of 2025.
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000006'),
  -- Mr Kumar: Year 4 Science with Ms Lee, and two classrooms of his own.
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000007'),
  ('c1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000007'),
  ('c1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000007');

INSERT INTO public.classroom_students (classroom_id, student_id)
VALUES
  -- Year 1 Math (Group A): Alice, Ben
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000003'),
  -- Year 1 Math (Group B): Alice
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000002'),
  -- Year 4 Science: Alice, Ben
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000003'),
  -- Year 2 English: Ben
  ('c1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000003'),
  -- Year 5 Bahasa Melayu: Ben
  ('c1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000003'),
  -- Year 1 Math (2025): Alice
  ('c1000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000002');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 10. PRACTICE ON RECORD                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Each row is one finished stage, handed in the way the app hands it in:
-- through submit_practice_session, as the student, so the marks are the
-- grader's own and never written here. It is then moved back in time, so that
-- two goes at one stage have an order.
--
-- An answer names its question and carries what the type is answered with:
-- selected_options (the numbers of the options picked), text_answer, or a
-- response object. A question left out was left blank.
--
-- What to look for afterwards:
--   Alice, Group A   Basic Calculation twice (the later score shows), Number
--                    Patterns with full marks; Higher-Order Thinking is next
--   Alice, Group B   one other stage: a classroom keeps its own progress
--   Alice, Science   the stage of every type, with most types answered
--   Ben, Group A     Number Patterns handed in with every question blank
--   Ben, English     Verbs twice, the second go with full marks

DO $$
DECLARE
  s record;
  v_session uuid;
BEGIN
  FOR s IN
    SELECT * FROM (VALUES

      -- ── Alice ──────────────────────────────────────────────────────────────
      -- Group A > Basic Calculation, first go: two right, one wrong, ten blank.
      ('00000000-0000-0000-0000-000000000002'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid,
       '4e61c11b-d12e-449f-bdd6-44cf5639a692'::uuid, interval '3 days',
       '[{"question_id": "073d50c7-22e1-43c1-be30-ba53e7b04e66", "selected_options": [2]},
         {"question_id": "0c97d45a-f8a1-4a3d-96d9-f7449ab81607", "selected_options": [1]},
         {"question_id": "11e08503-3ca0-409a-a46d-5bc1f2f5f50f", "selected_options": [2]}]'::jsonb),

      -- Group A > Basic Calculation, second go: most right, some in part, one blank.
      ('00000000-0000-0000-0000-000000000002', 'c1000000-0000-4000-8000-000000000001',
       '4e61c11b-d12e-449f-bdd6-44cf5639a692', interval '1 day',
       '[{"question_id": "073d50c7-22e1-43c1-be30-ba53e7b04e66", "selected_options": [2]},
         {"question_id": "0c97d45a-f8a1-4a3d-96d9-f7449ab81607", "selected_options": [2]},
         {"question_id": "11e08503-3ca0-409a-a46d-5bc1f2f5f50f", "selected_options": [2]},
         {"question_id": "a1000000-0000-4000-8000-000000000001", "selected_options": [1]},
         {"question_id": "a1000000-0000-4000-8000-000000000002", "text_answer": "20"},
         {"question_id": "a1000000-0000-4000-8000-000000000004", "response": {"value": false}},
         {"question_id": "a1000000-0000-4000-8000-000000000005", "response": {"value": true}},
         {"question_id": "a1000000-0000-4000-8000-000000000006", "text_answer": "25"},
         {"question_id": "a1000000-0000-4000-8000-000000000007", "text_answer": "18"},
         {"question_id": "a1000000-0000-4000-8000-000000000008",
          "response": {"blanks": [{"index": 1, "value": "15"}, {"index": 2, "value": "20"}]}},
         {"question_id": "a1000000-0000-4000-8000-000000000009",
          "response": {"blanks": [{"index": 1, "value": "3"}, {"index": 2, "value": "4"}]}},
         {"question_id": "a1000000-0000-4000-8000-00000000000a",
          "response": {"pairs": [{"left_id": "l1", "right_id": "r3"}, {"left_id": "l2", "right_id": "r1"},
                                 {"left_id": "l3", "right_id": "r2"}]}}]'),

      -- Group A > Number Patterns: full marks.
      ('00000000-0000-0000-0000-000000000002', 'c1000000-0000-4000-8000-000000000001',
       'b1000000-0000-4000-8000-000000000001', interval '2 days',
       '[{"question_id": "a4000000-0000-4000-8000-000000000001", "selected_options": [2]},
         {"question_id": "a4000000-0000-4000-8000-000000000002", "text_answer": "40"},
         {"question_id": "a4000000-0000-4000-8000-000000000003", "response": {"value": true}},
         {"question_id": "a4000000-0000-4000-8000-000000000004",
          "response": {"order": ["p9d04c7e", "t1c97f40", "k3f81b2a", "m5a62e19"]}}]'),

      -- Group B > Chapter 2 > Basic Calculation: three of five.
      ('00000000-0000-0000-0000-000000000002', 'c1000000-0000-4000-8000-000000000002',
       'ae3333dc-fc77-44e6-bd19-d8032ee310b5', interval '1 day',
       '[{"question_id": "a4000000-0000-4000-8000-000000000009", "selected_options": [1]},
         {"question_id": "a4000000-0000-4000-8000-00000000000a", "text_answer": "9"},
         {"question_id": "a4000000-0000-4000-8000-00000000000b",
          "response": {"blanks": [{"index": 1, "value": "2"}, {"index": 2, "value": "4"}]}},
         {"question_id": "a4000000-0000-4000-8000-00000000000c", "response": {"value": false}},
         {"question_id": "a4000000-0000-4000-8000-00000000000d",
          "response": {"pairs": [{"left_id": "h2b7d915", "right_id": "y7e60a1d"}]}}]'),

      -- Year 4 Science > the stage of every type: an answer of each kind, right,
      -- wrong and in part. The money, time and measure questions are left blank.
      ('00000000-0000-0000-0000-000000000002', 'c1000000-0000-4000-8000-000000000003',
       '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', interval '5 hours',
       '[{"question_id": "a2000000-0000-4000-8000-000000000001", "selected_options": [2]},
         {"question_id": "a2000000-0000-4000-8000-000000000002", "selected_options": [1, 2]},
         {"question_id": "a2000000-0000-4000-8000-000000000003", "response": {"value": true}},
         {"question_id": "a2000000-0000-4000-8000-000000000004", "response": {"value": true}},
         {"question_id": "a2000000-0000-4000-8000-000000000005",
          "response": {"items": [{"id": "2f8c1a47", "group_id": "c41f09ab"}, {"id": "b06d93e1", "group_id": "7be2d5c0"},
                                 {"id": "91c4f7a8", "group_id": "e9a3716d"}, {"id": "d3a75b2c", "group_id": "7be2d5c0"}]}},
         {"question_id": "a2000000-0000-4000-8000-000000000006", "selected_options": [2]},
         {"question_id": "a2000000-0000-4000-8000-000000000007",
          "response": {"blanks": [{"index": 1, "value": "roots"}, {"index": 2, "value": "stem"}, {"index": 3, "value": "leaves"}]}},
         {"question_id": "a2000000-0000-4000-8000-000000000008",
          "response": {"blanks": [{"index": 1, "value": "water"}, {"index": 2, "value": "shoot"}, {"index": 3, "value": "root"}]}},
         {"question_id": "a2000000-0000-4000-8000-000000000009",
          "response": {"blanks": [{"index": 1, "value": "flower"}, {"index": 2, "value": "pollen"}]}},
         {"question_id": "a2000000-0000-4000-8000-00000000000a", "text_answer": "Chlorophyll"},
         {"question_id": "a2000000-0000-4000-8000-00000000000b", "text_answer": "leaf"},
         {"question_id": "a2000000-0000-4000-8000-00000000000c", "text_answer": "8.1"},
         {"question_id": "a2000000-0000-4000-8000-00000000000d", "response": {"parts": [3, 4]}},
         {"question_id": "a2000000-0000-4000-8000-00000000000e", "response": {"parts": [2, 1, 2]}},
         {"question_id": "a2000000-0000-4000-8000-00000000000f", "response": {"parts": [7, 5]}},
         {"question_id": "a2000000-0000-4000-8000-000000000013",
          "response": {"pairs": [{"left_id": "5d1e8f30", "right_id": "bc50e7f8"}, {"left_id": "a7c92b64", "right_id": "f28b0c75"},
                                 {"left_id": "0e6f4d19", "right_id": "63d9a1e2"}]}},
         {"question_id": "a2000000-0000-4000-8000-000000000014",
          "response": {"order": ["8a3f5c21", "2c6b8e93", "d47e09b6", "e15d7a04"]}},
         {"question_id": "a2000000-0000-4000-8000-000000000015",
          "response": {"order": ["74b1e0c9", "c08d36a5", "3e97f41b", "a5627d80", "916c0be3", "f3d85a17", "0b4a92ce"]}},
         {"question_id": "a2000000-0000-4000-8000-000000000016",
          "response": {"items": [{"id": "41c8d0a7", "group_id": "6e2a9f58"}, {"id": "d5f61b39", "group_id": "b9173c4d"},
                                 {"id": "07ae4c82", "group_id": "b9173c4d"}, {"id": "9c3b75e6", "group_id": "b9173c4d"},
                                 {"id": "e80d2f14", "group_id": "6e2a9f58"}, {"id": "2a94b6c0", "group_id": "b9173c4d"}]}},
         {"question_id": "a2000000-0000-4000-8000-000000000017",
          "response": {"labels": [{"id": "c7e1a359", "value": "Flower"}, {"id": "38f0b6d2", "value": "Leaf"},
                                  {"id": "a94d5e70", "value": "Roots"}, {"id": "5b2c8f1e", "value": "Stem"}]}},
         {"question_id": "a2000000-0000-4000-8000-000000000018", "selected_options": [1]},
         {"question_id": "a2000000-0000-4000-8000-000000000019", "selected_options": [1, 3]},
         {"question_id": "a2000000-0000-4000-8000-00000000001a", "text_answer": "sunlight"}]'),

      -- ── Ben ────────────────────────────────────────────────────────────────
      -- Group A > Basic Calculation: six right, seven blank.
      ('00000000-0000-0000-0000-000000000003', 'c1000000-0000-4000-8000-000000000001',
       '4e61c11b-d12e-449f-bdd6-44cf5639a692', interval '2 days',
       '[{"question_id": "073d50c7-22e1-43c1-be30-ba53e7b04e66", "selected_options": [2]},
         {"question_id": "0c97d45a-f8a1-4a3d-96d9-f7449ab81607", "selected_options": [2]},
         {"question_id": "11e08503-3ca0-409a-a46d-5bc1f2f5f50f", "selected_options": [2]},
         {"question_id": "a1000000-0000-4000-8000-000000000004", "response": {"value": false}},
         {"question_id": "a1000000-0000-4000-8000-000000000005", "response": {"value": true}},
         {"question_id": "a1000000-0000-4000-8000-000000000006", "text_answer": "25"}]'),

      -- Year 4 Science: the first three questions only.
      ('00000000-0000-0000-0000-000000000003', 'c1000000-0000-4000-8000-000000000003',
       '7d8028fe-a9c7-4b60-9a9b-102a07e984f4', interval '1 day',
       '[{"question_id": "a2000000-0000-4000-8000-000000000001", "selected_options": [2]},
         {"question_id": "a2000000-0000-4000-8000-000000000002", "selected_options": [1, 3]},
         {"question_id": "a2000000-0000-4000-8000-000000000003", "response": {"value": false}}]'),

      -- Group A > Number Patterns: handed in with every question blank.
      ('00000000-0000-0000-0000-000000000003', 'c1000000-0000-4000-8000-000000000001',
       'b1000000-0000-4000-8000-000000000001', interval '6 hours', '[]'),

      -- Year 2 English > Verbs, first go: one of two.
      ('00000000-0000-0000-0000-000000000003', 'c1000000-0000-4000-8000-000000000004',
       '8e74125c-d629-4b0e-ab11-c5dfb57856aa', interval '4 days',
       '[{"question_id": "49f16772-57a6-44a8-8d27-76d8f29eb8bc", "selected_options": [1]},
         {"question_id": "bd94736c-87a9-45fb-98b7-b5dbf1da58e3", "selected_options": [1]}]'),

      -- Year 2 English > Verbs, second go: full marks.
      ('00000000-0000-0000-0000-000000000003', 'c1000000-0000-4000-8000-000000000004',
       '8e74125c-d629-4b0e-ab11-c5dfb57856aa', interval '2 days',
       '[{"question_id": "49f16772-57a6-44a8-8d27-76d8f29eb8bc", "selected_options": [2]},
         {"question_id": "bd94736c-87a9-45fb-98b7-b5dbf1da58e3", "selected_options": [1]}]'),

      -- Year 2 English > Unit 5: full marks.
      ('00000000-0000-0000-0000-000000000003', 'c1000000-0000-4000-8000-000000000004',
       '3e7aa63a-900f-42f1-af4d-774b42e6020f', interval '3 days',
       '[{"question_id": "05054756-a6c3-4074-80c4-a6dbb3f5ec00", "selected_options": [2]}]'),

      -- ── The class of 2025, before it is archived: Alice ────────────────────
      ('00000000-0000-0000-0000-000000000002', 'c1000000-0000-4000-8000-000000000007',
       '4e61c11b-d12e-449f-bdd6-44cf5639a692', interval '40 days',
       '[{"question_id": "073d50c7-22e1-43c1-be30-ba53e7b04e66", "selected_options": [2]},
         {"question_id": "a1000000-0000-4000-8000-000000000002", "text_answer": "二十"},
         {"question_id": "a1000000-0000-4000-8000-000000000006", "text_answer": "25"}]')

    ) AS v(student_id, classroom_id, stage_id, ago, answers)
  LOOP
    -- submit_practice_session records for whoever is signed in.
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', s.student_id, 'role', 'authenticated')::text, true);
    PERFORM public.submit_practice_session(s.classroom_id, s.stage_id, s.answers);

    -- It has just been recorded as of now(); every earlier one was moved back.
    UPDATE public.practice_sessions
    SET created_at = now() - s.ago, completed_at = now() - s.ago
    WHERE student_id = s.student_id AND completed_at = now()
    RETURNING id INTO STRICT v_session;

    UPDATE public.practice_answers
    SET answered_at = now() - s.ago
    WHERE session_id = v_session;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- The class of 2025 is over: archived, it shows to its centre's manager only.
UPDATE public.classrooms
SET archived_at = now()
WHERE id = 'c1000000-0000-4000-8000-000000000007';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 11. ASSIGNMENTS                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Three stages Ms Lee has assigned in Year 1 Math (Group A), each moved back
-- in time so that the practice above falls before or after it. An assignment
-- is done by the student's first session of its stage after it was assigned,
-- which is worked out here as submit_practice_session would have recorded it.
--
-- What to look for afterwards:
--   Number Patterns     both students, due yesterday: Alice did it in time
--                       and Ben late
--   Basic Calculation   both, due in three days: Alice has done it; Ben's go
--                       was before it was assigned, and does not count
--   Chapter 2 > Basic Calculation   Ben alone, due two days ago and not done:
--                       overdue
--   Ms Lee's bell       three notifications, the first of them already seen

INSERT INTO public.assignments (id, classroom_id, stage_id, assigned_by, created_at, due_at) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000006',
   now() - interval '3 days', now() - interval '1 day'),
  ('d1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
   '4e61c11b-d12e-449f-bdd6-44cf5639a692', '00000000-0000-0000-0000-000000000006',
   now() - interval '36 hours', now() + interval '3 days'),
  ('d1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001',
   'ae3333dc-fc77-44e6-bd19-d8032ee310b5', '00000000-0000-0000-0000-000000000006',
   now() - interval '5 days', now() - interval '2 days');

INSERT INTO public.assignment_students (assignment_id, classroom_id, student_id, session_id)
SELECT
  a.id,
  a.classroom_id,
  g.student_id,
  (
    SELECT ps.id
    FROM public.practice_sessions ps
    WHERE ps.student_id = g.student_id
      AND ps.classroom_id = a.classroom_id
      AND ps.stage_id = a.stage_id
      AND ps.completed_at >= a.created_at
    ORDER BY ps.completed_at
    LIMIT 1
  )
FROM (VALUES
  ('d1000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid),
  ('d1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000003')
) AS g(assignment_id, student_id)
JOIN public.assignments a ON a.id = g.assignment_id;

-- Ms Lee has seen that Alice did Number Patterns.
UPDATE public.assignment_students
SET seen_at = now() - interval '1 day'
WHERE assignment_id = 'd1000000-0000-4000-8000-000000000001'
  AND student_id = '00000000-0000-0000-0000-000000000002'
  AND session_id IS NOT NULL;


COMMIT;
