# Pixel Dwarves Digging

An autonomous, side-on pixel excavation sim. Set colony directives and watch
dwarves dig out, haul and stockpile a 160 × 80 block world. Built with
React 19, TypeScript 7, Vite and React Three Fiber.

## Run it

    npm install
    npm run dev

## Play

The colony runs itself at 10 ticks per second. Drag to pan and scroll to zoom
the terrain; the camera follows active dwarves until you move it.

- **Bottom bar:** pause, speed (1×/2×/4×), and directives for work, building,
  hauling and material priority.
- **Inspector:** colony and storage status (Colony tab), plus prestige and
  permanent upgrades (Upgrades tab).
- **Settings (⚙):** save, export/import a JSON save, new run (keeps upgrades),
  reset everything, and toggle the follow camera.

Clear every mineable block for a full prestige, or find a relic for a smaller
early reset. See [docs/game-design.md](docs/game-design.md) for the full rules.

## Develop

    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build

CI runs all four on every pull request and every push to `main`. Pushing a
`v*` tag deploys to GitHub Pages after the same checks pass.

Contributor and coding-agent guidance starts at [AGENTS.md](AGENTS.md).
