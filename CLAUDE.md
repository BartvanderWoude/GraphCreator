# GraphCreator

## Git workflow

- **Always commit with the `/anthropic-skills:commit` skill**, on branch `develop`. Do not commit by hand.
- `develop` is the integration branch. All work lands here.
- `production` is the branch for the live production website. Do not commit or push to it directly. `develop` is deployed into `production` by GitHub Actions (CI/CD).
- `main` is not used. Do not commit to it, branch from it, or open PRs against it.
