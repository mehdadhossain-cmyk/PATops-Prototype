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
| 2 | Intakes, partner universities, groups & student records (admin import) | ⏳ Next |
| 3 | Call / communication log (replaces the call-log Excel) | ⏳ |
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

## Code layout

```
src/data/types.ts   domain model (backend-agnostic)
src/data/seed.ts    demo data (6 campuses, ~40 staff, 6 training modules)
src/data/logic.ts   pure business rules + permissions (easy to move server-side)
src/store/db.tsx    state + actions, persisted to localStorage, every action audited
src/pages/*         screens
src/components/*    layout and UI kit
```

The store is the only place that touches persistence. To make this a real product,
replace it with API calls (e.g. Supabase / Postgres) without changing the pages.
