@AGENTS.md

# JURB Project - Claude Instructions

## Project Overview
**Project HellYea** - Turn-based strategy game with simultaneous planning + SPD-based resolution. 12x12 octile grid, 2 players, 2 heroes each. Browser-based (Next.js + Three.js).

---

## Key File Locations

| File | Purpose |
|------|---------|
| `src/lib/game-store.ts` | Zustand state store, ALL game logic (~1200 lines) |
| `src/lib/types.ts` | TypeScript interfaces (Hero, Tile, Building, Player, etc.) |
| `src/lib/grid.ts` | A* pathfinding, procedural map generation, octile distance |
| `src/components/game/GameBoard.tsx` | Three.js canvas, camera, 3D scene, ActionToolbar |
| `src/components/game/GameHUD.tsx` | All HUD overlays, panels, modals, hotkey handlers |
| `src/components/game/Minimap.tsx` | Minimap with FOV box, click-to-navigate |
| `src/components/game/InventoryPanel.tsx` | Hero inventory/pouch modal |
| `src/components/game/OctileTile.tsx` | Individual tile 3D mesh |
| `src/app/page.tsx` | Main page, game initialization |
| `public/GAME_DESIGN_DOC.md` | Full game design document |
| `HANDOFF.md` | Session progress, todos, change logs |

---

## Architecture & Paradigms

### State Management
- **Zustand** single store pattern - all game state in `game-store.ts`
- Components subscribe via `useGameStore(s => s.field)`
- Mutations via `set()` after `cloneGameState()` for immutability
- No Redux, no context providers for game state

### Turn System
1. **Planning Phase**: Player 1 queues actions → Player 2 queues actions
2. **Resolution Phase**: Actions execute by SPD (highest first)
3. Action execution order per hero: Move → Attack → Gather/Deposit
4. Attack range calculated from **move destination** if move is queued

### Rendering
- **React Three Fiber** (R3F) for declarative Three.js
- **OrthographicCamera** for isometric view
- **drei** helpers: `Html`, `Edges`, `OrthographicCamera`
- HTML overlays via `<Html>` for UI anchored to 3D positions

### Code Patterns
- Actions are "queued" during planning, "executed" during resolution
- `QueuedAction` interface tracks: movePath, attackTarget, gatherTile, depositTile, builtTC
- Double-click to confirm actions (first click = pending, second = confirm)

### Action Combo Rules
- **Deposit** locks out ALL other actions (move/attack/gather)
- **Gather** and **Attack** are mutually exclusive
- **Move** can combine with Gather OR Attack
- Resolution order depends on position:
  - Gather at **current position** → executes BEFORE move
  - Gather at **move destination** → executes AFTER move
  - Same logic applies to Attack (attack-first vs move-first via `actionOrder`)

### Animation System
- `moveAnimation.heroId` is used for heroes, scouts, AND farmers (legacy naming)
- Must filter units from normal rendering when `moveAnimation.heroId === unit.id`
- `AnimatedHero` component handles all unit types despite the name
- Check both `findHero()` and `findUnit()` when resolving animated entity

### Unit Type Differences
| Unit | Respawn | Pouch Max | Gather Rate | Control |
|------|---------|-----------|-------------|---------|
| Hero | At TC (2 turns) | 8 | 1-2 | Player |
| Farmer | Permadeath | 16 | 2-3 | Player |
| Scout | Permadeath | 0 | N/A | Autonomous AI |

---

## Current Game Mechanics

### Actions (per hero per turn)
- **Move**: A* pathfinding, truncated to MOV stat
- **Attack**: Range-based, damage = ATK - DEF (min 1)
- **Gather**: On resource tile, 1-2 resources per action, pouch max 5
- **Deposit**: Adjacent to TC, transfers pouch to player stockpile
- **Build TC**: Costs 2 wood + 2 stone from pouch, consumes turn action

### Resources
- Types: wood, stone, iron, food, water
- Heroes carry resources in pouch (max 5 total, multi-type)
- Starting: 0 wood/stone/iron, 15 food/water per player
- Wood/stone tiles spawn near starting positions

### Town Center
- One per player limit
- Build via Build modal (B key), adjacent tile placement
- Required for: respawn, deposit
- Respawn: 1 round delay after death, adjacent to TC

### Movement Costs
- Base: 1 for all terrain
- Mountain ascension: +2 (only when entering mountain from non-mountain)
- Water: impassable

---

## Hotkeys

| Key | Action |
|-----|--------|
| M | Move mode |
| T | Attack mode |
| G | Gather mode (press twice to confirm) |
| I | Inventory modal |
| B | Build modal |
| Tab | Cycle through unqueued units |
| Space | End turn / Confirm |
| Escape | Cancel / Close modals |
| ` | Debug overlay toggle |
| WASD | Camera pan |
| QE | Camera rotate |
| Scroll | Camera zoom |

---

## Claude Instructions

### Before Editing
- Always read files before editing
- Run `npm run build` after changes to verify compilation
- Update HANDOFF.md with session changes

### Code Style
- TypeScript strict mode
- Functional components with hooks
- No class components
- Zustand for state, not useState for game logic
- Keep game logic in game-store.ts, not in components

### Avoid
- Creating new files unless necessary (prefer editing existing)
- Adding comments unless requested
- Over-engineering or adding unrequested features
- Generating documentation unless asked

### Testing Changes
- `npm run dev` for dev server
- `npm run build` for production build verification
- `npm run lint` for linting
