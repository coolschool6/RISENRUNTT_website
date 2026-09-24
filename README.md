# Rise & Run TT website

Run `npm start` in this folder with Node.js 24 or later, then open http://localhost:4173. No package install is required. `Start-Website.ps1` is an alternative launcher.

The previous URL `/RISENRUNTT_website.html` still opens the homepage. All navigation uses independent URLs and full page navigation. Direct links and refresh work.

## What works

- Event catalogue, search and filters; individual event stories, gallery and upload pages.
- Screenshot upload (PNG/JPG/WebP), preview, drag and drop, manual Strava activity links, distance/date/time validation, calculated pace and submission confirmation.
- My runs with persisted review status and rejection reasons; profile editing, medal collection, approved-only leaderboards, runner search, sorting, pagination, CSV export and shareable/printable results.
- Admin creation/editing of events, cover/medal/gallery image uploads, draft/open/closed/completed states, activity windows, deadlines, distance rules, accepted activities, resubmission and roster checks. Empty draft events can be deleted.
- Submission evidence review, approval, rejection with a required reason, return to pending, and corrections to time/distance. Results derive directly from approved submissions.
- Participant add/edit/deactivation, bibs, history, validated CSV import and roster export.
- Analytics from real stored data and editable organizer settings.

## Local storage and scope

`data/risenrun.sqlite` stores events, profiles, participants, submissions and settings. `data/uploads` stores image files. Keep both together when backing up. The server does not expose the data directory. The server accepts loopback connections only and rejects cross-origin writes.

Authentication and external services are excluded as requested. Admin access therefore has **no login**, and local profiles are linked to an HttpOnly browser cookie. This is a working local application, not a publicly deployable authenticated service. Do not expose its port to the internet. Strava links always require human review; there is no Strava OAuth or automatic activity import. Email delivery and production account management are not enabled. Result links currently work only on this computer.

The site starts with sourced event content and empty participants/results. No fabricated runners, testimonials, achievements, progress or community counts are seeded. Test data lives in separate temporary databases.

Kyoto’s October–November activity window and November collection details come from the supplied event settings. November 30 is used as the end of that stated window and the initial submission deadline; the admin can change it. Paris has no invented dates. The 90s collection is initially closed until the organizer sets its current availability.

## Verification

Run `npm test` for isolated API tests covering the screenshot/Strava workflow, review decisions, result privacy, distance/date validation, duplicate proof, roster import, persistence, publishing/deletion and loopback protections. Browser screenshots are saved beside this project in `../screenshots`.

## Source files

`server.mjs` — local HTTP server and SQLite persistence.

`seed.mjs` — sourced initial event content.

`public/app.js` — public and admin page rendering/interactions.

`public/styles.css` — responsive visual system.

`SOURCES.md` — brand image provenance and design references.
