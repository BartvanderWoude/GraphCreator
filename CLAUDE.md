# GraphCreator

## Spec

- [docs/SPEC.md](docs/SPEC.md) is the source of truth: data model, formats, behaviour and the implementation phases (one phase per session and per commit). To continue, implement the next `### Phase N: … [ ]` whose dependencies are done.
- [docs/IDEAS.md](docs/IDEAS.md) lists deferred features. Don't build them unless asked.
- [docs/research.md](docs/research.md) is background research only.

## Git workflow

- **Always commit with the `/anthropic-skills:commit` skill**, on branch `develop`. Do not commit by hand.
- `develop` is the integration branch. All work lands here.
- `production` is the branch for the live production website. Do not commit or push to it directly. `develop` is deployed into `production` by GitHub Actions (CI/CD).
- `main` is not used. Do not commit to it, branch from it, or open PRs against it.
