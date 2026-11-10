# GraphCreator

## Spec

- [docs/SPEC.md](docs/SPEC.md) is the source of truth: data model, formats, behaviour and the implementation plan. Phases are grouped into waves (section 8, task graph): "run the next wave" builds every phase of the next `### Wave N: … [ ]` with parallel sub agents (one squashed commit per phase); "execute the next phase" builds a single `#### Phase N: … [ ]` whose dependencies are done. Find status with `grep -n "^### Wave\|^#### Phase" docs/SPEC.md`.
- [docs/IDEAS.md](docs/IDEAS.md) lists deferred features. Don't build them unless asked.
- [docs/research.md](docs/research.md) is background research only.

## Rules

- `src/model/` is pure TypeScript: no React, Zustand, `@xyflow/react` or DOM imports.
- No backend. The app is static files; graphs are never sent to a server.
- MIT licence. No GPL code (in particular not DAGitty's `jslib`); write algorithms here.

## Commands

- `npm run dev`: Vite dev server on http://localhost:5173.
- `npm run build`: typecheck and production build into `dist/`.
- `npm run preview`: serve the production build.
- `npm run typecheck`: `tsc -b` (also run by the Stop hook in `.claude/settings.json`).
- `npm run lint`: oxlint.
- `npm test`: Vitest unit tests (`src/**/*.test.ts`), once. `npm run test:watch` for watch mode.
- `npm run test:e2e`: Playwright tests in `e2e/` (Chromium; builds and serves on port 4173). First run needs `npx playwright install chromium`.
- `npm run format`: Prettier on the whole repo.
- shadcn/ui components: `npx shadcn@latest add <name>` (they land in `src/components/ui/`).

## Git workflow

- **Always ask the user before committing to `develop`**, every time, and wait for a clear yes. This includes commits made while landing a wave (squashed phase commits) or by sub agents' work being landed.
- **Always commit with the `/anthropic-skills:commit` skill**, on branch `develop`. Do not commit by hand.
- `develop` is the integration branch. All work lands here.
- `production` is the branch for the live production website (GitHub Pages). Do not commit or push to it directly. The user releases by squash-merging a pull request from `develop` into `production`; GitHub Actions then deploys `production` and adds a "Record production release on develop" merge commit to `develop` (pull before committing). Don't open or merge that pull request unless asked.
- `main` is not used. Do not commit to it, branch from it, or open PRs against it.
