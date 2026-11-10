# Meridian

A different perspective on time. An interactive, responsive 3D Earth with real
time-zone boundaries, date-driven sunlight and city lights, and local-time conversion.

**Live:** https://paolo-aliprandi.github.io/meridian/

## Development

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Drag to rotate, scroll or pinch to zoom, hover to compare time zones, and click/tap
to select. Search provides a keyboard-accessible alternative to interacting with
the canvas. “Find my place” requests geolocation only on demand; coordinates never
leave the browser. The initial home zone comes from the device. Changing the home
zone preserves the selected instant.

The converter includes a date so daylight-saving rules apply to the requested
moment. Nonexistent or ambiguous local times are rejected explicitly. Date and time
rules come from the browser's IANA data; keep the browser current. The globe's
terminator is astronomical. City card sun/moon icons use approximate local daytime
(07:00–19:00), not local sunrise calculations.

The primary comparison keeps both clocks, their date-specific abbreviations
(EST/EDT, CET/CEST, etc.), UTC offsets, and the time difference together above the
fold. Hovering previews a place in that same comparison; clicking selects it.
Calendar-day badges make next/previous-day conversions explicit. Abbreviations
expand to their full names on hover and always include the UTC offset to
disambiguate labels such as CST. Where a short abbreviation is unavailable, the
UTC offset is shown instead. Touch selections also announce the result on screen.

## Data and credits

- Earth textures: NASA Visible Earth, distributed through the
  [Three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets).
- Geographic outlines: [Timezone Boundary Builder 2026f](https://github.com/evansiroky/timezone-boundary-builder/releases/tag/2026f),
  including oceans; based on OpenStreetMap contributors, licensed under
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  `public/timezones.geojson` is an adapted, simplified database under ODbL 1.0.
  Attribution and the source of the adapted database are provided here and in the UI.
  See `public/BOUNDARIES-LICENSE.txt` for the license text.
- Hover and geolocation lookup: [tz-lookup](https://github.com/darkskyapp/tz-lookup),
  CC0. Its bundled lookup may differ from 2026f outlines at recently changed or tiny
  borders. Simplification is visual only, never used to calculate offsets.
- Three.js (MIT), React (MIT), Lucide (ISC), Temporal polyfill (ISC).
- DM Sans and Space Grotesk via Google Fonts (SIL Open Font License).

To reproduce the simplified geographic data, download
`timezones-with-oceans.geojson.zip` from the linked release, extract it, then run:

```sh
npx mapshaper combined-with-oceans.json \
  -simplify dp interval=18000 keep-shapes \
  -filter-fields tzid \
  -o format=geojson precision=0.01 public/timezones.geojson
```

The simplification tolerance is 18 km; outlines are for exploration, not navigation
or legal boundary determinations.

## Deployment

Pushes to `main` run lint, tests and a production build, then deploy to GitHub Pages
using GitHub Actions. No API keys, backend, paid service, or private credentials are
required.
