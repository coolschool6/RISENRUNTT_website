# Verification — 23 September 2026

## Functional checks

All 16 automated tests pass (`npm test`). They cover persisted event creation, validation, screenshot uploads, manual Strava links, duplicate submissions, approval, corrections, rejection, resubmission, participant import, enrollment rules, deadlines, protected data paths, cross-origin writes, persistence after restart and page routes.

A separate browser-test database was used for a full real-click workflow: create and publish an event; upload artwork; open its public page; upload synthetic activity proof; submit; request resubmission with a required reason; see that reason as the runner; resubmit a manual activity link; approve; verify the leaderboard and public result card. The synthetic link was not opened or represented as a real Strava activity.

The main website remains clean: 3 sourced events, 0 participants and 0 submissions. No test results were inserted into it. Browser route checks also passed for How it works, Results, Our story, FAQ, Profile, My runs, Participants, Analytics and Settings. No browser JavaScript errors were observed in these checks.

## Visual review

Scores below are the builder’s subjective review, not independent ratings. Major screens were captured and checked before handoff. Desktop and 390-pixel phone layouts were inspected; the tested mobile pages have no document-level horizontal overflow. Admin navigation and result tables can scroll horizontally within their own containers.

| Stage | Review score | Screenshot |
|---|---:|---|
| Homepage | 8.8/10 | [Desktop](../screenshots/01-home-desktop.png), [mobile](../screenshots/08-home-mobile.png) |
| Event catalogue | 8.8/10 | [Desktop](../screenshots/02-events-desktop.png), [mobile](../screenshots/09-events-mobile.png) |
| Kyoto detail | 8.8/10 | [Desktop](../screenshots/03-kyoto-event.png), [mobile](../screenshots/11-kyoto-mobile.png) |
| Run upload | 8.5/10 | [Filled synthetic test](../screenshots/04-upload-qa.png), [mobile](../screenshots/10-upload-mobile.png) |
| Admin review | 8.5/10 | [Synthetic test](../screenshots/05-admin-review-qa.png) |
| Approved results | 8.5/10 | [Leaderboard](../screenshots/06-leaderboard-qa.png), [result card](../screenshots/07-result-card-qa.png) |
| Admin overview and editor | 8.5/10 | [Desktop](../screenshots/13-admin-desktop.png), [mobile](../screenshots/12-admin-mobile.png), [create event](../screenshots/14-create-event-desktop.png) |

The Conqueror comparison informed the large campaign-art hero, strong headline hierarchy, medal-first event cards, browsing controls and separate event-detail pages. Rise & Run’s own brand artwork and event information are used. No competitor medal imagery or invented community statistics appear on the site. See SOURCES.md for artwork provenance.

## Intentional scope

Local-only application. No login, Strava OAuth/API, payments or outgoing email service, as requested. Manual Strava links are evidence for human review. Before public hosting, authentication, admin authorization and deployment/privacy controls are required. Kyoto’s initial date boundaries are explained in README.md and can be edited in the admin.
