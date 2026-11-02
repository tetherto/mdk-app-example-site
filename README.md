# mdk-app-example-site

Example MDK mining site: a gateway, kernel and miner/pool workers (with mock devices) run under PM2, plus a React UI served by the gateway.

## Prerequisites

- Node.js **24+** (`node -v`)
- npm
- [PM2](https://pm2.keymetrics.io/) installed globally: `npm install -g pm2`
- Git access to GitHub (several workers are installed from Git repositories)

## Setup

```sh
npm run setup
```

This runs four steps, which you can also run one at a time:

```sh
# 1. Create local config files from the committed *.example templates
#    (config/site.deploy.json, config/devices.json). Existing files are never overwritten.
npm run setup:config

# 2. Install dependencies
npm install

# 3. Fetch the SATEC power-meter worker into vendor/mdk-satec (see Dependencies)
npm run setup:satec

# 4. Build the UI into ui/dist (served by the gateway)
npm run build:ui
```

Edit `config/site.deploy.json` to change ports, pools or which PM2 roles run, and `config/devices.json` to change the miners.

## Run

```sh
npm start
```

This generates `deploy/ecosystem.config.js` from `config/site.deploy.json` and starts every role (mocks, kernel, workers, site app, gateway, MCP) as a PM2 process. It then waits for the site to respond (usually around 10 seconds) and prints the URL to open, <http://localhost:3000/>.

Useful commands:

```sh
pm2 list              # process status
pm2 logs              # tail logs from all processes
npm run stop:pm2      # stop and remove all site processes
```

Runtime data is written to `.site-data/`.

## Dependencies and how they are integrated

Everything is wired together from `config/site.deploy.json`. Each entry in `pm2.roles` becomes one PM2 process running `deploy/run-process.js --role <role>`.

### MDK platform (npm, `0.13.0`)

| Package | Used for |
| --- | --- |
| `@tetherto/mdk-kernel`, `@tetherto/mdk-core` | Kernel role: device registry, access policy, local discovery through `.site-data/` |
| `@tetherto/mdk-worker` | Base for the miner, pool and power-meter workers |
| `@tetherto/mdk-gateway` | HTTP gateway on port 3000. Serves the UI from `ui/dist` and each app's routes |
| `@tetherto/mdk-app-runtime` | Runs each gateway app in its own `app-<name>` process |
| `@tetherto/mdk-identity`, `@tetherto/mdk-rbac` | Keypairs, and the Kernel service account and grant `app:<name>` for each app |
| `@tetherto/mdk-client` | Kernel RPC client used by the site MCP plugin (`backend/mcp-plugins/site`) |
| `@tetherto/mdk-mcp` | `mcp` role: exposes the apps' routes as MCP tools (see below) |
| `@tetherto/mdk-ui-foundation`, `@tetherto/mdk-react-adapter`, `@tetherto/mdk-react-devkit` | UI building blocks, and hosting the apps' UI modules |

### Device workers and mocks

Third-party workers are installed from Git, each pinned to a commit. A worker adapter in `backend/adapters/` or a role function in `backend/site.js` starts each one. Each worker has a matching `mocks-*` role that runs the vendor's bundled mock server, so no real hardware is needed. The devices themselves are listed in `config/devices.json`.

| Dependency | Kind | Roles |
| --- | --- | --- |
| `whatsminer-mdk-worker` | Miner (WhatsMiner) | `mocks`, `worker` |
| `antminer-mdk-worker` | Miner (Antminer) | `mocks-antminer`, `worker-antminer` |
| `sealminer-mdk-worker` | Miner (SealMiner) | `mocks-sealminer`, `worker-sealminer` |
| `ocean-mdk-worker` | Pool (OCEAN) | `mocks-ocean`, `worker-ocean` |
| `emcd-mdk-worker`, `spiderpool-mdk-worker`, `foundry-mdk-worker` | Pools | `mocks-<pool>`, `worker-<pool>` |
| `@tetherto/mdk-worker-satec` (vendored, see below) | Power meter (SATEC PM180, device `SATEC-001`) | `mocks-satec`, `worker-satec` |

**SATEC power meter.** The SATEC worker lives in a subfolder of the [tetherto/mdk](https://github.com/tetherto/mdk) monorepo. It isn't published to npm, and it requires files outside its own folder, so it can't be a `package.json` dependency. Instead, `npm run setup:satec` (`deploy/fetch-satec.js`) does the following:

1. Downloads the tetherto/mdk release tarball whose tag matches the installed `@tetherto/mdk-core` version.
2. Extracts the worker and the paths it needs (`backend/core`, `backend/workers/mock`, the root `package.json` and `package-lock.json`) into `vendor/mdk-satec/`. This folder is gitignored.
3. Installs that workspace there.

The step is skipped when the vendored copy already matches the installed MDK version. Pass `--force` to fetch again anyway. If the copy is missing, the SATEC roles fail with `ERR_SATEC_MISSING`. The mock meter listens from port 18020 (`satec.mocks.portBase`).

**Local shims (`lib/`)**, installed as `file:` dependencies:

- `lib/mdk-compat`: stands in for `@tetherto/mdk`, the monorepo that the emcd, spiderpool and foundry workers expect as a peer dependency. It re-exports this site's MDK packages (see its README).
- `lib/mdk-crypto-lib`: replaces `crypto-js` through `overrides`, using Node's crypto for the AES and SHA-256 calls that `whatsminer-mdk-worker` makes.

### Gateway apps

Apps are listed in `gateway.pluginDirs` (resolved by `deploy/apps.js`). Each app gets the following:

- its own `app-<name>` PM2 role, which must also be listed in `pm2.roles`;
- a Kernel service account `app:<name>`;
- its routes under `/apps/<name>/…`, unless it sets `mount`;
- an operator config from the entry's `config`.

| Entry | Source | Mount | What it does |
| --- | --- | --- | --- |
| `site` | `backend/apps/site` (local) | `/` | The site's own API (`/site/…`): overview, containers, history and pools for the main UI |
| `demo` | `@tetherto/mdk-app-demo` | `/apps/demo` | Aggregates live and historical telemetry across miners |
| `op-center` | `@tetherto/mdk-app-operation-center` | `/apps/op-center` | Operation Center: dashboard, explorer and miner commands. `config.layout` maps the miners into containers and racks |
| `reporting` | `@tetherto/mdk-app-reporting-tool` | `/apps/reporting` | Reporting Tool: hashrate, power, efficiency and pool reports. Reads `config/reporting/site.json` (mining units, the site meter `SATEC-001`, the pool) and `config/reporting/hardware-catalogue.json` (nominal hashrate and power per model) |
| `agent` | `@tetherto/mdk-app-agent` | `/` | Agent chat sessions. `mcp: false` keeps its routes off the MCP tool list |

The app packages are installed from Git refs (see `package.json`). To try a local checkout, point the dependency at it with `file:../<repo>` and run `npm install`.

To add an app:

1. Install its package.
2. Add a `gateway.pluginDirs` entry.
3. Add `app-<name>` to `pm2.roles`.
4. Run `npm start`.

### UI integration

The site UI (`ui/`, Vite and React, using a hash router) bundles the UI modules of the apps that ship one. Today these are the Operation Center and the Reporting Tool. `ui/src/installedApps.tsx` sets this up:

- It imports each app's `ui/index.js` (built with `defineMdkApp`), its `ui/style.css` and its `package.json` version.
- It validates each module with `checkAppUiModule`, the same check the MDK dashboard runs.
- It mounts each app's pages under `#/app/<name>/…`, inside an `MdkAppProvider`, so the app's API calls go to `/apps/<name>/…`. Each app also runs inside its own error boundary.
- It builds a left-nav group for each app from its routes and sections. The host sets the labels "Operation Center" and "Reporting Tool".

A few settings make the bundling work:

- `ui/vite.config.ts` lists React, React Router, React Query, Chart.js and the `@tetherto` UI packages under `resolve.dedupe`, so the apps share the host's copies instead of bundling their own.
- `ui/src/main.tsx` registers the Chart.js `BarController` and `LineController`, which the Reporting Tool's mixed charts need.
- `ui/src/installedApps.css` hides the Operation Center's own stats strip, because the site header already shows Miners, Hashrate, Consumption and Efficiency.

To show another app's UI, import it in `installedApps.tsx`, add it to `INSTALLED_APPS` and give it an icon in `AppSidebar.tsx`. The `name` must match its `gateway.pluginDirs` entry. Then rebuild with `npm run build:ui`.

### Lockfiles

Only the root `package-lock.json` is committed. `vendor/mdk-satec/package-lock.json` comes from the MDK release tarball and is replaced on every fetch.

## UI development

With the backend running (`npm start`), start the Vite dev server with hot reload:

```sh
npm run dev:ui
```

Open <http://localhost:3040/>. Requests to `/site` and `/apps` are proxied to the gateway on port 3000.

## Checks

```sh
npm run typecheck     # TypeScript check of the UI
npm run lint          # standard
npm test              # unit tests
```

The agent tool-contract checks in `tests/unit/site-tools-*.test.js` need the MDK repository's private agent package, so they are skipped by default. To run them, point `MDK_REPO` at an MDK checkout:

```sh
MDK_REPO=../mdk npm test
```

## MCP agent tools (optional)

The `mcp` role serves site tools at `http://127.0.0.1:3101/mcp`. To use them from Claude Code, copy the example config:

```sh
cp .mcp.json.example .mcp.json
```
