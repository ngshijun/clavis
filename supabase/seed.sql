-- =============================================================================
-- CLAVIS STAGING SEED DATA
-- =============================================================================
-- Run against the staging database via:
--   Supabase Dashboard > SQL Editor > paste & run
--   OR: psql $DATABASE_URL -f supabase/seed.sql
--
-- This script is idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
-- It runs as postgres superuser, bypassing RLS.
--
-- Reference data (grade levels, subjects, topics, sub-topics) uses the
-- same UUIDs as production so that staging mirrors the real curriculum.
-- Questions are a small representative sample — prod has 1,200+ questions.
-- =============================================================================

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ORGANIZATION                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The revamp migration also seeds this org; ON CONFLICT keeps whichever row
-- exists. All non-admin test users are attached to it via subquery below.

INSERT INTO public.organizations (name)
VALUES ('Clavis Demo Center')
ON CONFLICT (name) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. TEST USERS                                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- All test accounts use password: Test1234!
-- Admin:    admin@clavis.test    (platform admin, no org)
-- Manager:  manager@clavis.test  (Clavis Demo Center)
-- Teacher:  teacher@clavis.test  (Clavis Demo Center)
-- Student:  student@clavis.test
-- Student2: student2@clavis.test

-- auth.users
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'admin@clavis.test',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin User"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'student@clavis.test',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Alice Tan"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'student2@clavis.test',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Ben Lim"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated',
    'manager@clavis.test',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Mr Wong"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000006',
    'authenticated', 'authenticated',
    'teacher@clavis.test',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Ms Lee"}'::jsonb,
    now(), now(), '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- auth.identities (required for email login)
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'email',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'admin@clavis.test'), now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'email',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'student@clavis.test'), now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'email',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003', 'email', 'student2@clavis.test'), now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'email',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000005', 'email', 'manager@clavis.test'), now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'email',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000006', 'email', 'teacher@clavis.test'), now(), now(), now())
ON CONFLICT DO NOTHING;

-- profiles (admin has no org; everyone else belongs to the demo center)
INSERT INTO public.profiles (id, name, email, user_type, has_completed_tour, organization_id)
SELECT v.id, v.name, v.email, v.user_type::public.user_role, true,
       CASE WHEN v.user_type = 'admin' THEN NULL
            ELSE (SELECT o.id FROM public.organizations o WHERE o.name = 'Clavis Demo Center')
       END
