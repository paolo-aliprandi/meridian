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

The live digital time is the hero, rather than a marketing headline. The primary
comparison keeps both times, their date-specific abbreviations
(EST/EDT, CET/CEST, etc.), UTC offsets, and the time difference together above the
fold. Hovering previews a place in that same comparison; clicking selects it.
Calendar-day badges make next/previous-day conversions explicit. Abbreviations
expand to their full names on hover and always include the UTC offset to
disambiguate labels such as CST. Where a short abbreviation is unavailable, the
UTC offset is shown instead. Touch selections also announce the result on screen.

Use **Add a place** to compare working hours across time zones. Each selected
place shows **Working · 9–5** or **Outside 9–5**, with a count above the cards.
The rule is 09:00 inclusive to 17:00 exclusive in each place's local time,
every day (not a weekday/holiday calendar). Statuses follow live time or the
date and time entered in the converter, including daylight-saving changes.

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

## Search and sharing

The production HTML includes a canonical URL, indexable product description,
Open Graph/Twitter preview metadata and WebApplication structured data.
`public/social-preview.png` is a screenshot of Meridian, not an external image.
The sitemap is at https://paolo-aliprandi.github.io/meridian/sitemap.xml.

On GitHub Pages project sites, `/meridian/robots.txt` is not the host-level
`/robots.txt` used by crawlers. The page itself explicitly permits indexing via
its robots meta tag; host-level crawler rules remain controlled by the parent
site. Submit the sitemap in Google Search Console for discovery; metadata does
not guarantee indexing, rich results or rankings.
