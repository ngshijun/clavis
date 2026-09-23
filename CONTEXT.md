# Clavis — Domain Rules

The one place that states how the product is modelled. Every rule is one sentence,
tagged **KEEP** (code does this, we want it), **CHANGE** (code does this, we do not
want it; the intended rule follows), or **OPEN** (undecided). Where the page and the
code disagree, the page wins and the code gets a ticket.

Drafted 2026-09-22 from the code on `staging` (migrations P1a–P20d, decisions 1–91).
Source pointers are migration prefixes (`P20b`) or PLAN.md decision numbers (`d80`).

---

## 1. Glossary

Use these words. Avoid the ones in parentheses.

| Term | Meaning |
|---|---|
| **Platform** | Us. Owns the curriculum, the platform banks, platform papers, and every organization. Has no organization of its own. |
| **Organization** (not "center" in code, "tenant") | One tuition center. The tenant boundary and the unit of sale. |
| **Admin** | A platform account. `organization_id IS NULL`. |
| **Manager** | An organization's operating account. Manages people and classrooms, reads data. |
| **Teacher** | An organization's teaching account. Authors items and papers, delivers and runs assessments. |
| **Student** | A learner. Logs in with a username. One seat. |
| **Seat** | One student profile in an organization. What the organization pays for. |
| **Classroom** (not "class", "section", "group") | grade level + subject + name inside one organization, with a set of teachers and a set of students. Two classrooms of the same grade and subject are two sections of one course. |
| **Curriculum** | The global tree: grade level → subject → topic. Branches at the topic into **stages** (practice) and **sub-topics** (assessment). |
| **Stage** | An ordered step on a topic's practice path. Holds practice questions and per-student mastery. |
| **Sub-topic** | A filing drawer under a topic for assessment items. |
| **Learning point** (not "tag" in UI) | A global label on items, scoped to topics. |
| **Practice question** | An item in the practice bank, filed under a stage. |
| **Item** (not "question" when ambiguous) | An assessment bank question, filed under a sub-topic. Owned by the platform or by one organization. |
| **Paper** (not "template") | An ordered list of references to items, plus delivery defaults. Owned by the platform or by one organization. Never attempted. |
| **Assessment** | One delivery of one paper into one classroom. What students attempt. |
| **Snapshot** | The copy of a paper's items frozen into an assessment at publish. |
| **Assignment** | An assessment targeted at its classroom or at one student in it, with an optional due date. |
| **Attempt** | One student's sitting of one assessment. |
| **Practice session** | One completed practice run on one stage. |
| **Mastery** | A student's best score on a stage, shown as 0–3 stars. |

---

## 2. Tenancy and people

- **R2.1 KEEP** Every row that matters carries `organization_id`; policies resolve through `app.current_org_id()`. Nothing crosses organizations except platform content. *(P1a d4)*
- **R2.2 KEEP** An account has exactly one role: admin, manager, teacher or student. Admins have no organization; everyone else has exactly one. *(P1a d2, d4)*
- **R2.3 KEEP** Nobody self-registers. Admin creates managers; a manager creates teachers and students of their own organization. Enforced in `create-user` from the caller's JWT, never from the request body. *(d6, d46)*
- **R2.4 KEEP** Students authenticate by username (synthetic email `<username>@student.clavis.app`); staff by real email. *(d6)*
- **R2.5 KEEP** A seat is a student profile. *(d34)*
  **CHANGE →** A seat is an **active** student profile. See R10.2.
- **R2.6 CHANGE** Code: teaching rights derive from `user_type = 'teacher'`. Intended: teaching rights inside a classroom derive from being on its teacher list, whatever the org role. A manager on a classroom's teacher list is a teacher there. *(replaces the `is_teacher()` checks in `can_write_paper`, `deliver_paper`, `generate_paper`, `can_write_assessment`)*
- **R2.7 KEEP** A manager who is not a teacher of a classroom reads everything in it and writes nothing, with one exception: marking and releasing answers. *(P12a d80, P9b)*
- **R2.8 CHANGE** Code: admin reads every row in every organization. Intended: admin sees aggregates and manages organizations, curriculum and platform content; row-level access to an organization's students only through an explicit, logged support path. *(later; write into the security posture now)*

