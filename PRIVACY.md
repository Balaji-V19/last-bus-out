# Blackout at St. Orison gameplay analytics and privacy

The published game can collect anonymous usage information so development can
focus on the floors, controls, encounters, and devices that need the most work.
Local development does not load analytics. A published build also omits the
tracker unless the repository owner configures an Umami website ID.

## What is collected

- A page visit, referral source, broad device/browser/operating-system category,
  screen size, country, and Core Web Vitals.
- Run entry type: new game, continued save, or endless mode.
- The current hospital floor and numbered objective step.
- Completion of the orientation, objectives, floors, story, and survival waves.
- Health, infection, kill, survivor, and wave totals at occasional checkpoints.
- Active playtime, sampled once per minute and when a run ends or the page is
  closed. Time in a paused or background tab is excluded.
- Failure cause: health or infection.

## What is not collected

- Names, email addresses, account details, advertising identifiers, or a custom
  persistent player ID.
- Save-game payloads, exact movement paths, pointer positions, typed text,
  microphone/camera data, or session recordings.
- Cookies from the game analytics integration.

The integration asks Umami to honor the browser's Do Not Track setting. Umami
states that it anonymizes analytics, does not use tracking cookies or track
people across websites, and does not store the IP address used to derive broad
location information. GitHub Pages and the selected Umami host have their own
infrastructure and privacy terms.

## Configuration and retention

The repository owner controls the Umami account, hosting region, retention,
access, and deletion/export settings. Self-hosted Umami keeps data until the
owner deletes it; Umami Cloud retention depends on the selected plan. Before
publishing, the owner should review the current Umami and GitHub privacy terms
and add a public contact method for privacy questions.

Changing analytics provider, enabling session replay, identifying users, or
collecting additional data requires updating this notice before deployment.
