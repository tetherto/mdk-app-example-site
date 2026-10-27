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

This runs three steps, which you can also run one at a time:

```sh
# 1. Create local config files from the committed *.example templates
#    (config/site.deploy.json, config/devices.json). Existing files are never overwritten.
npm run setup:config

# 2. Install dependencies
npm install

# 3. Build the UI into ui/dist (served by the gateway)
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

## UI development

With the backend running (`npm start`), start the Vite dev server with hot reload:

```sh
npm run dev:ui
```

Open <http://localhost:3040/>. Requests to `/site` are proxied to the gateway on port 3000.

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