## 3. Curriculum

- **R3.1 KEEP** The curriculum trunk (grade → subject → topic) is global and admin-owned; every organization runs on the same tree. *(P19a)*
- **R3.2 KEEP** The trunk branches at the topic: stages for practice, sub-topics for assessment. The two products share nothing below the topic. *(P19a)*
- **R3.3 KEEP** Order at every level is `display_order`, set by admin drag-reorder through positional RPCs. The stage order is the learning map. *(d17, d72)*
- **R3.4 KEEP** Learning points are a global vocabulary, admin-managed, each scoped to one or more topics; a learning point with no topic is never offered. *(d57, P19a)*

## 4. Items — two banks

- **R4.1 KEEP** There are two banks and they never share rows: practice questions (under stages) and assessment items (under sub-topics). A practice question cannot be picked into a paper; an item cannot appear in practice. *(d88, P16a)*
- **R4.2 CHANGE** Code: the two banks have different schemas (four fixed option columns with tips vs a JSONB payload with nine types). Intended: one item schema (the JSONB payload, validator and grader) for both banks; the banks differ only in where they are filed and which types the runner accepts. *(rationale: KSSR formats; one editor, one grader, one importer)*
- **R4.3 KEEP** An item belongs to the platform (`organization_id IS NULL`) or to exactly one organization. Platform items are offered to every organization; an organization's items are visible only to it. *(P20a)*
- **R4.4 KEEP** Only the owner writes an item: admin for platform items, teachers for their organization's. *(P20a, P20b)*
- **R4.5 KEEP** An item carries difficulty (low / medium / high = Aras Kesukaran R/S/T), points, learning points, an optional image, and per-option images for mcq/mrq. *(P13a, P10a)*
- **R4.6 OPEN** Add a construct tag (Bloom level) so a paper can be checked for 50% KBAT. Not built.
- **R4.7 KEEP** Answer keys, tips, correctness and awarded points are never column-readable by students; student-facing content comes only from sanitizing RPCs. *(P3a d32–33, P5a d41, P11a d76)*
- **R4.8 CHANGE** Code: deleting an item cascades out of every paper that references it (`paper_items.item_id ON DELETE CASCADE`). Intended: an item used by any paper cannot be deleted; it is **retired** (`retired_at`), which removes it from the generation pool and the picker but leaves every paper intact. Delete only when used by zero papers.
- **R4.9 CHANGE** Code: an admin edit to a platform item silently changes every paper in every organization that references it. Intended: admin edits are corrections; a different question is a new item plus a retirement of the old. The UI warns "used in N papers across M organizations" before save.

## 5. Papers

- **R5.1 KEEP** A paper is an ordered list of references to items plus title, description, time limit and shuffle. It holds no content and is never attempted. *(P20b d91)*
- **R5.2 KEEP** A paper belongs to the platform or to one organization, never to a classroom or a teacher. An organization's papers are edited by any of its teachers and outlive their author. *(P20b, P20d)*
- **R5.3 KEEP** A paper has no grade or subject of its own; the pairings it covers are derived from its items. A paper with no items covers nothing and is still visible. *(P20d)*
- **R5.4 KEEP** Inside a classroom, the library shows only papers covering that classroom's grade and subject; delivery refuses any other. *(P20d)*
- **R5.5 KEEP** A platform paper becomes visible to an organization only when published and only if the organization teaches a matching grade and subject. Publishing never locks content; an organization paper's status means nothing. *(P20b)*
- **R5.6 KEEP** Adopting a platform paper creates an organization paper referencing the same items. Nothing is copied. *(P20b `adopt_paper`)*
- **R5.7 KEEP** A paper may reference platform items and its own organization's items, never another organization's. *(`enforce_paper_item_owner`)*
- **R5.8 CHANGE** Code: inside an organization paper, a platform item opens in the editor and the save fails at RLS. Intended: platform items render read-only with a "Platform" badge, and a teacher may **detach** one, which clones it into the organization bank and swaps the reference.
- **R5.9 KEEP** Writing a new question inside a paper creates a bank item filed beside the previous one; editing a question in a paper edits the bank item and therefore every paper holding it. *(P20b)*
- **R5.10 KEEP** Removing a question from a paper asks "keep in bank" or "delete from bank"; delete is offered only when the caller owns the item and no other paper uses it. *(d07c0d4)*
- **R5.11 KEEP** Generation: a spec of lines; each line = one or more sub-topics (one mixed pool), optional learning points, a difficulty mix in whole percents summing to 100 (default 50/30/20), and a count 1–50; pool = platform items + the caller's organization's; shortfalls are reported; any generated item can be re-rolled from its line. *(P18a–c d90)*
- **R5.12 KEEP** A paper that has ever been delivered cannot be deleted (`assessments.paper_id ON DELETE RESTRICT`). *(P20b)*

