# Clavis — Domain Rules

The one place that states how the product is modelled. Every rule is one sentence,
tagged **KEEP** (code does this, we want it), **CHANGE** (code does this, we do not
want it; the intended rule follows), or **OPEN** (undecided). Where the page and the
code disagree, the page wins and the code gets a ticket.

Drafted 2026-09-22 from the code on `staging`; revised 2026-10-07 for the SvelteKit
rewrite (`feat/svelte-rewrite`), when the assessment product was removed, and
2026-10-08 for practice bound to a classroom and the classroom archive, and
2026-10-09 for assignments (migrations through P32a), for organizations, managers and passwords (P32a) and for pictures in an import (P33a). Source pointers are migration prefixes (`P20b`) or PLAN.md decision
numbers (`d80`).

Rule numbers are stable and never reused. Sections 5 to 7 (papers, assessments,
attempts) and section 11 (propagation) went with the assessment product, as did the
rules missing from the sections that remain.

---

## 1. Glossary

Use these words. Avoid the ones in parentheses.

| Term | Meaning |
|---|---|
| **Platform** | Us. Owns the curriculum, the practice bank and every organization. Has no organization of its own. |
| **Organization** (not "center" in code, "tenant") | One tuition center. The tenant boundary and the unit of sale. |
| **Admin** | A platform account. `organization_id IS NULL`. |
| **Manager** | An organization's operating account. Manages people and classrooms, reads data. |
| **Teacher** | An organization's teaching account. Follows the practice of the students in the classrooms that list them. |
| **Student** | A learner. Logs in with a username. One seat. |
| **Seat** | One student profile in an organization. What the organization pays for. |
| **Classroom** (not "class", "section", "group") | grade level + subject + name inside one organization, with a set of teachers and a set of students. Two classrooms of the same grade and subject are two sections of one course. |
| **Curriculum** | The global tree: grade level → subject → topic → stage. |
| **Stage** | An ordered step on a topic's practice path. Holds passages and practice questions; a student practises it whole. |
| **Passage** | A text, a picture or both inside a stage, with questions beneath it. |
| **Learning point** (not "tag" in UI) | A global label on practice questions, scoped to topics. |
| **Practice question** | A question in the practice bank, filed under a stage. |
| **Item payload** | The content of a practice question: its type, wording, pictures and answer key. |
| **Practice session** | One finished practice run on one stage, done in one classroom: every question of the stage, with the marks earned. |
| **Progress** | What a student has done in one classroom: the practice sessions on record there. It belongs to the classroom: a student in two classrooms has two. |
| **Archived classroom** | A classroom a manager has put away: only the managers of its organization see it, until it is restored. A classroom that is not archived is **live**. |
| **Assignment** (not "homework", "task") | A stage a teacher has given to named students of one classroom, with or without a due date. It is **done** by a student when they first finish its stage there after it was assigned. |
| **Notification** | Word to a teacher that a student has done an assignment the teacher made. Shown in the app only. |

---

## 2. Tenancy and people

- **R2.1 KEEP** Every row an organization owns carries `organization_id` or hangs from a row that does; policies resolve through `app.current_org_id()`. Nothing crosses organizations except platform content: the curriculum and the practice bank. *(P1a d4)*
- **R2.2 KEEP** An account has exactly one role: admin, manager, teacher or student. Admins have no organization; everyone else has exactly one. *(P1a d2, d4)*
- **R2.3 KEEP** Nobody self-registers. Admin creates organizations (a name, unique on the platform) and the managers of each; a manager creates teachers and students of their own organization. Enforced in `create-user` from the caller's JWT, never from the request body. *(d6, d46)*
- **R2.4 KEEP** Students authenticate by username (synthetic email `<username>@student.clavis.app`); staff by real email. The sign-in form takes either in one field and tells them apart by the `@`. *(d6)*
- **R2.5 KEEP** A seat is a student profile. *(d34)*
  **CHANGE →** A seat is an **active** student profile. See R10.2.
