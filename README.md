# Linkr

> **Connect privately. Talk freely.**
> A privacy-first, real-time, end-to-end encrypted messaging platform (MERN + TypeScript).

This repository is a **pnpm-workspace monorepo**. See [`projectlinkr.md`](./projectlinkr.md) for the full product blueprint and [`project.md`](./project.md) for **progress, what's built, and what's next**.

## Monorepo layout

```
linkr/
├── shared/   @linkr/shared  — TS types, Zod schemas, socket event constants (shared by client + server)
├── server/   @linkr/server  — Express + Socket.IO + Mongoose API (route → controller → service → model)
└── client/   @linkr/client  — React + Vite + TypeScript web app (Tailwind + 6-theme system + 3-pane AppShell)
```

## Prerequisites

- **Node.js** ≥ 20 (tested on v24)
- **pnpm** ≥ 9 (tested on 11.8)

## Setup

```bash
# 1. Install all workspace dependencies (from the repo root)
pnpm install

# 2. Create your local env file (never committed)
cp .env.example .env       # Windows PowerShell: Copy-Item .env.example .env
```

> Sprint 0 boots **without** MongoDB / Redis / Google credentials — those connections degrade
> gracefully with a warning. Fill `.env` before Sprint 1 (auth) to enable real persistence.

## Run (development)

```bash
pnpm dev
```

This runs the server and client in parallel:

| Service | URL                     | Notes                                  |
|---------|-------------------------|----------------------------------------|
| Client  | http://localhost:5173   | Vite dev server with live preview/HMR  |
| Server  | http://localhost:5000   | Express API + Socket.IO (`tsx watch`)  |

Health check: `GET http://localhost:5000/health` → `{ "status": "ok", ... }`

Run a single side if you prefer:

```bash
pnpm dev:server   # API only
pnpm dev:client   # web app only
```

## Useful scripts

```bash
pnpm typecheck    # tsc --noEmit across all packages
pnpm build        # build shared → server → client
```

## Theme system

Six themes (each with light + dark), driven entirely by CSS variables:
**Iris** (default), **Emerald**, **Ocean**, **Sunset**, **Rose**, **Midnight**.
Switching a theme swaps the variable set on `<html>` (zero component changes) and persists to `localStorage`.
Cycle themes / toggle light–dark from the AppShell header.

## Before Sprint 1

Fill in `.env` (see `.env.example`). Minimum to start Sprint 1 (auth + onboarding):

- `MONGODB_URI` — MongoDB Atlas connection string
- `REDIS_URL` — Redis (Upstash free or local) for presence + Socket.IO adapter
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — strong random secrets
- `VITE_GOOGLE_CLIENT_ID` — client-side Google OAuth client id
