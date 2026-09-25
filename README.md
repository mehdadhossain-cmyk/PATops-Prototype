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
| 3 | Call / communication log (replaces the call-log Excel) | ⏳ Next |
| 4 | Wellbeing plans: bi-weekly meeting & "logged in wellbeing app" tracking | ⏳ |
| 5 | Weekly attendance import & at-risk students (<65%) with PAT + admin comment history | ⏳ |
| 6 | Non-submission tracking per submission period | ⏳ |
| 7 | LSA tracking | ⏳ |
| 8 | Leave requests: dates → cover PATs accept → Lead → Manager | ⏳ |
| 9 | Unified PAT dashboard / task list with due dates | ⏳ |
| 10 | One-click audit export of a PAT's full history | ⏳ |

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

## Code layout

```
src/data/types.ts   domain model (backend-agnostic)
src/data/seed.ts    demo data (6 campuses, ~40 staff, 6 training modules)
src/data/seedAcademic.ts  demo universities, courses, intakes, ~80 groups, ~1,700 students
src/data/importer.ts      CSV / Excel-paste parsing and row validation (+ tests)
src/data/logic.ts   pure business rules + permissions (easy to move server-side)
src/store/db.tsx    state + actions, persisted to localStorage, every action audited
src/pages/*         screens
src/components/*    layout and UI kit
```

The store is the only place that touches persistence. To make this a real product,
replace it with API calls (e.g. Supabase / Postgres) without changing the pages.