- **R2.6 KEEP** A classroom's teachers are teacher accounts of its organization on its teacher list; a teacher reaches only the classrooms that list them. *(P6a)*
- **R2.7 KEEP** A manager creates, edits, archives and deletes the classrooms of their organization and is the only one who changes a roster; a teacher reads their classrooms and changes nothing in them. *(P6a, P26a)*
- **R2.9 KEEP** Everyone who reaches a classroom can read the names of its teachers, and a student reads nothing else about them: no email, and no other person's profile. *(P29a)*
- **R2.8 CHANGE** Code: admin reads every row in every organization. Intended: admin sees aggregates and manages organizations, the curriculum and the practice bank; row-level access to an organization's students only through an explicit, logged support path. *(later; write into the security posture now)*

## 3. Curriculum

- **R3.1 KEEP** The curriculum (grade → subject → topic → stage) is global and admin-owned; every organization runs on the same tree. *(P19a)*
- **R3.2 KEEP** A topic holds stages and nothing else; the stage is where practice questions are filed and what a student practises. *(P19a, P24a)*
- **R3.3 KEEP** Order at every level is `display_order`, set by admin drag-reorder through positional RPCs. The stage order is the learning map. *(d17, d72)*
- **R3.4 KEEP** Learning points are a global vocabulary, admin-managed, each scoped to one or more topics; a learning point with no topic is never offered. *(d57, P19a)*

## 4. Practice questions

