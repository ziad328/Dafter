---
name: run-dafter
description: Run, start, stop, smoke-test and screenshot Dafter (API + web + PostgreSQL). Use when asked to run or start the app, check it works in the running app, verify a feature end to end, take a screenshot of a screen in Arabic or English, or stop the dev servers.
---

Dafter runs as `pnpm dev` (PostgreSQL in Docker, NestJS API on :3000 with the worker in-process, Vite web on :5173). Drive it with `.claude/skills/run-dafter/driver.mjs`: API checks with `fetch`, and a real phone-sized browser through `playwright-core` using the installed Chrome or Edge. Paths are relative to the repo root.

Verified on Windows 11 (Git Bash), Node 22, pnpm 11, Docker Desktop 29.

## Prerequisites

- Docker Desktop running (`docker info` works). It does not start on its own after a reboot unless "Start Docker Desktop when you sign in" is on.
- Chrome or Edge installed. Without either: `pnpm exec playwright-core install chromium`.

## Setup

```bash
pnpm install
cp -n .env.example .env
pnpm db:reset
```

`db:reset` starts Postgres, drops everything, migrates and seeds the demo center (local hosts only).

## Run (agent path)

Start the stack in the background (Bash tool `run_in_background: true`), then wait for both ports:

```bash
mkdir -p .shots && pnpm dev > .shots/dev.log 2>&1
```

```bash
timeout 150 bash -c 'until curl -sf http://localhost:3000/health >/dev/null && curl -sf http://localhost:5173 >/dev/null; do sleep 2; done' && echo ready
```

Then drive it:

```bash
node .claude/skills/run-dafter/driver.mjs smoke
```

| command | what it does |
|---|---|
| `status` | Is the API (`/health`) and web up? Exit 1 if not. |
| `smoke` | API: health, Vite proxy, unknown route returns `{"code":"NOT_FOUND"}`. Browser at 375 px: Arabic RTL, no horizontal scroll, switch to English persists across reload, no console errors or failed requests. Screenshots `.shots/smoke-ar.png`, `.shots/smoke-en.png`. Exit 1 on any failure. |
| `shot [route] --locale ar\|en --width 375 --out file.png` | Full-page screenshot of a route (no leading slash: `shot app/groups`; omit for the home page). Prints `lang`, `dir`, status text, overflow and console errors as JSON. |
| `stop` | Kills whatever listens on :3000 and :5173. Postgres keeps running. |

Look at the screenshots (Read the PNG) before declaring a screen done. Extend `smoke` with each new user flow.

Stop:

```bash
node .claude/skills/run-dafter/driver.mjs stop
```

## Run (human path)

`pnpm dev` -> open http://localhost:5173 -> Ctrl-C. On Windows, Ctrl-C can leave Nest/Vite running; use `driver.mjs stop`.

## Test

```bash
pnpm test
```

Lint, format check, typecheck, then Vitest in every package (db tests start a `postgres:17` Testcontainer; Docker must be running). `pnpm i18n:check` and `pnpm contracts:gen` are also part of the workflow.

## Gotchas

- **Stopping `pnpm dev` does not stop the servers on Windows.** Killing the pnpm/turbo process (or the background task) orphans Nest and Vite, which keep serving stale code on :3000/:5173. Always `driver.mjs stop`; `status` tells you if something is still listening.
- **Vite listens on IPv6 `[::1]:5173`.** `netstat -p tcp` (IPv4 only) does not show it; the driver uses plain `netstat -ano`.
- **`VITE_API_URL` must stay empty locally.** The web calls `/api` and `/health` on its own origin and Vite proxies them to :3000. Setting it to `http://localhost:3000` makes the browser call the API cross-origin, and there is no CORS yet.
- **The language comes from `localStorage['dafter.locale']`.** The driver presets it per run (`--locale`); a reused browser profile remembers the last choice.
- **The first page load on a cold Vite cache can log a 404** while Vite optimizes dependencies and reloads. If `smoke` fails only on a 404 right after a dependency change, run it again.
- **Git Bash rewrites arguments that start with `/`** into Windows paths (`/` became `C:/Program Files/Git/` and the browser showed a folder listing). Pass routes without the leading slash; the driver refuses converted paths.
- **A newly opened shell may lack `docker` on PATH** right after installing Docker Desktop; open a new terminal.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm dev`: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine` | Docker Desktop is not running. Start it and wait for `docker info` to succeed. |
| `docker: error getting credentials - docker-credential-desktop not found` | Shell started before Docker was installed; open a new terminal. |
| `status` shows 200 but your change is missing | Orphaned old servers: `driver.mjs stop`, then start again. |
| `No browser found` | Install Chrome, or `pnpm exec playwright-core install chromium`. |