## 6. Assessments — delivery

- **R6.1 KEEP** An assessment is one paper delivered into one classroom; `classroom_id` is set on insert and never changes. Two classrooms sharing a grade and subject never see each other's assessments. *(P12b d81, P20b)*
- **R6.2 KEEP** A draft assessment holds no content; it shows the paper's live items. Publishing copies the paper's items into the snapshot, refuses an empty paper, and can never be undone. Nothing writes the snapshot afterwards. *(P20b `publish_assessment`)*
- **R6.3 KEEP** After publish, title, description, time limit and shuffle are locked; "show auto-score while pending" and "release answers" stay editable. *(P9b d70–71)*
- **R6.4 CHANGE** Code: only the creating teacher (or admin) may edit, publish, assign or delete an assessment. Intended: any teacher of the classroom may (co-teacher parity); `created_by` is audit only. *(replaces P12a "creating teacher" policies)*
- **R6.5 KEEP** An assignment targets the assessment's own classroom or one student enrolled in it, with an optional due date. A student's assigned set is the union. A trigger rejects any other target. *(P3a d25, P6a d50, P12b)*
- **R6.6 KEEP** Deliver, publish and assign require being a teacher of that classroom. *(P20d)* — with R2.6, "teacher of" means "on the teacher list".

## 7. Attempts, grading, results

- **R7.1 KEEP** One attempt per student per assessment; starting is idempotent and resumes. Retakes are not a feature. *(d26)*
- **R7.2 KEEP** Question order is frozen per attempt; matching and ordering items are scrambled server-side per attempt; mcq/mrq options shuffle client-side. *(d31, P9)*
- **R7.3 KEEP** Due date is enforced at start only; an in-flight attempt may finish. Time limit is enforced server-side on writes past `started_at + limit + 30 s`; completion is always allowed. *(d27)*
- **R7.4 KEEP** Grading is a server trigger over the snapshot: binary for mcq, mrq, true/false, short answer, numeric; partial for cloze, matching, ordering; `long_answer` is pending until a staff member awards points. A malformed answer scores 0 and never errors. *(d28, d68–69)*
- **R7.5 KEEP** Unanswered questions do not block submission and count as wrong. *(P9e)*
- **R7.6 KEEP** Marking and releasing answers: admin, any manager of the organization, or a teacher of a classroom or student the assessment is assigned to. Re-marking overwrites. *(P9b `can_mark_assessment`)*
- **R7.7 KEEP** A student sees, after completion: correct / partial / incorrect / pending per question and their own answer. Score is shown while marking is pending only if the assessment says so. Answer keys appear only after the teacher releases them. Staff always see everything. *(d30, d70–71)*
- **R7.8 KEEP** Staff never see a student's individual practice answers; they see session shape (score, time, stage). *(`get_session_result` is owner-only)*

## 8. Practice

