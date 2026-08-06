# Blackout at St. Orison gameplay analytics and privacy

The published game offers optional Google Analytics 4 (GA4) measurement so its
maintainer can understand which hospital floors, controls, encounters, and
device types need improvement. Analytics is disabled until the player grants
permission from the launch menu.

Local development and unconfigured builds do not load Google Analytics.

## Consent

- Before permission, the game does not load a Google tag, contact Google
  Analytics, create analytics cookies, or send analytics events.
- **Allow analytics** enables GA4 for that browser.
- **No thanks** keeps analytics disabled.
- The launch menu displays the current setting and allows it to be changed.
- Browser Do Not Track and Global Privacy Control disable analytics regardless
  of the saved selection.
- The selection itself is stored in local browser storage under
  `blackout-at-st-orison-analytics-consent-v1` so the game can remember it.

Advertising storage, advertising user data, advertising personalization,
Google Signals, and User-ID are disabled. This project does not use GA4 for
advertising or remarketing.

## Information collected after permission

- Page visits, sessions, referral source, and UTM campaign information.
- Broad device, browser, operating-system, screen-size, and approximate
  geographic categories supplied by GA4.
- Run entry type: new game, continued save, or endless mode.
- Current hospital floor and numbered objective step.
- Completion of the orientation, objectives, floors, story, and survival waves.
- Health, infection, kill, survivor, food, and wave totals at occasional
  checkpoints.
- Active playtime, sampled every two active minutes and when a run ends or the
  page is closed. Paused and background-tab time is excluded.
- Failure cause: health or infection.

GA4 may create first-party analytics cookies such as `_ga` after consent to
distinguish visits and sessions.

## Information not collected by this integration

- Names, email addresses, account details, or a custom persistent player ID.
- Save-game payloads, exact movement paths, pointer positions, typed text,
  microphone or camera data.
- Session recordings, heatmaps, or screenshots of gameplay.
- Advertising identifiers or cross-site advertising profiles requested by the
  game.

## Provider and retention

Analytics data is processed by Google under the Google Analytics terms and
privacy documentation:

- <https://policies.google.com/privacy>
- <https://support.google.com/analytics/answer/12017362>
- <https://support.google.com/analytics/answer/10000067>

The repository owner controls access to the GA4 property and should configure
event-data retention to 14 months. Aggregated reports and data already processed
before a player withdraws consent may remain until the applicable retention or
deletion period expires.

GitHub Pages also processes ordinary infrastructure information needed to serve
the website under GitHub's own privacy terms.

## Changes and questions

Changing analytics provider, enabling session replay, adding advertising,
identifying players, or collecting materially different information requires
updating this notice before deployment.

Privacy questions can be raised through the repository's public issue tracker:
<https://github.com/Balaji-V19/blackout-at-st-orison/issues>.
