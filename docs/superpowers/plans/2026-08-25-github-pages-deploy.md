# GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy tagged `v*` builds to the repository’s GitHub Pages URL with correct asset paths while preserving root-path local development.

**Architecture:** Vite will select `/pixel-dwarves-digging/` only when `GITHUB_ACTIONS=true`; all local dev/build commands will retain `/`. A single GitHub Actions workflow will validate and build pushed version tags, upload `dist` as a Pages artifact, and deploy it with the official Pages actions.

**Tech Stack:** Vite 8, npm/package-lock, Vitest, GitHub Actions Pages (`configure-pages`, `upload-pages-artifact`, `deploy-pages`).

---

### Task 1: Configure the Vite Pages base path

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add an environment-aware base setting**

Update `vite.config.ts` so the exported Vite config includes:

```ts
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  base: isGitHubPagesBuild ? '/pixel-dwarves-digging/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
})
```

This keeps local development at `http://localhost:5173/` and makes Actions-built asset URLs resolve under `/pixel-dwarves-digging/`.

- [ ] **Step 2: Verify both base-path modes**

Run:

```bash
rm -rf dist
npm run build
rg -n 'src="/assets/|href="/assets/' dist/index.html
rm -rf dist
GITHUB_ACTIONS=true npm run build
rg -n 'src="/pixel-dwarves-digging/assets/|href="/pixel-dwarves-digging/assets/' dist/index.html
```

Expected: the first build contains root `/assets/` URLs; the Actions-style build contains `/pixel-dwarves-digging/assets/` URLs.

- [ ] **Step 3: Commit the Vite configuration**

```bash
git add vite.config.ts
git commit -m "fix: configure Vite base path for Pages"
```

### Task 2: Add the tag-triggered GitHub Pages workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Add the workflow with tag filtering and least-required permissions**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      contents: read
      pages: write
      id-token: write
    runs-on: ubuntu-latest
    steps:
      - name: Check out tagged source
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --run

      - name: Build site
        run: npm run build

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

The tag push makes `GITHUB_ACTIONS=true` available to the Vite build, so the workflow automatically emits repository-prefixed asset URLs.

- [ ] **Step 2: Validate workflow syntax and repository checks locally**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all tests, typecheck, lint, build, and whitespace checks pass. Confirm the workflow’s tag trigger, permissions, artifact path, and deployment action by reviewing the YAML after formatting/checks.

- [ ] **Step 3: Commit the deployment workflow**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: deploy tagged builds to GitHub Pages"
```

### Task 3: Final verification and handoff

**Files:**
- Verify: `vite.config.ts`
- Verify: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Inspect the final changes**

Run:

```bash
git diff HEAD~2..HEAD --check
git status --short --branch
git log -2 --oneline
```

Expected: only the Pages configuration, workflow, and their design/plan documentation are present; the working tree is clean.

- [ ] **Step 2: Report the release trigger and URL**

Document that pushing a tag such as `v0.1.0` triggers the workflow and publishes to:

`https://deadronos.github.io/pixel-dwarves-digging/`
