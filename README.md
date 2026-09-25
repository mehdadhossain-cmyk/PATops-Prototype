# PATops: UKMC PAT team prototype

A clickable prototype of an all-in-one workspace for the UKMC Personal Academic Tutor (PAT) team.
It is built to test each feature idea with real users before committing to a full SaaS build.

> **Prototype only.** All data is fake and is stored in your browser's `localStorage`. No MS365 dependency.
> Use **Reset demo data** on the sign-in screen or in Settings to start again.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # unit tests (importer)
```

## Roles

`PAT Manager → PAT Admin (all campuses) → PAT Lead (one per campus) → PAT`

The sign-in screen lets you pick any seeded user to see the app from their point of view.

## Build plan (step by step)

PAT allocation is intentionally out of scope for this prototype.

| Step | Feature | Status |
|---|---|---|
| 1 | Foundation: roles, campuses, staff accounts, profiles, activity log | ✅ Done |
| 1 | **Onboarding & training tracking** (user story 1) | ✅ Done |
| 2 | **Intakes, partner universities, groups & student records** (admin import) | ✅ Done |
| 3 | **Call / communication log** (replaces the call-log Excel) | ✅ Done |
| 4 | **Wellbeing plans**: bi-weekly meeting & "logged in wellbeing app" tracking | ✅ Done |
| 5 | **Weekly attendance import & at-risk students** (<65%) with PAT + admin comment history | ✅ Done |
| 6 | **Non-submission tracking** per submission period | ✅ Done |
| 7 | **LSA tracking** (matches the PAT LSA records sheet) | ✅ Done |
| 8 | **Leave requests**: dates → cover PATs accept → Lead → Manager | ✅ Done |
| 9 | **Unified task list** with due dates, plus assigned tasks | ✅ Done |
| 10 | **One-click audit export** of a PAT's full history (report + spreadsheet) | ✅ Done |

## Step 1: what you can test

**New joiner (PAT)**
1. Sign in as **Connor Doyle** (invited). You land on profile setup, and training stays locked until the profile is complete.
2. Complete the profile (phone, shift, work days, emergency contact). The status moves from *Invited* to *Onboarding*.
3. Work through the training package. Each module has three parts:
   - read the material,
   - confirm "I have read and understood",
   - pass a short knowledge check (pass mark per module; every attempt is recorded).
4. The dashboard shows the onboarding journey and the tasks due.

**PAT Admin / Manager**
- **Staff**: search and filter everyone, and create new staff accounts. A new account starts as *Invited*, and the training due dates count from its start date.
- **Staff detail**: see the profile, the per-module training record (read date, quiz scores, overdue) and the activity history. Once training is complete, mark the person *active*.
- **Training tracker**: a staff × module matrix covering overdue items, failed attempts and CSV export.
- **Training content**: create and edit modules, quizzes, pass marks, due days and order, and archive modules.
- **Settings**: add campuses and reset the demo data.

**PAT Lead**: the same views, but scoped to their own campus only.

## Step 2: what you can test

**PAT Admin / Manager**
- **Intakes**: every partner university's intakes (including the planned **January 2027** intake), with group, student and "groups without a PAT" counts. You can create and edit intakes.
- **Groups**: filter by intake, campus, course, or "without a PAT". Each group page shows the timetable, the PAT and the full student contact list. From there you can:
  - copy every student email in one click (for announcements);
  - export the list as CSV;
  - assign or change the PAT by hand. The allocation rules (shift, work days, max 2 groups a day, 200-student limit) show as warnings only, because automated allocation is out of scope.
- **Import data**: upload a CSV, or paste cells straight from Excel, for either:
  - **students**, matched on EBS person code, so you can add new students and move existing ones between groups; or
  - **groups**, the academic team's group list for a new intake.

  Every row is checked before anything is saved. It flags bad emails, unknown group codes, duplicate IDs, unknown campuses or courses, and bad times. **Load example data** gives you a sample to try.
- **Students**: search everyone by name, EBS code, uni ID, email or phone, and edit a student's record.
- **Settings**: rename the placeholder partner universities and add courses.
- **Dashboard**: shows the groups still needing a PAT for each intake, and PAT workload against the 200-student limit.

**PAT**: **My groups** (timetable, student count against the 200 limit), each group's contact list with copy buttons, **My students** search, and a dashboard card showing today's classes.

**PAT Lead**: the groups and students at their own campus.

## Step 3: what you can test

**PAT** (e.g. Sofia Rahman)
- **Log contact** from the dashboard, the Call log, a student's page, or a group page. On a group page you can tick several students to log one contact for each of them.
- Each entry records:
  - channel (phone, WhatsApp, email, text, in person, Teams);
  - who started it, and the outcome (reached, no answer, left message);
  - reason, summary and time;
  - an optional **follow-up date**.
- **Group announcements** go to one or more groups by email or WhatsApp, and appear in every student's history in that group.
- **Call log** has three tabs:
  - **Log**: filters and CSV export;
  - **Follow-ups**: open follow-ups, with overdue ones highlighted and a "Mark done" button;
  - **Not contacted**: students not reached in the last 30 days, oldest first, each with a "Log contact" button.
- Entries are never deleted. A mistake is marked **Entered in error** with a reason, which keeps the audit trail intact.
- The student page shows the full **contact history** and when the student was last reached.

**Lead / Admin / Manager**
- **Call logs** shows, for every PAT, the share of their students reached in the last 30 days, contacts in the last 7 and 30 days, announcements, overdue follow-ups, and when they last logged. The list is sorted with the lowest reach first. Open any PAT to see their full log, and export everything to CSV.
- The dashboard shows the PATs with the lowest reach, and each PAT's staff page shows their call-log stats.
- Admins can log their own contacts too, for example retention calls. These appear on the student's history.

Data is now saved in the browser's IndexedDB, which has more room than local storage. Data from earlier versions is upgraded automatically.

## Step 4: what you can test

The wellbeing process: **form sent → form returned → wellbeing team decision → a recorded Teams meeting every two weeks → support logged in the wellbeing team's system.** PATops tracks that each step happened. It stores only a broad category, and all details stay in the wellbeing system.

**PAT**
- Mark **Wellbeing form sent** from the Wellbeing page or a student's page. If the form isn't returned within 7 days, PATops asks you to chase it.
- Record that the form was returned, then record the **wellbeing team's decision**. Approval starts the fortnightly schedule.
- **Record meeting**: held or student didn't attend, and a confirmation that the meeting was recorded on Teams (required).
  - Tick "logged in the wellbeing system" now, or use **Mark fortnight N logged** later.
  - The meeting can also be added to your call log automatically.
- Each plan shows one coloured chip per fortnight: held and logged, log pending, log overdue (more than 2 days), not held (more than 3 days past due), due now, or upcoming.
- **Action needed** lists everything due or overdue, urgent items first. The dashboard shows the top items.
- Students on a plan have a **♥ Wellbeing plan** badge on group lists, the student directory and their student page.

**Lead / Admin / Manager**
- The share of fortnightly meetings **held and logged**, meetings not held, and logs outstanding.
- A **By PAT** table, sorted with the lowest compliance first. The dashboard shows the PATs with the most urgent wellbeing actions.
- Every wellbeing step goes into the PAT's activity history (for the audit export).

## Step 5: what you can test

**PAT Admin / Manager: Attendance upload**
- Choose the week ending date, then upload the weekly report as a CSV or paste it from Excel. Only an identifier (EBS person code or uni student ID) and the overall attendance % are needed; other columns are ignored. 72, 72% and 0.72 all work.
- The preview flags:
  - students who **fall below 65%** or come **back above 65%** compared with the previous week;
  - large changes, and first reports that start below 65%;
  - unknown students and duplicate rows;
  - how many active students are missing from the file.
- Re-uploading a week replaces that week's figures. **Load example data** builds a realistic report for this week.
- Upload history shows each week, how many students it covered, and how many were below 65%.

**Everyone: At-risk students** (PATs see their own students, Leads their campus)
- Every active student below 65% is listed with:
  - current attendance and the change since last week;
  - a 10-week trend line and the number of consecutive weeks below 65%;
  - their retention stage and last action.

  Filters: newly at risk, no action in 14 days, campus, intake, stage. The list can be exported to CSV.
- **Back above 65%** lists students who recovered but whose retention case is still open, so an admin can confirm and resolve it.

**Student page: Attendance and retention**
- A weekly attendance chart (by teaching week of the student's intake) with the 65% line, hover details and a table view.
- **One shared retention history** of PAT and admin notes, merged with attendance, wellbeing and assessment contacts from the call log. This is the record used for keep-or-withdraw decisions.
- Adding a note can move the student through the stages: newly flagged → PAT contacted → admin reviewing → action plan agreed → withdrawal recommended → resolved/kept or withdrawn. Only Admins and the Manager can record **resolved** or **withdrawn**. Withdrawn also marks the student as withdrawn everywhere.

Dashboards show each PAT's at-risk students and, for staff, an at-risk breakdown by campus.

## Step 6: what you can test

This replaces "one sheet per PAT plus one master sheet".

**PAT Admin / Manager**
- Create a **submission period** (for example "Semester 2 assessment 1") with its intakes, the submission deadline and the date PATs must follow up by. You can edit, close or reopen it.
- **Upload list**: upload a CSV or paste the non-submission report: EBS person code or uni student ID, plus the assessment. One student can miss several assessments.
  - The preview rejects unknown students, duplicates and rows already on the list.
  - It warns about students outside the period's intakes.
  - **Load example data** gives you a sample to try.
- **By PAT** is the live master view: missed, not contacted, in progress, resolved and % followed up for each PAT. It updates the moment a PAT records a follow-up.
- Export the full list to CSV at any time.

**PAT**
- See only your own students. Anyone not yet contacted is listed first, and at-risk students and students on a wellbeing plan are marked.
- **Record follow-up** with:
  - a status: contacted, no response, will submit (with an expected date), extension granted, mitigating circumstances, submitted late, or withdrawn/interrupted;
  - a note;
  - an optional **call log** entry, so it isn't typed twice.
- The dashboard shows how far you are through each open period and your follow-up date.

A student's page lists their missed submissions in every period.

## Step 7: what you can test

Built on the existing **PAT LSA records sheet** (Student ID, Student Name, Campus Name, Intake, Course Name, PAT Name, LSA Start Date, LSA End Date, Next Follow up, Intake (Standardised), Comments).

- **Filled in automatically** from the student record: student, campus, intake ("Jan-26" / "UOW JAN 26"), course and PAT. Nobody retypes them.
- **PATs update** the LSA start date, end date, next follow-up and comments, from the LSAs page or the student's page. Quick buttons set the next follow-up 2, 4 or 8 weeks ahead.
- **Every change is kept in the LSA's history**, so overwriting a comment doesn't lose the old one. Changes are also recorded in the PAT's activity history.
- **Status**: active, follow-up due (within 7 days), follow-up overdue, or ended. Overdue items come first, and the dashboards show what's due.
- **Admins and the Manager**:
  - one list across all campuses;
  - a **By PAT** view that replaces combining each PAT's sheet into a master;
  - **Export sheet (CSV)** in exactly the original column layout and date format (M/D/YYYY);
  - **Upload existing sheet** to bring the current sheets in as they are: blank rows are ignored, rows are matched on Student ID, and a row with the same student and start date updates the existing LSA.

## Step 8: what you can test

**Request leave (PAT)** in three steps:
1. **Dates**: choose the type (annual leave, time off in lieu, medical appointment, unpaid, other), dates and reason. PATops counts your working days and finds every class session in those dates.
2. **Covers**: for each session, choose a colleague. The list is ranked best match first: same campus, same shift, works that day, and not over 2 groups that day. Anyone on leave or teaching at the same time can't be chosen. **Suggest covers** fills every slot automatically.
3. **Review and submit.**

**Covers** see the request under **Cover requests** and on their dashboard, and **accept** or **decline** with a reason. If someone declines, the requester can **ask someone else** for that session. Accepted covers appear under "Classes you're covering" and on the group's page.

**Approval**: once every cover has accepted, the request goes to the **campus PAT Lead**, then the **PAT Manager**. Leads' and admins' own leave goes straight to the Manager, and a rejection needs a note. Each request shows a step-by-step timeline of who did what and when. Requesters can cancel, which releases their covers.

**Team calendar**: a six-week view of who is off, approved or still in progress, by campus.

Every step is recorded in the activity history of the PAT and their covers.

## Step 9: what you can test

**My tasks** (top of every dashboard and its own page, with a red badge in the menu for anything due today or overdue) gathers everything a person needs to do from every part of PATops, grouped into **Overdue / Due today / Next 7 days / Later / No fixed date**, and filterable by source:

- **New joiners:** profile setup and training modules, by their due dates.
- **Call log:** follow-ups you set, and students not reached in 30 days.
- **Wellbeing:** forms to chase, meetings due or missed, and meetings to log.
- **At risk:** students newly below 65%, and at-risk students with no action in 14 days.
- **Non-submissions:** students not yet contacted, due by the period's follow-up date.
- **LSAs:** follow-ups due or overdue.
- **Leave and cover:** cover requests to answer, declined covers to replace, and leave to approve (Leads and the Manager).
- **Team items** for Admins, Leads and the Manager: this week's attendance upload, new joiners ready to activate, overdue training, groups without a PAT, and assigned tasks past their due date.

These tasks **clear themselves** when the real work is done, so there's nothing to tick twice.

**Assigned tasks:** Admins, Leads and the Manager can give a task to all PATs, a campus or named people, with a due date. They can then see who has done it and who hasn't. PATs tick assigned tasks off in their list. Anyone can also add **personal reminders**.

## Step 10: what you can test

**Export audit pack** is on every staff page, and under **Audit export** in the menu. PATs get **My audit pack** for themselves.
- **Who can export:** Admins and the Manager for anyone, Leads for their campus, and everyone for themselves.
- **What's in it:** everything PATops holds about the person's work, in 12 sections:
  - training record and current groups;
  - every call-log entry, including entries marked in error;
  - wellbeing cases and each fortnight;
  - retention notes, non-submission follow-ups, LSAs and their change history;
  - leave requests, and cover given to colleagues;
  - assigned tasks and the full activity history.
- **Date range:** choose a from/to date, or leave both empty for all records.
- **Two formats:**
  - **Spreadsheet (.xlsx):** a summary tab plus one tab per section, with bold, frozen header rows.
  - **Report:** shown on screen, printable to PDF (landscape A4, with the menu and buttons hidden), and downloadable as a single **.html** file that opens and prints in any browser.
- Every export is **recorded in the person's activity history**: who exported it, the format and the date range.

The CSV export buttons across the app (and these exports) also work inside the hosted demo page, via its download feature.

## Code layout

```
src/data/types.ts   domain model (backend-agnostic)
src/data/seed.ts    demo data (6 campuses, ~40 staff, 6 training modules)
src/data/seedAcademic.ts  demo universities, courses, intakes, ~80 groups, ~1,700 students
src/data/importer.ts      CSV / Excel-paste parsing and row validation (+ tests)
src/data/seedComms.ts     ~8 weeks of demo call-log history
src/data/wellbeing.ts     wellbeing plan rules: fortnight schedule, overdue logic, compliance (+ tests)
src/data/seedWellbeing.ts demo referrals, plans and meetings
src/data/risk.ts          attendance summary, at-risk and retention-stage rules (+ tests)
src/data/seedAttendance.ts 10 weeks of demo attendance and retention notes
src/components/AttendanceChart.tsx  weekly attendance chart and sparkline
src/data/submissions.ts   non-submission follow-up progress rules (+ tests)
src/data/seedSubmissions.ts demo submission periods and non-submissions
src/data/lsa.ts           LSA status, sheet date/intake formats (+ tests)
src/data/seedLsa.ts       demo LSAs (fake students only)
src/data/leave.ts         sessions to cover, cover ranking/blocks, approval chain (+ tests)
src/data/seedLeave.ts     demo leave requests at every stage
src/data/tasks.ts         the unified task list built from every module (+ tests)
src/data/audit.ts         audit pack sections for one person (+ tests)
src/lib/auditExport.ts    audit pack → .xlsx workbook and standalone HTML report
src/lib/xlsx.ts           small .xlsx writer (fflate)
src/lib/download.ts       file saving (works in the hosted demo and normal browsers)
src/store/persist.ts      IndexedDB persistence (migrates older localStorage data)
src/data/logic.ts   pure business rules + permissions (easy to move server-side)
src/store/db.tsx    state + actions, persisted to localStorage, every action audited
src/pages/*         screens
src/components/*    layout and UI kit
```

The store is the only place that touches persistence. To make this a real product,
replace it with API calls (e.g. Supabase / Postgres) without changing the pages.
