# Workflow

## Git and GitHub

- Work is tracked in GitHub issues. Umbrella issues group related work.
- Branch as `<type>/issue-<n>-<topic>`, e.g. `fix/issue-64-camera-zoom`.
- Use conventional commits (`fix(camera): …`, `docs: …`) and reference the
  issue in the PR.
- CI (`.github/workflows/ci.yml`) runs the four checks plus `git diff --check`
  on every PR and every push to `main`. A `v*` tag deploys to GitHub Pages.

## Docs

- **Docs change with the code.** Update the matching doc in the same PR as
  the code it describes.
- **Drift is a finding.** In reviews and audits, flag any place where code and
  docs disagree. Then fix whichever is wrong: the code if it broke an
  intended rule, the doc if it's stale.
- **Where docs live:**
  - `README.md`: players and first-time readers
  - `AGENTS.md` and `docs/agents/`: contributor and agent guidance
  - `docs/game-design.md`: intended gameplay
  - `docs/archive/`: finished design notes
- Put design notes for larger changes under `docs/`. Once the work ships,
  move them to `docs/archive/`.
