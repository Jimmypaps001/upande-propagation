# Upande Propagation

The propagation unit's phone. The plan says what should happen; this says what
did — a consignment arrived, roots came out of the cold store, a lift went to
the farm, something died.

Built on the structure and design of
[Upande Post Harvest](https://github.com/WilfredTinega/Upande-Post-Harvest):
same Expo Router shell, same session handling, and `src/theme.ts` copied from
it unchanged, because those tokens are canonical across the Upande mobile apps.

## What it talks to

Everything lands on `upande_summer_flowers` on an ERPNext site. Nothing here
is a Server Script, so a method name maps straight to a path:

| Screen | Endpoint |
|---|---|
| Home | `planning_api.propagation_detail` |
| Record | `planning_api.record_propagation_actual` |
| Setup | `frappe.client.get_list` on Warehouse, propagation units only |
| Sign in | `/api/method/login`, confirmed with `frappe.auth.get_logged_user` |

A recorded event becomes a **submitted** Summer Flower Propagation Actual. The
plan reads its variance back from those, so a wrong figure is corrected by
cancelling the record — never by typing a different number over it.

## Running it

Needs Node 20 (Expo SDK 57; Node 18 is too old).

```
nvm use 20
npm install
npm start          # then scan the QR with Expo Go, or
npm run android    # build and run on a connected device
npm run typecheck
npm run lint
```

## Layout

```
app/                 the screens, routed by file name
  _layout.tsx        fonts, the auth gate, the stack
  login.tsx          server + email + password
  setup.tsx          which propagation unit this phone is
  index.tsx          the plan, the four things to record, what is outstanding
  record/[event].tsx one event, one form
  settings.tsx       who is signed in, and where
src/
  theme.ts           Upande design tokens — do not fork these
  services/          http, session, storage, and the propagation calls
  stores/            zustand: auth, network, which unit and plan
  components/        Screen, Card, Button, LabeledInput, Pill, Toast
```

## Building and releasing

CI is ported from Post Harvest. A PR into `mobile` lints, typechecks, runs the
versioning rules and assembles a debug APK; merging advances the version one
odometer step and publishes a signed APK as a GitHub Release. See
[docs/RELEASING.md](docs/RELEASING.md), and `scripts/setup-signing.sh` for the
keystore.

`eas.json` is here for parity, but nothing reads it: the runner does what
`eas build` would do with `expo prebuild` plus Gradle, so there is no Expo
account and no EAS credits in the loop.

Post Harvest ships a patch release over the air and builds an APK only when the
runtime opens. This app carries no expo-updates, so **every release is an APK** —
`releaseKindFor()` in `scripts/version.mjs` is the one line to change if that
stops being true.

## What it deliberately does not do

No barcode scanning, no offline outbox, no OTA channel. Post Harvest needs all
three because a packhouse scans thousands of bunches in a shift with patchy
signal. A propagation unit records a handful of events a week, so the simpler
thing is the right thing until it is not.