FROM (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Admin User', 'admin@clavis.test',    'admin'),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'Mr Wong',    'manager@clavis.test',  'manager'),
  ('00000000-0000-0000-0000-000000000006'::uuid, 'Ms Lee',     'teacher@clavis.test',  'teacher'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Alice Tan',  'student@clavis.test',  'student'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'Ben Lim',    'student2@clavis.test', 'student')
) AS v(id, name, email, user_type)
ON CONFLICT (id) DO NOTHING;


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
-- created_by = Mr Wong (manager). Revamp 2.2: students are provisioned by the
-- manager, not the teacher. usernames NULL: these mirror legacy email-based
-- students.

INSERT INTO public.student_profiles (id, grade_level_id, preferred_language, created_by)
VALUES
  -- Alice: Year 1
  ('00000000-0000-0000-0000-000000000002', '54081b95-ee5f-43d0-8f95-d640d48bb734', 'en', '00000000-0000-0000-0000-000000000005'),
  -- Ben: Year 2
  ('00000000-0000-0000-0000-000000000003', 'b4b60a7d-e2b9-49be-b2f9-6a5f54a59e3a', 'en', '00000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- The INSERT above is ON CONFLICT DO NOTHING, so existing staging rows keep
-- their old created_by. Repoint the demo students to the manager explicitly so
-- staging reflects Revamp 2.2's manager-provisioning model (idempotent).
UPDATE public.student_profiles
SET created_by = '00000000-0000-0000-0000-000000000005'
WHERE id IN ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');


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
-- ║ 7. SUB-TOPICS (matches prod)                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.sub_topics (id, topic_id, name, display_order)
VALUES
  -- Y1 Math > Chapter 1
  ('4e61c11b-d12e-449f-bdd6-44cf5639a692', 'bc9fb793-5026-4241-94ac-54ab709f0518', '基础计算 Basic Calculation',         1),
  ('a5cf5c0e-a7d6-4009-97fe-d453445791ee', 'bc9fb793-5026-4241-94ac-54ab709f0518', '高阶思维 Higher-Order Thinking',      2),
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
-- ║ 8. QUESTIONS (fresh new-shape sample with per-option tips)               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Revamp 2.1 (decision 44): STAGING ONLY. Wipe the whole question bank and
-- everything that references it, then insert a fresh representative set in
-- the new shape — per-option tips (option_N_tip) instead of a single
-- explanation, spanning MCQ, MRQ, and short-answer so the tips feature is
-- testable end to end. Prod is NOT touched by this (it lives in the
-- migration, which is schema-only; prod keeps its real questions).
--
-- grade_level_id and subject_id are auto-populated by the
-- populate_question_hierarchy trigger from the sub-topic chain.
-- is_correct on the seeded practice answers below is recomputed by the
-- grade_practice_answer BEFORE trigger, so the values written here are
-- only illustrative.

-- Wipe order: children before parents. assessment_questions.question_id is
-- ON DELETE RESTRICT, so it MUST be cleared before questions (its own
-- children attempt_questions/attempt_answers cascade from it). The rest
-- (session_questions, student_question_progress, question_feedback) cascade
-- on question delete, and practice_answers.question_id is ON DELETE SET
-- NULL, but we clear the practice trio explicitly so no orphan rows remain
-- (acceptable on staging — this is test data).
DELETE FROM public.attempt_answers;
DELETE FROM public.attempt_questions;
DELETE FROM public.assessment_questions;
DELETE FROM public.practice_answers;
DELETE FROM public.session_questions;
DELETE FROM public.student_question_progress;
DELETE FROM public.questions;

INSERT INTO public.questions (
  id, type, question, sub_topic_id, answer,
  option_1_text, option_1_is_correct, option_1_tip,
  option_2_text, option_2_is_correct, option_2_tip,
  option_3_text, option_3_is_correct, option_3_tip,
  option_4_text, option_4_is_correct, option_4_tip
) VALUES

  -- ── Y1 Math > Chapter 1 > Basic Calculation (Chinese) — MCQ ──────────────
  -- The three below back the completed practice session in section 9.

  ('073d50c7-22e1-43c1-be30-ba53e7b04e66', 'mcq',
   '在 15, 20, 25, 30 中，下一个数是多少？',
   '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   NULL,
   '31', false, '这是五个五个地数，不是加 1。',
   '35', true,  NULL,
   '40', false, '你跳过了一个数，先数到 35。',
   '45', false, '太大了，30 的下一步是 35。'),

  ('0c97d45a-f8a1-4a3d-96d9-f7449ab81607', 'mcq',
   '在数字 7 中，个位数值是多少？',
   '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   NULL,
   '70', false, '70 是七十，那是十位，不是个位。',
   '7', true,  NULL,
   '0', false, '0 表示没有，再看看数字本身。',
   '1', false, '1 是位数的个数，不是数值。'),

  ('11e08503-3ca0-409a-a46d-5bc1f2f5f50f', 'mcq',
   '哪个数字最大？',
   '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   NULL,
   '19', false, '先比十位：1 比 9 小。',
   '91', true,  NULL,
   '49', false, '十位是 4，比 9 小。',
   '90', false, '十位相同，再比个位：0 比 1 小。'),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — MRQ (multiple correct) ──────

  ('a1000000-0000-4000-8000-000000000001', 'mrq',
   '以下哪些是双数（可选多个）？',
   '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   NULL,
   '2', true,  NULL,
   '3', false, '3 除以 2 有余数，是单数。',
   '4', true,  NULL,
   '5', false, '5 是单数，末位是 5。'),

  -- ── Y1 Math > Chapter 1 > Basic Calculation — short answer (no options) ───

  ('a1000000-0000-4000-8000-000000000002', 'short_answer',
   '10 + 10 = ？',
   '4e61c11b-d12e-449f-bdd6-44cf5639a692',
   '20',
   NULL, false, NULL,
   NULL, false, NULL,
   NULL, false, NULL,
   NULL, false, NULL),

  -- ── Y3 Math > Chapter 1 > Basic Calculation — MCQ ────────────────────────

  ('0183618e-b41f-42c4-b838-c7caa9647fa6', 'mcq',
   '3 个千、14 个十和 5 个一组成的数是？',
   '7c8010f8-7616-4ead-9431-1a9c2d6224d3',
   NULL,
   '3145', true, NULL,
   '3415', false, '14 个十是 140，要进位到百位。',
   '31405', false, '不要把 14 个十直接写进数字里。',
   '3195', false, '14 个十是 140，不是 190。'),

  -- ── Y3 Math > Chapter 1 > Basic Calculation — MRQ ────────────────────────

  ('a1000000-0000-4000-8000-000000000003', 'mrq',
   '以下哪些数大于 3000（可选多个）？',
   '7c8010f8-7616-4ead-9431-1a9c2d6224d3',
   NULL,
   '3145', true, NULL,
   '2999', false, '2999 比 3000 小 1。',
   '3001', true, NULL,
   '2130', false, '2130 的千位是 2，小于 3。'),

  -- ── Y2 English > Grammar > Verbs — MCQ ───────────────────────────────────

  ('49f16772-57a6-44a8-8d27-76d8f29eb8bc', 'mcq',
   'Choose the correct answer

I _______ my teeth.',
   '8e74125c-d629-4b0e-ab11-c5dfb57856aa',
   NULL,
   'comb', false, 'You comb your hair, not your teeth.',
   'brush', true, NULL,
   'ride', false, 'You ride a bike or a horse.',
   'read', false, 'You read books, not teeth.'),

  ('bd94736c-87a9-45fb-98b7-b5dbf1da58e3', 'mcq',
   'Choose the correct answer

I _______ books.',
   '8e74125c-d629-4b0e-ab11-c5dfb57856aa',
   NULL,
   'read', true, NULL,
   'watch', false, 'You watch movies or TV, not books.',
   'comb', false, 'You comb hair, not books.',
   'feed', false, 'You feed animals, not books.'),

  -- ── Y2 English > Comprehension > Unit 5 (days of the week) — MCQ ──────────

  ('05054756-a6c3-4074-80c4-a6dbb3f5ec00', 'mcq',
   'Which group of days is written in the correct order?',
   '3e7aa63a-900f-42f1-af4d-774b42e6020f',
   NULL,
   'Wednesday, Thursday, Tuesday', false, 'Tuesday comes before Wednesday, not after Thursday.',
   'Monday, Tuesday, Wednesday', true, NULL,
   'Saturday, Sunday, Friday', false, 'Friday comes before Saturday in the week.',
   'Tuesday, Thursday, Wednesday', false, 'Wednesday comes before Thursday.')

ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. PRACTICE SESSION (completed, for Alice)                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Session hierarchy trigger auto-populates grade_level_id and subject_id.

INSERT INTO public.practice_sessions (
  id, student_id, sub_topic_id, total_questions, current_question_index,
  completed_at, correct_count, total_time_seconds
) VALUES (
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '4e61c11b-d12e-449f-bdd6-44cf5639a692',  -- Y1 Math > Ch1 > Basic Calculation
  3, 3,
  now() - interval '1 day',
  2, 145   -- Q1 + Q3 correct, Q2 wrong (matches the answers seeded below)
)
ON CONFLICT (id) DO NOTHING;

-- Session questions
INSERT INTO public.session_questions (id, session_id, question_id, question_order)
VALUES
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '073d50c7-22e1-43c1-be30-ba53e7b04e66', 1),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '0c97d45a-f8a1-4a3d-96d9-f7449ab81607', 2),
  ('71000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '11e08503-3ca0-409a-a46d-5bc1f2f5f50f', 3)
ON CONFLICT (id) DO NOTHING;

-- Practice answers
INSERT INTO public.practice_answers (id, session_id, question_id, is_correct, time_spent_seconds, answered_at, selected_options, text_answer)
VALUES
  -- Q1: MCQ correct (option 2 = "35")
  ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '073d50c7-22e1-43c1-be30-ba53e7b04e66',
   true, 28, now() - interval '1 day', '{2}', NULL),
  -- Q2: MCQ wrong (picked option 1 instead of 2)
  ('72000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '0c97d45a-f8a1-4a3d-96d9-f7449ab81607',
   false, 52, now() - interval '1 day', '{1}', NULL),
  -- Q3: MCQ correct (option 2 = "91")
  ('72000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '11e08503-3ca0-409a-a46d-5bc1f2f5f50f',
   true, 65, now() - interval '1 day', '{2}', NULL)
ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 9b. CLASSROOMS + MEMBERSHIPS (Revamp 2.2 — many-to-many)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Two sections of the SAME grade+subject (decision 47 allows this), created
-- by Mr Wong (manager). Memberships demonstrate the many-to-many model:
--   * Ms Lee (teacher) teaches BOTH classrooms          -> teacher in 2 classrooms
--   * Classroom A holds Alice + Ben                      -> classroom with 2 students
--   * Alice is in BOTH classrooms                        -> student in 2 classrooms

