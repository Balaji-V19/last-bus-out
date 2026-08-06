# Analytics for Blackout at St. Orison

The published game supports anonymous gameplay analytics through Umami. The
integration is optional, production-only, cookieless, and deliberately small.
Local development and unconfigured Pages builds do not request an analytics
script or send events.

## Why Umami

Umami provides page visits, referrers, devices, browsers, countries, Core Web
Vitals, custom events, funnels, retention, journeys, goals, and UTM campaign
reports. It is open source and can be used through Umami Cloud or self-hosted.

For this project, start with Umami Cloud:

| Option | Advantages | Responsibility |
| --- | --- | --- |
| Umami Cloud | Fastest setup, managed updates, free Hobby option for low traffic | Umami hosts the analytics data |
| Self-hosted Umami | Full infrastructure and retention control | PostgreSQL, deployment, backups, security, upgrades, and uptime |

Official references:

- https://docs.umami.is/docs
- https://docs.umami.is/docs/cloud
- https://docs.umami.is/docs/tracker-configuration
- https://docs.umami.is/docs/insights

## Enable analytics on GitHub Pages

1. Create an account at https://cloud.umami.is/signup or deploy a self-hosted
   Umami instance.
2. Add a website named `Blackout at St. Orison` with the domain
   `balaji-v19.github.io`. The repository path is part of each event URL, not
   the website domain field.
3. Copy the generated website UUID.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions
   → Variables**.
5. Create `UMAMI_WEBSITE_ID` with the website UUID.
6. Create `UMAMI_DOMAINS` with `balaji-v19.github.io`. This prevents an
   accidentally copied production tracker from reporting another hostname.
7. Only for self-hosting, create `UMAMI_SCRIPT_URL` with the HTTPS tracker URL.
   If this variable is absent, the Pages build uses
   `https://cloud.umami.is/script.js`.
8. Push normally to `main`. The Pages workflow injects the script while
   building. No analytics code is injected when `UMAMI_WEBSITE_ID` is absent.

The website ID is a public browser identifier, not a password. Do not put an
Umami login, API token, database URL, or account secret into repository
variables intended for the browser.

## Events sent by the game

| Event | When it is emitted | Important data |
| --- | --- | --- |
| `game-started` | New, continued, or endless run begins | Entry type, chapter, objective, input type |
| `intro-skipped` | Player skips the opening cinematic | Chapter and input type |
| `orientation-completed` | All tutorial actions are complete | Completed step count |
| `objective-completed` | An objective advances | Chapter, completed step, next step |
| `floor-entered` | Another hospital floor loads | Chapter and opening objective |
| `game-over` | Health reaches zero or infection reaches 100% | Cause, health, infection, kills, chapter |
| `story-completed` | Shelter 04 is sealed | Kills, survivors, food, infection |
| `game-session-heartbeat` | Once per active minute | Active seconds and current run summary |
| `game-session-ended` | Run ends, restarts, or exits through the menu | Active seconds, final chapter and summary |
| `game-session-checkpoint` | Browser page is being left | Latest active seconds and run summary |

Active seconds include the intro, orientation, and live gameplay. Paused time
and time spent in a hidden browser tab are excluded. No exact movement path,
pointer coordinate, save payload, typed text, name, email, or persistent custom
player identifier is sent.

## Recommended dashboard

Create these reports after real events arrive:

### Acquisition

- Visitors and visits by day.
- Referrer, device, operating system, browser, and country.
- Core Web Vitals, especially LCP and INP on mobile.
- UTM source, campaign, and content for every launch post.

### First-play funnel

Create a funnel with a 60-minute window:

1. Viewed `/blackout-at-st-orison/`
2. Triggered `game-started`
3. Triggered `orientation-completed`
4. Triggered `floor-entered`

This separates people who opened the page from people who actually started,
learned the controls, and reached another floor.

### Story funnel

Use ordered events for:

1. `game-started`
2. `orientation-completed`
3. `floor-entered`
4. `story-completed`

Filter `floor-entered` and `objective-completed` by `chapter` and
`objective_step` to find the exact floor or task where most runs stop.

### Difficulty and engagement

- Break down `game-over` by `cause`, `chapter`, and `objective_step`.
- Review `active_seconds` on session heartbeats and ending/checkpoint events.
- Compare touch and keyboard/mouse completion rates using `input`.
- Compare mobile and desktop Core Web Vitals before increasing visual detail.
- Track `story-completed / game-started` as the main campaign-completion rate.

## Campaign links

Give every post a distinct UTM link. For example:

```text
https://balaji-v19.github.io/blackout-at-st-orison/?utm_source=reddit&utm_medium=social&utm_campaign=public_alpha&utm_content=gameplay_clip_01
```

Change `utm_source` and `utm_content` for itch.io, YouTube, TikTok, X, Bluesky,
LinkedIn, Show HN, and each Reddit community. Do not compare only click counts:
compare each source's `game-started`, `orientation-completed`, active playtime,
and story-completion rate.

## Accuracy and cost considerations

- Do Not Track is honored, and blockers can suppress the tracker, so Umami is a
  useful directional measure rather than an exact census of every player.
- Umami Cloud counts page hits, custom events, and stored event-data properties
  toward usage. The one-minute heartbeat is appropriate for an early low-traffic
  playtest. Increase it to two or five minutes if event volume becomes costly.
- Bots are normally excluded, but unusual traffic should still be reviewed.
- Standard website duration can undercount a single-page game. The custom
  `active_seconds` property and heartbeat solve that problem for gameplay.
- Do not enable distinct user IDs. The game has no account system and does not
  need cross-device identity.

## Session replay

Umami v3 supports optional replay recording, but this project does not enable
it. Replays add a separate recorder, collect much more interaction detail, and
cannot reliably show the changing contents of a WebGL canvas. The existing
event funnel is more private, lighter, and more actionable for the game.

If replay or heatmaps are ever enabled, use strict masking, sample only a small
percentage of sessions, exclude the game HUD where practical, and update
`PRIVACY.md` before deployment.

## Verification

After the first configured deployment:

1. Disable Do Not Track temporarily in the test browser.
2. Open the Pages URL in a private window.
3. Start a new run, complete one orientation action, and leave the page.
4. Confirm the pageview, `game-started`, and session checkpoint in Umami's
   realtime/activity view.
5. Re-enable the preferred browser privacy setting.

Never test production analytics by adding the tracker to local development.
