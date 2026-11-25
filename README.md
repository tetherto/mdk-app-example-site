# mdk-app-example-site

Example MDK mining site, run by the [MDK CLI](https://www.npmjs.com/package/@tetherto/mdk-cli) from one `mdk.yaml`. A single `mdk run` boots the Kernel, the miner, pool and power-meter workers with their mock devices, five Gateway apps and the Gateway, which serves a React UI.

## Prerequisites

- Node.js **24+** (`node -v`)
- npm
- Git access to GitHub (several workers and apps are installed from Git repositories)

## Setup

```sh
npm run setup
```

This runs `scripts/setup.sh`, which does the following:

1. Installs the dependencies, including the `mdk` CLI (`@tetherto/mdk-cli`, a dev dependency).
2. Fetches the SATEC power-meter worker into `vendor/mdk-satec` (see [Dependencies](#dependencies-and-how-they-are-integrated)).
3. Builds the UI into `ui/dist`.
4. Writes `MDK_SITE_UI_DIST`, the absolute path of `ui/dist`, to `.env`. The Gateway's `staticRootPath` in `mdk.yaml` reads it.

## Run

```sh
npm start
```

This runs `mdk run`, which starts the whole stack in the foreground and stops it on Ctrl+C. The UI is at <http://localhost:3000/>.

Every app route needs a signed-in user, because `spec.rbac` in `mdk.yaml` is enforced. Users live in the Kernel, so create one while the stack runs:

```sh
npm run mdk -- user add admin --admin
```

Then sign in to the UI with that user. The `mdk` CLI uses its own session, from `npm run mdk -- login admin`.

Useful commands, from another terminal:

```sh
npm run status          # what is running
npm run mdk -- --help   # every CLI command
```

Runtime data, keys and the CLI session are written to `.mdk/`.

## Configuration

`mdk.yaml` is the whole site:

| Section | What it sets |
| --- | --- |
| `spec.network` | A private HyperDHT bootstrap on `127.0.0.1:49737`, so the site needs no internet access |
| `spec.gateway` | Port 3000, and the UI served from `ui/dist` |
| `spec.mcp` | The MCP server on port 3101 (`npm run mcp`) |
| `spec.workers` | One entry per worker, with its devices and its mock (`config.mock`) |
| `spec.apps` | The Gateway apps and their config |
| `spec.rbac` | Roles and bindings. `npm run mdk -- rbac init` grants each app the Kernel access its manifest asks for |

`${NAME}` in `mdk.yaml` is read from `.env` or the environment. A device's `opts` reach both the worker and its mock, so they carry the worker's `address` and the mock's `host` and `state`. To change the miners, edit their `devices` and the Operation Center `layout` that places them.

## Dependencies and how they are integrated

### MDK platform (npm, `0.14.0`)

| Package | Used for |
| --- | --- |
| `@tetherto/mdk-cli` | `mdk run`, `mdk user`, `mdk rbac`, `mdk status`. It brings the Kernel, Gateway, app runtime, MCP server, identity and RBAC packages |
| `@tetherto/mdk-worker` | The worker runtime: the pool bridge (`workers/v1-pool`) and its test use it |
| `@tetherto/mdk-core`, `@tetherto/mdk-kernel` | Peer dependencies of the EMCD, SpiderPool and Foundry workers, through `lib/mdk-compat` |
| `@tetherto/mdk-ui-foundation`, `@tetherto/mdk-react-adapter`, `@tetherto/mdk-react-devkit` | UI building blocks, sign-in, and hosting the apps' UI modules |

### Device workers and mocks

Third-party workers are installed from Git, each pinned to a commit. Each one runs its vendor's bundled mock, so no real hardware is needed.

| Worker (`spec.workers`) | Package | Kind |
| --- | --- | --- |
| `whatsminer-m56s-telemetry-flow` | `whatsminer-mdk-worker` | Miner (WhatsMiner M56S) |
| `antminer-s21-telemetry-flow` | `antminer-mdk-worker` | Miner (Antminer S21) |
| `sealminer-a2-telemetry-flow` | `sealminer-mdk-worker` | Miner (SealMiner A2) |
| `ocean-pool-worker` | `ocean-mdk-worker` | Pool (OCEAN) |
| `emcd-pool-worker`, `spiderpool-pool-worker`, `foundry-pool-worker` | `./workers/v1-pool` | Pools (EMCD, SpiderPool, Foundry) |
| `satec-powermeter-worker` | `./vendor/mdk-satec/…/satec` (fetched, see below) | Power meter (SATEC PM180, device `SATEC-001`) |

**EMCD, SpiderPool and Foundry pools.** These workers' handlers read a pool service the host passes in, which `mdk.yaml` cannot carry. `workers/v1-pool` is a small worker plugin that builds that service for its device (`opts.kind` picks the vendor), polls it every `opts.tickMs`, and publishes `hashrate`, `workers_online`, `balance`, `estimated_earnings`, `stats` and `stats_history`. Its mock starts the vendor's own pool API mock. For a real pool, set `apiUrl`, turn `mock` off, and pass the credentials in the worker's `env` (`EMCD_API_KEY`/`EMCD_API_SECRET`, `SPIDERPOOL_ACCESS_KEY`/`SPIDERPOOL_PRIVATE_KEY`, `FOUNDRY_API_KEY`). Without them, the vendor's mock keys are used.

**SATEC power meter.** The SATEC worker lives in a subfolder of the [tetherto/mdk](https://github.com/tetherto/mdk) monorepo. It isn't published to npm, and its mock requires files outside its own folder, so it can't be a `package.json` dependency. Instead, `npm run setup:satec` (`scripts/fetch-satec.js`) does the following:

1. Downloads the tetherto/mdk release tarball whose tag matches the installed `mdk` CLI.
2. Extracts the worker, the shared mock package (`backend/workers/mock`) and the root `package.json` and `package-lock.json` into `vendor/mdk-satec/`. This folder is gitignored.
3. Installs those two workspaces there.

The step is skipped when the vendored copy already matches the CLI version. Pass `--force` to fetch again anyway.

**Local shims (`lib/`)**, installed as `file:` dependencies:

- `lib/mdk-compat`: stands in for `@tetherto/mdk`, the monorepo that the EMCD, SpiderPool and Foundry workers expect as a peer dependency. It re-exports this site's MDK packages (see its README).
- `lib/mdk-crypto-lib`: replaces `crypto-js` through `overrides`, using Node's crypto for the AES and SHA-256 calls that `whatsminer-mdk-worker` makes.

### Gateway apps

Each entry in `spec.apps` runs in its own app runtime, under a Kernel service account `app:<name>`, with its routes under `/apps/<name>/…` unless it sets `mount`. Its `config` is the operator config the app reads.

| App | Source | Mount | What it does |
| --- | --- | --- | --- |
| `site` | `backend/apps/site` (local) | `/` | The site's own API (`/site/…`): overview, history, pools and miner commands for the main UI. `config.defaultPools` is what `POST /site/miners/:deviceId/pools` applies without a body |
| `demo` | `@tetherto/mdk-app-demo` | `/apps/demo` | Aggregates live and historical telemetry across miners |
| `op-center` | `@tetherto/mdk-app-operation-center` | `/apps/op-center` | Operation Center: dashboard, explorer and miner commands. `config.layout` maps the miners into containers and racks |
| `reporting` | `@tetherto/mdk-app-reporting-tool` | `/apps/reporting` | Reporting Tool: hashrate, power, efficiency and pool reports. Reads `config/reporting/site.json` (mining units, the site meter `SATEC-001`, the pool) and `config/reporting/hardware-catalogue.json` (nominal hashrate and power per model) |
| `agent` | `@tetherto/mdk-app-agent` | `/` | Agent chat sessions over the MCP server |

The app packages are installed from Git refs (see `package.json`). To try a local checkout, point the dependency at it with `file:../<repo>` and run `npm install`.

To add an app:

1. Install its package.
2. Run `npm run mdk -- add app <package>`, or add a `spec.apps` entry by hand and run `npm run mdk -- rbac init`.
3. Restart `npm start`.

### UI integration

The site UI (`ui/`, Vite and React, using a hash router) signs in through the Gateway (`passwordAuth`), then shows the site pages and bundles the UI modules of the apps that ship one. Today these are the Operation Center and the Reporting Tool. `ui/src/installedApps.tsx` sets this up:

- It imports each app's `ui/index.js` (built with `defineMdkApp`), its `ui/style.css` and its `package.json` version.
- It validates each module with `checkAppUiModule`, the same check the MDK dashboard runs.
- It mounts each app's pages under `#/app/<name>/…`, inside an `MdkAppProvider`, so the app's API calls go to `/apps/<name>/…`. Each app also runs inside its own error boundary.
- It builds a left-nav group for each app from its routes and sections. The host sets the labels "Operation Center" and "Reporting Tool".

A few settings make the bundling work:

- `ui/vite.config.ts` lists React, React Router, React Query, Chart.js and the `@tetherto` UI packages under `resolve.dedupe`, so the apps share the host's copies instead of bundling their own.
- `ui/src/main.tsx` registers the Chart.js `BarController` and `LineController`, which the Reporting Tool's mixed charts need.
- `ui/src/installedApps.css` hides the Operation Center's own stats strip, because the site header already shows Miners, Hashrate, Consumption and Efficiency.

To show another app's UI, import it in `installedApps.tsx`, add it to `INSTALLED_APPS` and give it an icon in `AppSidebar.tsx`. The `name` must match its `spec.apps` entry. Then rebuild with `npm run build:ui`.

### Lockfiles

Only the root `package-lock.json` is committed. `vendor/mdk-satec/package-lock.json` comes from the MDK release tarball and is replaced on every fetch.

## UI development

With the stack running (`npm start`), start the Vite dev server with hot reload:

```sh
npm run dev:ui
```

Open <http://localhost:3040/>. Requests to `/site`, `/apps` and `/auth` are proxied to the Gateway on port 3000.

## Checks

```sh
npm run typecheck     # TypeScript check of the UI
npm run lint          # standard
npm test              # unit tests
```

## MCP agent tools (optional)

`npm run mcp` serves the apps' routes as MCP tools at `http://127.0.0.1:3101/mcp`. To use them from Claude Code, copy the example config:

```sh
cp .mcp.json.example .mcp.json
```
