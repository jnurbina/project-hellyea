# Project HellYea — Game Design Document

**Status:** Local Prototype (Phase 1-2 complete)
**Last Updated:** 2026-04-08

---

## 1. Core Concept

**Elevator Pitch:** Multiplayer browser-based 3D isometric turn-based strategy with RTS resource gathering, survival mechanics, card-based modifiers, and RPG hero units on an octile grid.

**Genre:** Turn-Based Strategy × Survival × Card Game
**Platform:** Browser (desktop)
**Players:** 2-player duels (POC scope)

---

## 2. Implementation Status

### IMPLEMENTED
- [x] 12×12 octile grid with procedural terrain (plains, forest, mountain, water, ruins)
- [x] 4 heroes (2 per player) with full stat system
- [x] Simultaneous planning + SPD-based resolution
- [x] Move action with A* pathfinding
- [x] Attack action with range and damage calculation
- [x] Gather action (1-2 resources, pouch max 5)
- [x] Deposit action (transfer to TC stockpile)
- [x] Town Center building (2 wood + 2 stone, 1 per player)
- [x] Respawn system (requires TC, 1 round delay)
- [x] Resource types: wood, stone, iron, food, water
- [x] Camera controls (pan, rotate, zoom)
- [x] Minimap with FOV tracking
- [x] Full hotkey system

### IMPLEMENTED (Session 2026-04-09+)
- [x] Unit training: Scout (autonomous aggro) + Farmer (controllable gatherer)
- [x] Survival mechanics: daily food/water consumption, starvation debuffs
- [x] Time of Day system: Morn→Noon→Dusk→Night = 1 Day

### NOT YET IMPLEMENTED
- [ ] Card system
- [ ] Fog of War / Line of Sight
- [ ] Additional buildings (Watchtower, Wall, Forge, Farm, Well)
- [ ] Crafting
- [ ] AI NPC
- [ ] Multiplayer (Colyseus)
- [ ] Lobby/Auth

---

## 3. Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 + React 19 + TypeScript |
| Rendering | Three.js via React Three Fiber |
| State | Zustand |
| Styling | Tailwind CSS 4 |
| Multiplayer | Colyseus (planned) |

---

## 4. Game Mechanics

### Turn Structure
Each round has two phases:
1. **Planning Phase**: Both players queue actions simultaneously
2. **Resolution Phase**: Actions execute in SPD order (highest first)

Per hero, one action from each category:
- **Movement**: Move up to MOV tiles
- **Combat**: Attack target in RNG
- **Resource**: Gather OR Deposit (mutually exclusive with move/attack)
- **Build**: Construct building (consumes turn)

### Hero Stats
| Stat | Effect |
|------|--------|
| HP | Hit points (0 = dead) |
| ATK | Base attack damage |
| DEF | Damage reduction |
| MOV | Tiles per turn |
| RNG | Attack range |
| VIS | Line of sight (future) |
| SPD | Turn order priority |

### Win Condition
- Destroy all enemy heroes AND their Town Center
- Heroes respawn if TC exists (1 round delay)
- No TC = permadeath

### Resources
| Resource | Source | Use |
|----------|--------|-----|
| Wood | Forest tiles | Buildings, crafting |
| Stone | Mountain tiles | Buildings, weapons |
| Iron | Mountain (rare) | Advanced gear |
| Food | Plains, Forest | Survival |
| Water | Water-adjacent | Survival |

---

## 5. Buildings

| Building | Cost | Status | Effect |
|----------|------|--------|--------|
| Town Center | 2 wood, 2 stone | IMPLEMENTED | Base, respawn, deposit |
| Watchtower | 3 wood, 2 stone | PLANNED | +3 VIS from tile |
| Wall | 4 stone | PLANNED | Blocks movement/LoS |
| Forge | 5 stone, 3 iron | PLANNED | Advanced crafting |
| Farm | 3 wood | PLANNED | +1 food/day |
| Well | 4 stone | PLANNED | +1 water/day |

---

## 6. Units (PLANNED)

| Unit | Cost | Stats | Role |
|------|------|-------|------|
| Scout | 2 food | Low HP, high MOV/VIS | Exploration, vision |
| Farmer | 3 food, 1 wood | Low HP, can gather | Resource collection |

Units are trained from TC, cost food to sustain, have simplified stats (no leveling).

---

## 7. Survival System (PLANNED)

### Time of Day
- 4 phases per day: Morn → Noon → Dusk → Night
- Each round = 1 TOD phase
- 4 rounds = 1 full day

### Consumption
- End of each day: each hero consumes 1 food + 1 water from TC stockpile
- No food: lose HP per day
- No water: lose HP + reduced MOV

---

## 8. Card System (PLANNED)

### Basics
- Draw 1 card at start of turn
- Play up to 1 card per turn
- Max hand size: 3

### Card Categories
| Category | Examples |
|----------|----------|
| Combat | +ATK, double strike, ranged boost |
| Movement | Teleport, +MOV, swap positions |
| Economy | Double gather, steal resources |
| Buff/Debuff | Heal, poison, shield |
| Environment | Spawn terrain, create wall |

### Deck Structure (TBD)
- Option A: Shared deck (all players draw from same pool)
- Option B: Player-specific decks (pre-built loadouts)
- Current plan: Generic shared deck for POC, hero-specific later

---

## 9. Development Phases

| Phase | Status | Features |
|-------|--------|----------|
| 1. Foundation | COMPLETE | Grid, camera, tiles, basic UI |
| 2. Core Game | ~80% | Turn system, movement, combat, resources, TC |
| 3. Depth | NEXT | Units, survival, cards, more buildings |
| 4. Multiplayer | PLANNED | Colyseus, lobby, auth |
| 5. Polish | PLANNED | FoW, AI NPC, crafting |

---

## 10. Original Design Decisions (2026-04-04)

*These are J's original answers preserved for reference. Some have been modified during implementation.*

1. **Game Name:** Project HellYea
2. **Player Count:** 2-player duels for POC
3. **Card Deck:** Originally hero-specific; now generic shared for POC
4. **Art Style:** Low-poly 3D, silhouetted aesthetic
5. **Hero Count:** Each player picks 2 heroes ✓
6. **Map Size:** Originally 20×20; changed to 12×12 for POC
7. **Turn System:** Simultaneous planning, SPD-based resolution ✓
8. **Win Condition:** Destroy heroes + TC; respawn if TC exists ✓

### Revised Decisions (Implementation)
- Map size: 12×12 (better for 2v2 heroes)
- Card system: Generic first, hero-specific later
- Buildings: TC only for now, others planned
- FoW/LoS: Disabled for prototype, re-enable later
- Units: Scout + Farmer as first trainable units
- Survival: TOD system (4 rounds = 1 day)

---

## 11. Future Considerations

### AI Wildcard NPC
- Roaming hostile that attacks nearest player
- Acts after all player turns
- Drops loot, respawns elsewhere

### Map Variants
- Standard: 12×12 square
- Narrow: 6×18 corridor
- Diamond: rotated square with chokepoints

### Multiplayer Scaling
- 4-player free-for-all
- 2v2 team mode
- Spectator mode

---

*This document is updated after major milestones. See HANDOFF.md for session-by-session changes.*
