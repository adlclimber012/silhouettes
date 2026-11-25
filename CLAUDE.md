# Silhouette — project context

An ad-free clone of the "guess the country from its silhouette" game (the mechanic popularised by Worldle). Built because the original is full of ads. Owner: Alex. Played mostly on an **iPhone, inside an in-app webview**, usually with his wife, at night. Hosting: **GitHub Pages (free, public repo)**. No backend, no tracking, no ads — keep it that way.

It is my own implementation: no Worldle code or assets. Map data is Natural Earth (public domain) via the `world-atlas` npm package.

## Repo layout

```
index.html        the whole game (HTML + CSS + JS, single file, no build step, no frameworks)
countries.json    shape data, fetched by index.html at runtime (must sit next to it)
package.json      only needed for regenerating the data
scripts/
  build-data.mjs                      regenerates countries.json from world-atlas
  preview-territory-svalbard.mjs      experiment: builds a Svalbard & Jan Mayen shape (not shipped)
CLAUDE.md         this file
```

Deploy = push to `main`; Pages serves the root. `index.html` loads `countries.json` with a relative `fetch`, so open it through a local server (`python3 -m http.server`), not `file://`.

## How the game works

- Silhouette of a target country; **6 guesses**. Each guess row shows name, distance, a compass arrow, and "% close". Newest guess is shown first (so it stays above the phone keyboard).
- Proximity % = `1 - distance/20000km`. Distance = haversine between **country centroids** (not borders).
- **Daily** mode: deterministic. A fixed-seed shuffle (`mulberry32(20261124)`) of all countries, indexed by local-date day number mod N, so no repeats until the cycle completes. It does **not** match Worldle's daily answers. **Random** mode: unlimited.
- Autocomplete input with aliases (USA, UK, Ivory Coast, Czech Republic, etc. — see `ALIAS` in index.html). Accent-insensitive.
- Win: confetti (canvas, ~3s, skipped under `prefers-reduced-motion`), winning row pulses green, short vibrate. End panel has a copyable emoji share result.
- Stats (daily only): played / win % / streak / max / guess distribution.
- Settings: km/mi; "rotate shape" (harder).
- All state is `localStorage` (keys `sil-prefs`, `sil-stats`, `sil-day-YYYY-MM-DD`), always in try/catch.

## Data pipeline (`scripts/build-data.mjs`)

Input: `world-atlas` 50m and 10m topojson. Output: `countries.json`, one array with **one record per line**:
`{ n: name, lat, lon, sw: strokeWidth, d: svgPathData }`.

Decisions baked into the script — don't undo without reason:
- A hand-picked allow-list of ~198 names (sovereign states + Taiwan, Kosovo, Palestine, Greenland, Western Sahara). Territories are excluded for now.
- Names are renamed to friendly forms (`Dem. Rep. Congo` → `DR Congo`, `Macedonia` → `North Macedonia`, `eSwatini` → `Eswatini`, etc.).
- Each country is projected with an **azimuthal equal-area projection rotated to its own centroid**, fit into a **300×200 box** (viewBox `0 0 300 200`). This avoids antimeridian problems (Russia, Fiji) and distortion. 3:2 box chosen so wide/spread-out shapes use the full card width.
- Countries under 20,000 km² use the 10m data; Vatican City must stay on 50m (the 10m geometry is degenerate).
- Tiny outlying polygons (<3% of the largest) are dropped for big countries, and special cases keep the *mainland* silhouette: France (no overseas), Netherlands (no Caribbean), Norway (no Svalbard), USA (contiguous only, no Alaska/Hawaii).
- **Winding fix:** polygons whose spherical area exceeds 2π are reversed. Without this, tiny rings render as a giant circle (this was the Maldives bug).
- Paths are simplified with Ramer–Douglas–Peucker (ε 0.3 for big countries, 0.05 for small) to keep the file ~430 KB.
- `sw` (stroke width) is raised for scattered island nations (Kiribati, Marshall Is., Tonga, …) so their specks are visible.

Regenerate: `npm install && node scripts/build-data.mjs` (writes `countries.json` in the current directory).

## Mobile/iOS lessons (these cost a lot of iteration — read before touching layout or the input)

