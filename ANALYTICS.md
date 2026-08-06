# Analytics for Blackout at St. Orison

The published game uses Google Analytics 4 (GA4) to measure whether players can
start the game, learn the controls, progress through the hospital, and remain
engaged. The implementation is optional, consent-gated, production-only, and
kept outside the initial game dependency graph.

Local development and Pages builds without `GA_MEASUREMENT_ID` do not expose an
analytics configuration, request Google scripts, create analytics cookies, or
send events.

## Current property

- Property: `Blackout at St. Orison`
- Production site: <https://balaji-v19.github.io/blackout-at-st-orison/>
- Web measurement ID: `G-9PT12LHSNJ`
- Provider: Google Analytics 4 Standard

The measurement ID is public browser configuration, not an account credential.
Never commit a Google password, API secret, service-account file, refresh token,
or Measurement Protocol secret.

Official references:

- <https://support.google.com/analytics/answer/14183469>
- <https://support.google.com/analytics/answer/12270356>
- <https://support.google.com/analytics/answer/10000067>
- <https://developers.google.com/analytics/devguides/collection/ga4/events>

## Consent and loading behavior

The integration follows Basic Consent Mode:

1. The Pages build places only the public measurement ID in an HTML `meta` tag.
2. On first visit, the launch menu offers **Allow analytics** and **No thanks**.
3. Until the player grants permission, no Google tag is created, loaded, or
   contacted.
4. Granting permission initializes consent with analytics storage enabled while
   advertising storage, advertising user data, and advertising personalization
   remain denied.
5. Declining keeps the tag unloaded. Do Not Track or Global Privacy Control
   blocks analytics regardless of a previously saved choice.
6. The choice is stored locally under
   `blackout-at-st-orison-analytics-consent-v1`. The launch menu allows it to be
   changed later.

Google Signals and advertising personalization are explicitly disabled. The
game does not use Google Ads, remarketing audiences, User-ID, Measurement
Protocol, or session replay.

## Build configuration

`vite.pages.config.ts` validates `GA_MEASUREMENT_ID` and injects a configuration
`meta` tag. It deliberately does not inject `gtag.js`; `app/gameAnalytics.ts`
loads that script only after consent.

The main-branch Pages workflow currently supplies the public ID:

```yaml
env:
  GA_MEASUREMENT_ID: G-9PT12LHSNJ
```

To create a configured static build manually:

```bash
GA_MEASUREMENT_ID=G-9PT12LHSNJ npm run build:pages
```

Running `npm run dev`, `npm test`, or `npm run build:pages` without that variable
remains tracker-free.

## Events sent by the game

GA4 event names use lowercase letters and underscores.

| Event | When it is emitted | Important parameters |
| --- | --- | --- |
| `game_started` | New, continued, or endless run begins | `entry`, `chapter`, `objective_step`, `input_type` |
| `intro_skipped` | Player skips the opening cinematic | `chapter`, `input_type` |
| `orientation_completed` | All tutorial actions are complete | `steps_completed` |
| `objective_completed` | An objective advances | `chapter`, `completed_step`, `next_step` |
| `floor_entered` | Another hospital floor loads | `chapter`, `objective_step` |
| `game_over` | Health reaches zero or infection reaches 100% | `cause`, `health`, `infection`, `kills`, `chapter` |
| `story_completed` | Shelter 04 is sealed | `kills`, `survivors`, `food`, `infection` |
| `game_session_heartbeat` | Every two active minutes | Current active seconds and run summary |
| `game_session_ended` | Run ends, restarts, or reaches a terminal state | Active seconds and final run summary |
| `game_session_checkpoint` | Browser page is being left | Latest active seconds and run summary |

Active seconds include the cinematic, orientation, and live gameplay. Paused
time and time spent in a hidden browser tab are excluded. No exact movement
path, pointer coordinate, save payload, typed text, name, email, or custom
persistent player identifier is sent.

GA4 also supplies consented web-stream information such as page views, sessions,
referrers, UTM campaign parameters, broad device/browser category, screen size,
and approximate geography.

## GA4 custom definitions

Event parameters appear in DebugView and event details, but the useful ones
should be registered for Explorations. In **Admin → Data display → Custom
definitions**, create event-scoped custom dimensions for:

- `entry`
- `chapter`
- `objective_step`
- `completed_step`
- `next_step`
- `cause`
- `input_type`
- `reason`

Create event-scoped custom metrics for:

- `active_seconds`
- `health`
- `infection`
- `kills`
- `survivors`
- `survival_wave`
- `steps_completed`
- `food`

Use the parameter name exactly as shown. Registering a definition does not
retroactively populate historical reports, so configure these soon after the
first deployment.

## Recommended reports

### First-play funnel

In **Explore → Funnel exploration**, create an ordered funnel:

1. `page_view`
2. `game_started`
3. `orientation_completed`
4. `floor_entered`

This separates people who opened the page from people who started, learned the
controls, and reached another floor.

### Story and difficulty

- Funnel: `game_started → orientation_completed → floor_entered → story_completed`.
- Break down `floor_entered` and `objective_completed` by `chapter` and objective
  parameters to find progression drop-off.
- Break down `game_over` by `cause`, `chapter`, and `objective_step`.
- Compare touch and keyboard/mouse completion using `input_type`.
- Use `active_seconds` from checkpoints and ending events for gameplay time.
- Track `story_completed / game_started` as the campaign-completion rate.

### Acquisition links

Give every launch post a distinct UTM URL. For example:

```text
https://balaji-v19.github.io/blackout-at-st-orison/?utm_source=reddit&utm_medium=social&utm_campaign=public_alpha&utm_content=gameplay_clip_01
```

Change `utm_source` and `utm_content` for itch.io, YouTube, TikTok, X, Bluesky,
LinkedIn, Show HN, and each Reddit community. Compare sources using starts,
orientation completion, playtime, and story completion rather than clicks alone.

## Recommended GA4 property settings

- Set event-data retention to 14 months under **Admin → Data collection and
  modification → Data retention**.
- Keep Google Signals and advertising personalization disabled.
- Do not create a User-ID integration; the game has no account system.
- Keep enhanced measurement limited to page views. Scroll, form, site-search,
  video, and file-download events are not useful for this single-page game.
- Do not enable session replay or a second behavior recorder without updating
  `PRIVACY.md` and obtaining any additional consent required.

## Verification after deployment

1. Open the production site in a private window with Do Not Track disabled.
2. Confirm no request to `googletagmanager.com` occurs before making a choice.
3. Select **No thanks**, reload, and confirm the Google tag remains absent.
4. Clear the saved preference or select **Allow analytics** from the menu.
5. Start a run and complete an orientation action.
6. In GA4, open **Reports → Realtime** or **Admin → DebugView** and confirm
   `page_view`, `game_started`, and the later custom events.
7. Restore the browser's preferred privacy settings.

Realtime data usually appears sooner than full reports. A missing event should
never affect gameplay; analytics calls are deliberately isolated and fail-safe.