- **R4.1 KEEP** There is one bank: practice questions, filed under stages, owned by the platform and written only by admin. *(P16a, P24a)*
- **R4.2 KEEP** One item schema: the JSONB payload, one validator, one grader, one sanitizer. *(P21a; rationale: KSSR formats; one editor, one grader)*
- **R4.5 KEEP** A practice question carries a difficulty (low / medium / high = Aras Kesukaran R/S/T), learning points and optional pictures, on the question and on its options or items. *(P13a, P23a)*
- **R4.7 KEEP** Answer keys, tips and correctness are never column-readable by students; student-facing content comes only from sanitizing RPCs. *(P3a d32–33, P5a d41, P11a d76)*
- **R4.10 KEEP** A question sits either directly in its stage or under one passage of that stage; a stage's top level is one sequence of passages and loose questions, and a passage's questions are a second sequence inside it. *(P23a)*
- **R4.11 KEEP** A stage has a question order, fixed (the builder's order) or random. *(P23a)*
- **R4.12 KEEP** An admin imports questions into a stage from an Excel workbook: one sheet a question type (Label a Picture has none) and one of passages. The file is reviewed before anything is written, a row that needs fixing is left out, and what is ready is added in one transaction. A question the stage already has, or that the file asks twice, is left out, so a file can be fixed and imported again. *(P25b)*
- **R4.13 KEEP** A workbook carries pictures: a question's and a passage's in the Picture cell of its row, an option's or an item's in its own cell. A picture belongs to the cell it is in, whether Excel placed it in the cell or it floats with its top left corner there; one in a cell that takes none makes its row a row to fix. Pictures are stored before the rows that name them are added, and a row never names a picture that is not stored. Two questions that read the same but show different pictures are different questions, and a stored picture is known again by its fingerprint. *(P33a)*

## 8. Practice

- **R8.1 KEEP** Practice is bound to a classroom. A session records the classroom it was done in, and the server refuses a session unless the student is enrolled in that classroom, the classroom is live, and the stage is of the classroom's subject. *(P26a; replaces d79, d83 and the old R8.10)*
- **R8.2 KEEP** Every stage is always open. The map recommends; it never locks. *(d4, d20)*
- **R8.4 KEEP** Progress belongs to the classroom: it is the sessions a student has on record there, and nothing is stored beside them. There is no mastery. A session earns none to three stars by the share of the stage's marks it scored: one for half, two for four fifths, three for all of them, each target rounded up to a whole mark and kept a mark below the next, so that on a short stage three stars still take every mark. Stars are worked out from a session's score wherever they are shown and are never stored. A stage's stars are those of the student's best session on it in that classroom. A student in two classrooms of the same grade and subject has two separate progresses, and what is done in one does not show in the other. The practice page shows each stage's stars; pressing a stage opens a dialog with the best result, what each star takes, and every past session of it there, and the practice starts from that dialog. Try Again on a result starts a new practice without it. *(P26a; stars 2026-10-08; replaces P2a d18, d19–20)*
- **R8.5 KEEP** The server serves a stage whole, every question, in the stage's order (R4.11); a passage moves as one block with its questions in the order they were written. Each time a stage is opened it is dealt afresh. A stage with no question is not offered. *(P23a, P23c, P26a)*
- **R8.6 KEEP** Nothing is written until submit; one RPC writes session, questions, answers and completion. Leaving discards. *(P15c d85)*
- **R8.7 KEEP** No correctness is shown during a session. A student may finish with questions unanswered, after a warning that says how many; every question of the stage counts, and an unanswered one earns nothing. A session records one answer for each question of the stage, the unanswered ones with nothing in them. *(P23c, P26a; replaces d40's "every question answered")*
- **R8.8 KEEP** Results show the score, the student's own answers, how each was marked, and a tip only where they fell short. The correct answer is never revealed to the student in practice; the staff who read a session are shown it (R8.11). *(d39–41)*
- **R8.9 KEEP** Practice accepts fourteen types (mcq, mrq, true/false, tick table, pick words, cloze, short answer, word completion, numeric, matching, ordering, rearrange, classify, label picture). One mark a question, shared among its parts, and a session's score is the marks earned (`practice_sessions.marks`). A question that needs a human marker does not exist. A finished practice tells the pupil which parts of their own answer were right and which wrong, with the tips; the right answer to a part got wrong is never shown. *(P23a, P23b, P26a, P28a)*
- **R8.11 KEEP** Whoever reads a session (R8.12) can read it back as the page its student was shown on finishing: the answers given, how each was marked, and the tips (`review_practice_session`). A teacher reaches it from a student's attempts and from an assignment. Staff are shown the right answer too, under each answer that fell short of the whole mark; where a question accepts several answers, the first of them. The student reading their own session is never handed one (R8.8). The score is the one on record; the questions are read as they stand now, so one changed since is marked by what it now says and one deleted since is left out. *(was R7.8; P31a, 2026-10-09: replaces "staff never see a student's individual practice answers"; right answers for staff the same day)*
- **R8.12 KEEP** A practice session is read by its student, by the teachers on its classroom's list while that classroom is live, by the managers of that classroom's organization, and by admin (R2.8). No other staff of the organization read it. *(P26a)*

## 9. Insights

- **R9.1 CHANGE** Code: a teacher follows a classroom's practice in three places. Its Practice tab lists the stages its students are offered, each with how many of the class have practised it and how their best results spread across the stars; a stage opens to show the same student by student. Its Students tab says of each student how many stages they have practised, the stars they hold and when they last practised. A student's page shows every stage with their best, how many attempts and when last, and a practised stage opens to each attempt, which leads to that practice as the student was shown it marked (R8.11). The classroom's first page is what has been assigned there (section 13). All of it is worked out from the sessions the teacher may read (R8.12), on the server, by the read policy and not by an RPC, and nothing of it is stored. A manager and an admin have no such screen. Intended: dashboards are read-only aggregation RPCs that enforce tenancy in their bodies, with no client-side joins across students; they list live classrooms only, and a teacher's students are those of the live classrooms that list the teacher. *(d35, d37, P26a; teacher's view 2026-10-08, P31a)*
- **R9.4 KEEP** Nulls render as "—", never as 0 %. *(P4b)*

## 10. Lifecycle — mostly not built

- **R10.1 KEEP** A manager archives a classroom and can restore it (`archived_at`, empty while the classroom is live). An archived classroom is seen only by the managers of its organization, who can read its details and can do nothing to it but restore or delete it: its name, cover and rosters stand as they were. It is hidden from its teachers and students, from every picker and from the dashboards, and nobody practises in it. *(P26a)*
- **R10.2 CHANGE** People gain `is_active`. Inactive: cannot sign in, hidden from pickers and rosters, every row kept. Manager flips students and teachers; admin flips managers; an organization keeps at least one active manager. Seat = active student (R2.5).
- **R10.3 KEEP** A teacher and a student cannot change or recover their own password: only a manager of their organization sets a new one, typed by the manager and passed on by hand. Enforced in `set-password` from the caller's JWT. There is no email flow. A manager's and an admin's own password has no screen yet. *(2026-10-09)*
- **R10.5 OPEN** `academic_year` on classrooms, set at creation, to group the archive and label cards.
- **R10.7 KEEP** A manager may delete an archived classroom of their organization, after one confirmation; a live classroom is archived first and cannot be deleted as it stands. Everything in it goes with it: its rosters, its cover, and every practice session recorded in it with its answers, and so the progress made in it (R8.4). *(P6a, P26a, P29a)*
- **R10.8 KEEP** An admin renames an organization, and may delete one, which destroys everything the tuition center has in Clavis: every classroom, live or archived, with its rosters, assignments and practice; then the accounts of its managers, teachers and students, who can no longer sign in; then the organization. It is hedged three ways: the page counts what will go, the delete stays off until the organization's name has been typed, and the database deletes nothing unless handed that name as it stands. It is all or nothing, in one transaction. *(P32a)*

## 13. Assignments

- **R13.1 KEEP** A teacher of a live classroom assigns one stage of its subject, one that has a question, to students of that classroom: the whole class or the ones chosen. The students are those named at that moment. Someone who joins the classroom later is not given what was assigned before; someone who leaves it is no longer counted among those who have yet to do it. *(P31a)*
- **R13.2 KEEP** An assignment is done by finishing its stage once in its classroom after it was assigned, whatever the score. Practice from before it was assigned does not count. The session that did it is recorded when it is handed in (`assignment_students.session_id`), and one session does every assignment of that stage the student has open there. *(P31a)*
- **R13.3 KEEP** A due date is optional and closes nothing. It is the end of the chosen day where the teacher was. An assignment not done by then is overdue and can still be done; done after it, it is late. *(P31a)*
- **R13.4 KEEP** The score shown for an assignment is the best the student has scored on its stage since it was assigned, so practising again can raise it. Like the stars (R8.4) it is worked out from the sessions and not stored. *(P31a)*
- **R13.5 KEEP** A classroom's assignments are read by every teacher on its list while it is live and by the managers of its organization; a student reads the ones given to them. Any teacher of the classroom may delete one. Deleting removes who it was given to and what was told of it, and leaves the students' practice as it is. A manager and an admin have no screen for assignments. *(P31a)*
- **R13.6 KEEP** The teacher who made an assignment is notified of each student who does it: who, which stage, the score of the session that did it, the classroom and when. Notifications are in the app only, behind a bell on every teacher page, and are read when a page loads. All that is stored of one is whether the teacher has seen it. Opening one opens its assignment and marks that assignment's notifications as seen. *(P31a)*
- **R13.7 KEEP** A classroom opens on its Overview for a teacher and for a student: what has been assigned there. A teacher sees each assignment with how many have done it, in progress until everyone has. A student sees what they have to do, the soonest due first, and what they have done; in the sidebar a classroom with work to do carries its count. The practice path marks nothing as assigned (R8.2). *(P31a)*

## 12. Open decisions

1. R10.5 — `academic_year` column.
2. R2.8 — when to restrict admin row access.