INSERT INTO public.classrooms (id, organization_id, grade_level_id, subject_id, name, created_by)
SELECT v.id, o.id, v.grade_level_id, v.subject_id, v.name, '00000000-0000-0000-0000-000000000005'
FROM (VALUES
  ('c1000000-0000-4000-8000-000000000001'::uuid,
   '54081b95-ee5f-43d0-8f95-d640d48bb734'::uuid,  -- Year 1
   '9d077a3d-b673-4760-9c44-218f0f25b2b1'::uuid,  -- Year 1 Mathematics
   '一年级数学 A组 Year 1 Math (Group A)'),
  ('c1000000-0000-4000-8000-000000000002'::uuid,
   '54081b95-ee5f-43d0-8f95-d640d48bb734'::uuid,  -- Year 1
   '9d077a3d-b673-4760-9c44-218f0f25b2b1'::uuid,  -- Year 1 Mathematics
   '一年级数学 B组 Year 1 Math (Group B)')
) AS v(id, grade_level_id, subject_id, name)
CROSS JOIN (SELECT id FROM public.organizations WHERE name = 'Clavis Demo Center') o
ON CONFLICT (id) DO NOTHING;

-- Ms Lee (000006) teaches both classrooms.
INSERT INTO public.classroom_teachers (classroom_id, teacher_id)
VALUES
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- Classroom A: Alice + Ben.  Classroom B: Alice (so Alice is in both).
INSERT INTO public.classroom_students (classroom_id, student_id)
VALUES
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000003'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 9c. ASSESSMENT (published) assigned to a classroom                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Created by Ms Lee (teacher), two bank questions, assigned to Classroom A so
-- the many-to-many assignment flow is testable end to end.

INSERT INTO public.assessments (id, organization_id, created_by, title, description, status)
SELECT
  'a5000000-0000-4000-8000-000000000001', o.id,
  '00000000-0000-0000-0000-000000000006',
  'Year 1 Math — Quiz 1', '100 以内的整数 warm-up', 'published'
FROM (SELECT id FROM public.organizations WHERE name = 'Clavis Demo Center') o
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assessment_questions (id, assessment_id, question_id, position, points)
VALUES
  ('a9100000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
   '073d50c7-22e1-43c1-be30-ba53e7b04e66', 0, 1),
  ('a9100000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001',
   '0c97d45a-f8a1-4a3d-96d9-f7449ab81607', 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Assigned to Classroom A, due in 7 days, by Ms Lee.
INSERT INTO public.assessment_assignments (id, assessment_id, classroom_id, due_at, assigned_by)
VALUES
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', now() + interval '7 days',
   '00000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 10. ANNOUNCEMENT                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.announcements (id, title, content, target_audience, created_by, is_pinned)
VALUES (
  '80000000-0000-0000-0000-000000000001',
  'Welcome to Clavis!',
  'We are excited to have you here. Start practising to sharpen your skills!',
  'all',
  '00000000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;


COMMIT;