The keyboard covers the bottom ~40% of the screen, and the visible area above it is only ~450 css px. Every layout decision follows from that.

1. **Input goes directly under the map, above the guess rows.** It used to be at the bottom and the keyboard hid it.
2. **Suggestion list opens downward from the input**, is a real scroller (`overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y`), and items select on **`click`, not `pointerdown`** (pointerdown made every scroll attempt select a country). `mousedown` just calls `preventDefault()` so the input keeps focus.
3. While typing, `body.typing` locks the page (`position:fixed; overflow:hidden`) and the code calls `scrollTo(0,0)` on focus and on `visualViewport` scroll/resize, to stop iOS from jumping the page. **When a game ends the input is removed from the DOM, so no blur fires — `render()` must remove `body.typing` itself.** Forgetting this left the page stuck in compact mode.
4. The map is deliberately **one constant size in every state** (idle, typing, won): `height:min(31vh,240px)`, aspect 3:2. The user noticed and disliked size changes between states. Header is a single compact row (title + Daily/Random tabs + stats/settings) to save vertical space; the tabs must stay visible while typing so you can get back to Daily.
5. The suggestion list's `max-height` is computed in `drawSugg()` from `min(visualViewport.height, innerHeight*0.6) - input bottom`, because the iOS webview does not always shrink the viewport for the keyboard.
6. Input font-size must stay ≥16px (prevents iOS zoom on focus).
7. **No iOS AutoFill bar on the guess box.** Safari ignores `autocomplete="off"` and guesses "address field" from nearby words, so: the input is **not inside a `<form>`** (Enter and the Guess button call `submit()` directly), and its placeholder, name and label avoid address words like "country", "region", "territory", "state" and "city". Keep it that way when editing the input.

## Testing

No test suite. Verification so far was done with headless Chrome + Playwright (Python) at phone sizes (393×430 for "keyboard up", 393×749 for the in-app viewport), including real touch drags via CDP `Input.dispatchTouchEvent` to confirm the list scrolls without selecting. A contact sheet of all 198 shapes was rendered after each data change — do the same, it catches winding/projection bugs instantly. `Math.random` can be stubbed to force a specific Random-mode target. Real-device checks on iPhone are the final word.

## Known limitations

- Scattered Pacific nations (Kiribati, Marshall Islands, Micronesia, Tonga, Palau…) are tiny dots; inherently hard, same as the original.
- Vatican City, Monaco, etc. are crude polygons (source data resolution).
- Distance uses centroids, so e.g. "Russia ↔ neighbour" distances look odd.

## Open items / next up (agreed with Alex)

1. **Arrow direction for far-apart countries.** Currently the arrow is the true great-circle bearing, so Venezuela → China points ⬆️ (over the North Pole), which is disorienting. Options: **A** flat-map bearing — `dx = wrappedΔlon·cos(midLat)`, `dy = Δlat`, quantised to 8 directions, so Venezuela→China is ➡️ (my recommendation: distance stays true, arrow is for orientation); **B** hybrid — great-circle under ~8,000 km, flat-map beyond; **C** keep as is. Alex said he'd sleep on it — **ask which he chose before implementing.**
2. **Territories as a game setting** (Alex agreed). Plan: a toggle in Settings that adds territories to the pool (default off = countries only). Needs: territory allow-list in `build-data.mjs` (Svalbard & Jan Mayen via `scripts/preview-territory-svalbard.mjs` — Norway polygons with centroid lat>73, plus Jan Mayen at lon<0, lat>70; Puerto Rico, Guam, Faroe Islands, etc.), a flag on each record (e.g. `t:1`), filter in the game for both Random and Daily (Daily order must not change when the toggle flips — use a separate shuffle for territories mode, and a separate `sil-day-` key), and accept territory names in autocomplete only when enabled. Also the autocomplete should list territories when enabled.
3. Possible polish: hint button (continent / first letter), colour-blind-safe proximity indicators, installable PWA/home-screen icon.

## Conventions

- Keep it a single static `index.html` + `countries.json`; no bundler, no external requests, no analytics.
- Attribution line for map data stays in the footer ("Natural Earth, public domain").
- When changing `countries.json`'s shape format, update the `viewBox` in `index.html` to match (currently 300×200).
