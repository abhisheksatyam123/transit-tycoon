# Transit Tycoon JS

A browser-based transport-simulation game written in plain JavaScript, inspired by the
gameplay of [OpenTTD](https://github.com/OpenTTD/OpenTTD). Build rail and road networks,
connect towns and industries, run trains, buses and trucks, and keep your company profitable.

> Parts of the game are ported from OpenTTD (sprite tables, track/road/slope rules, house and industry
> layouts, town layouts, road vehicle movement), so the whole project is licensed **GPL-2.0** (see `LICENSE`).
> Classic graphics use sprites from [OpenGFX](https://github.com/OpenTTD/OpenGFX) (GPL-2.0); press K to toggle
> between OpenGFX and the procedural graphics.

## Quick start
```sh
cd transit-tycoon
bun run dev        # http://localhost:5173  (PORT=xxxx to override)
bun test           # unit + integration tests for the simulation core
bun run check      # verify all module imports/exports resolve
bun run simulate   # headless city run + diagnostics (see below)
```
No build step and no runtime dependencies: the browser loads native ES modules from `js/`.

## Publish the web build (static hosting)
The dev path (`bun run dev`, native ES modules from `js/`) is unchanged and is what the tests and e2e use.
For production deployments and fast cold loads, build the bundled static site:

```sh
bun run build:web        # -> dist/: bundled + minified js (code-split), index.html, css/, assets/
bun run check:dist       # validate dist/ integrity, manifest, and bundle entry points
bun run serve:dist       # optional local check on http://localhost:5174 (PORT=xxxx)
```

`dist/` is git-ignored and built on demand. Upload the **contents** of `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages, Nginx, Caddy).
- **Subpath hosting**: For hosting under a subpath (e.g. `https://<user>.github.io/<repo>/`), run `bun run build:web --base /<repo>/` or `BASE_PATH=/<repo>/ bun run build:web`.
- **MIME & compression**: Serve `.js` as `text/javascript`, and enable gzip/brotli on `.js`, `.css`, `.json`, and `.html`.
- See [`docs/DEPLOY.md`](docs/DEPLOY.md) for full static deployment instructions, Nginx/Caddy configs, and caching recommendations.

## How to play
1. Open **Help** in the toolbar for the in-game tutorial.
2. Find a Coal Mine and a Power Station (Industries window or the minimap).
3. Build a **Rail Station** next to each (the highlighted area is the catchment).
4. Connect them with **Rail**, build a **Rail Depot** attached to the line.
5. Click the depot, **Buy vehicle**: an engine plus coal wagons.
6. Open the train's **Orders**: station at the mine (*full load*), then the power station. Start it.
7. Get paid on delivery — farther and faster deliveries pay more. Use buses between towns to grow them.

## Features
- Generated terrain (hills, water, forests, snow) drawn as continuous sloped ground; towns with road grids, intercity roads, 10 industry types in cargo chains
- Rail (with level crossings), roads, rail stations, bus/truck stops, depots
- Private cars driving between houses and destinations, with congestion, failed and stuck (aborted) trips
- Traffic Monitor (traffic heatmap, car toggle) and City Issues (diagnostics list with badge)
- Trains with multiple wagons, buses and trucks; orders with full-load; breakdowns, ageing, reliability
- Station ratings, catchment and acceptance; cargo payment by distance and transit time
- Company finances: loans, interest, running costs, monthly ledger
- Town growth, news feed, minimap, save/load (localStorage, LZ-compressed, + JSON export)
- **Moscow scenario** (`?scenario=moscow`): real OpenStreetMap data (© OpenStreetMap contributors, ODbL) baked by
  `tools/moscow/bake.js` — roads by class, rail, rivers, parks/forests, satellite cities, 17 metro lines on the real
  tunnel geometry, Seven Sisters and other landmarks, Soviet/modern building styles, industry on real industrial land,
  SVO/VKO/DME airports with aircraft
- Metro (tunnels, entrances, overlay **J**, Metro window **U**), airports and aircraft (Airport tool **0**)
- Vehicle variety: 10 car body types, buses/trolleybuses/trucks, train families and liveries

## Controls
- Toolbar: **Traffic** (key **X**) opens the Traffic Monitor; **Issues** (key **G**) opens City Issues, whose badge counts errors and warnings.
- **K** toggles graphics between procedural (default) and OpenGFX sprites for ground, roads and rail.

## Simulate a city headlessly
Run the simulation without a browser (same world generator and rules as the game):
```sh
bun run simulate -- --seed 1 --years 3 --json out.json
```
It builds bus lines in the two largest towns, a road link and a coal line, runs the years and prints one row per month:
```
1950-02 money=1956368 income=958 pop=6269 veh run=2 lost=0 traffic act=445 trips=957 failed=0 aborted=0 speed=0.71 congested=107 issues e=0 w=1 i=1
1950-03 money=1957125 income=1987 pop=6291 veh run=4 lost=0 traffic act=427 trips=2235 failed=0 aborted=0 speed=0.71 congested=111 issues e=0 w=1 i=1
...
== summary == error=0 warn=4 info=2 byCategory={"network":2,"vehicle":1,"station":1,"traffic":2}
== determinism (save/load, 30 days) == MATCH
```
Columns: `act` active cars, `trips`/`failed`/`aborted` cumulative trips (failed = no route, aborted = stuck),
`speed` average speed ratio (1 = free flow), `congested` congested road tiles, `issues e/w/i` error/warn/info counts.
Exit code is `1` if there is any error-level issue or the determinism check fails, otherwise `0`.

## Project layout
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:

| Folder | Responsibility |
|---|---|
| `js/config/` | Game data tables: cargo, industries, vehicles, costs, names, traffic tunables. |
| `js/simulation/` | Pure, deterministic simulation (no DOM); `Game` in `game.js`; traffic and diagnostics. |
| `js/renderer/` | Isometric canvas renderer, sloped terrain, ground chunk cache, layers, minimap. |
| `js/input/` | Mouse/keyboard input -> camera and active tool. |
| `js/ui/` | Toolbar, status bar, windows (one file each), build tools (one file each). |
| `js/audio/` | Synthesized sound effects. |
| `js/main.js` | Wiring and the game loop. |
| `css/` | Dark-glass HUD theme. |
| `tests/` | `bun:test` tests for the simulation. |
| `tools/` | `check-imports.js` and the headless `simulate-city.js` harness. |

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License
**GPL-2.0** for the whole project (`LICENSE`). The game contains code and data tables ported from
[OpenTTD](https://github.com/OpenTTD/OpenTTD) (GPL-2.0; © the OpenTTD team). Ported files say so in their header
(e.g. `js/renderer/pack/ottd_tables.js`, `js/renderer/pack/rail.js`, `js/renderer/pack/road.js`).
Third-party content shipped in this folder:
- `assets/opengfx/` — sprites extracted from OpenGFX, **GPL-2.0** (see `assets/opengfx/LICENSE`); the
  corresponding source is the OpenGFX repository plus the `tools/ogfx/` extractor.
- `js/openloco/` (+ `js/renderer/net/locoPieces.js`, `tools/openloco/`) — track & road code and data
  tables ported from [OpenLoco](https://github.com/OpenLoco/OpenLoco), **MIT** (© OpenLoco contributors);
  see `js/openloco/README.md` for provenance and what was not ported. No Locomotion/OpenLoco assets are included.
- `js/config/maps/moscow.js` — derived from OpenStreetMap data, © OpenStreetMap contributors, **ODbL 1.0**
  (attribution required; derived databases shared under ODbL).
