# TutorPortal

A website for maths tutors to build custom Mathematics Advanced practice papers from trial paper questions.
Static site on GitHub Pages. Accounts and paper history (Phase 3+) use Supabase.

## Structure

```
site/                 The website (this folder is what gets deployed)
  index.html          Home
  builder.html        Paper builder: 1 Choose, 2 Preview and print
  login.html          Sign in / create account (placeholder until Phase 3)
  css/style.css       All theme colours are variables at the top
  js/app.js           Builder logic
  js/config.js        Supabase keys go here (Phase 3)
  data/               questions.json and diagrams.json (generated)
data/                 Put Master_Question_Database.xlsx here
scripts/build-data.mjs  Workbook -> site/data/*.json
.github/workflows/deploy.yml  Deploys to GitHub Pages on every push to main
```

## First-time setup

1. Create a GitHub repo and upload everything in this folder (or `git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push -u origin main`).
2. Repo Settings > Pages > Source: **GitHub Actions**.
3. Put `Master_Question_Database.xlsx` in `data/` and push. The workflow rebuilds `site/data/*.json` and redeploys.

## Adding a paper

Add rows to the workbook (see its Read me sheet), replace the file in `data/`, push. Duplicate Question IDs fail the build.

## Local preview

```
npm install
npm run build:data   # only if the workbook is in data/
npm run dev
```

`site/data/` currently holds a small sample so the site works before the real workbook is added.

## Roadmap

- Phase 3: Supabase accounts (email + Google), profile page
- Phase 4: saved paper history (open, duplicate, re-print, delete)
- Phase 5: answers sheet, "already used with this student/class", default settings
- Phase 6: data clean-up (visual check of papers, 2024 diagrams)


## Login is required to build papers

- `builder.html` redirects to `login.html` unless the visitor has a Supabase session.
- Questions are **not** in the public site. They live in Supabase tables `questions` and `diagrams`, which row-level security lets only logged-in users read. (A front-end redirect alone would not protect a public JSON file.)

### One-time setup
1. Create a free project at supabase.com. In SQL Editor, run `supabase/setup.sql`.
2. Authentication > Providers: keep Email on (optionally add Google). Authentication > URL Configuration: add your GitHub Pages URL as Site URL.
3. Paste Project URL and anon key into `site/js/config.js`.
4. GitHub repo > Settings > Secrets and variables > Actions: add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (the service_role key; never put it in the site).
5. Commit `data/Master_Question_Database.xlsx` and push. The workflow loads questions into Supabase and deletes `site/data` before deploying.

Local preview with no keys set runs in demo mode (sample questions, no login) on localhost only.

## NESA reference sheet (optional)

The builder's "NESA reference sheet" option draws NESA's own PDF onto A4 pages at the back of the paper.
NESA does not allow it to be fetched automatically, so add it once yourself:

1. Download "Mathematics Advanced, Extension 1 and 2 Reference Sheet" from
   https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/mathematics-advanced-extension-reference-sheet
2. Save it as `site/assets/reference-sheet.pdf` (create the `assets` folder inside `site`), then commit and push.

## Contact messages and "last updated"

Run `supabase/setup.sql` in the Supabase SQL Editor (it is safe to re-run). Messages sent from the home page appear
in Supabase under Table Editor > `contact_messages`.
