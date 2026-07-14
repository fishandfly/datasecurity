# Repository Guidelines

## Project Structure & Module Organization

The React and TypeScript application lives in `src/`. Screens are in `src/pages/`, reusable UI in `src/components/`, domain logic in `src/lib/`, and feature routes in `src/modules/`. Static images belong in `src/assets/`; shared styling is in `src/index.css`.

Runtime adapters are isolated in `security-runtime-service/`. Container, proxy, database, and environment files live in `docker/`. Operational scripts are in `scripts/`; requirements and acceptance cases are under `docs/`. Treat `dist/`, `node_modules/`, `docker/storage/`, and `tmp/` as generated or local-only.

## Build, Test, and Development Commands

- `npm run dev`: start Vite on all interfaces for local development.
- `npm run typecheck`: run TypeScript project checks without producing a bundle.
- `npm run build`: type-check and create the production bundle in `dist/`.
- `npm test`: run all `src/**/*.test.mjs` tests with Node's test runner.
- `docker compose -f docker/docker-compose.yml up -d --build frontend`: rebuild the Docker-served frontend at `http://localhost:5173/data-catalog/`.

Use the Node version compatible with Vite 6 and install dependencies from the committed lockfile with `npm ci`.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, and no semicolons, matching existing TypeScript. Name React components and exported types in PascalCase, hooks with `use...`, and files in kebab-case (for example, `security-dashboard-page.tsx`). Keep page orchestration in pages and move API/data transformations into `src/lib/`. Prefer existing UI primitives, Lucide icons, and CSS variables over one-off markup or colors. User-facing screens must not expose infrastructure product names, credentials, internal URLs, or mock operational data.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`; name them `*.test.mjs` beside the code they protect. Add focused regression tests for routing, data mapping, and UI contracts. Run `npm run build` plus relevant tests before submission. For visible changes, verify authenticated desktop and mobile states with browser automation and capture screenshots when layout is material.

## Commit & Pull Request Guidelines

History is minimal and uses concise Chinese summaries. Keep commits imperative and scoped, such as `修复接入日志详情抽屉`. Pull requests should describe behavior and data-model impact, list verification commands, link the requirement or test case, and include before/after screenshots for UI changes. Do not commit `.env`, secrets, database dumps, generated bundles, or unrelated workspace changes.

## Security & Data Rules

Use `docker/.env.example` as the configuration template. Persist secrets only through environment variables or secret references. Dashboard metrics, logs, labels, and resource records must come from real backend APIs; empty and error states are preferable to fabricated fallback data.