- **R8.1 KEEP** A student practises inside one classroom at a time; grade and subject come from it. The classroom is in the URL and is never persisted. *(d79, d83)*
- **R8.2 KEEP** Every stage is always open. The map recommends; it never locks. *(d4, d20)*
- **R8.3 KEEP** Stars are derived, never stored: best score ≥ 60 → 1, ≥ 80 → 2, ≥ 95 → 3. No row = not started, 0 stars = in progress, ≥ 1 star = completed. *(d19–20)*
- **R8.4 KEEP** Mastery belongs to the student and the stage, not the classroom; it follows the student across classrooms and years. *(P2a d18, P19a)*
- **R8.5 OPEN** Code: a session takes up to 10 questions unseen in the current cycle, opening a new cycle when fewer remain (`student_question_progress`). Options: keep (guarantees coverage before repeats) or plain shuffle. Either way, move selection into an RPC so the client stops reading the progress table.
- **R8.6 KEEP** Nothing is written until submit; one RPC writes session, questions, answers and completion. Leaving discards. *(P15c d85)*
- **R8.7 KEEP** No correctness is shown during a session; submit requires every question answered. *(d40)*
- **R8.8 KEEP** Results show score and stars, the student's own choices, and a tip only on wrong options they chose. The correct answer is never revealed in practice. *(d39–41)*
- **R8.9 CHANGE** Code: practice types are mcq, mrq, short answer with four fixed options. Intended: add numeric, true/false, cloze with word bank, matching, and mcq with any option count; question-level tips for non-option types; difficulty on practice questions; `long_answer` never. *(KSSR/UASA formats; see R4.2)*
- **R8.10 CHANGE** Code: a session records grade and subject. Intended: it also records the classroom it was framed by, so sections can be told apart in reporting.

## 9. Insights

- **R9.1 KEEP** Dashboards are read-only aggregation RPCs that enforce tenancy in their bodies; no client-side joins across students. *(d35, d37)*
- **R9.2 KEEP** Mastery % = average best score over attempted stages; stages completed = stages with ≥ 1 star; assessment completion = completed / assigned. *(d36)*
- **R9.3 KEEP** At-risk is one rule in one place: an overdue uncompleted assignment, or low mastery, or no recent practice. It is a label, not a model. *(d36)*
- **R9.4 KEEP** Nulls render as "—", never as 0 %. *(P4b)*

## 10. Lifecycle — mostly not built

- **R10.1 CHANGE** Classrooms gain `status` active | archived and `archived_at`. Archived: hidden from every picker, read-only for everyone, results and records reachable, restorable. Delete: manager only, only from archived, typed confirmation, cascades assessments and attempts. Drafts in an archived classroom are discarded at archive time.
- **R10.2 CHANGE** People gain `is_active`. Inactive: cannot sign in, hidden from pickers and rosters, every row kept. Manager flips students and teachers; admin flips managers; an organization keeps at least one active manager. Seat = active student (R2.5).
- **R10.3 CHANGE** Password reset for students is a manager action through the provisioning edge function; teachers use the email flow.
- **R10.4 KEEP** Papers carry forward across years untouched; a new classroom sees every organization paper covering its pairing. *(follows from R5.2–R5.4)*
- **R10.5 OPEN** `academic_year` on classrooms, set at creation, to group the archive and label cards.
- **R10.6 KEEP** Platform papers and platform items are never deleted while referenced (R4.8, R5.12).

## 11. Propagation — what an edit or delete reaches

| Action | Draft assessments | Published assessments & attempts | Other papers holding the item | Other organizations |
|---|---|---|---|---|
| Edit an organization item | changes | untouched | changes (same org) | never |
| Edit a platform item | changes | untouched | changes | **changes** (R4.9: corrections only) |
| Delete an item used by a paper | today: vanishes · intended: refused, retire instead (R4.8) | untouched | today: vanishes | today: vanishes |
| Edit a paper (order, points, settings) | changes | untouched | — | never |
| Delete a paper | refused if ever delivered (R5.12) | — | — | — |
| Adopt a platform paper | — | — | new org paper, same item refs (R5.6) | — |
| Publish an assessment | becomes the snapshot | — | — | — |
| Archive a classroom | discarded (R10.1) | frozen, readable | — | — |
| Deactivate a student | — | kept, hidden from rosters | — | — |

## 12. Open decisions

1. R8.5 — cycle or shuffle.
2. R10.5 — `academic_year` column.
3. R4.6 — construct (KBAT) tag.
4. R2.8 — when to restrict admin row access.
5. Practice bound to the classroom's subject (current) or to the student's whole grade. Recommendation: classroom-bound.
