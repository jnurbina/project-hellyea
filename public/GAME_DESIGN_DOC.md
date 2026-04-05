# 🎮 Project HellYea — Game Design Document

**Status:** Pre-production → Local Prototype  
**Author:** Trinity + J  
**Date:** 2026-04-04  
**Repo:** `project-hellyea` (TBD)  

---

## 1. Core Concept

**Elevator Pitch:** A multiplayer browser-based 3D isometric turn-based battle royale with RTS resource gathering, survival mechanics (food/water/crafting), card-based modifiers, and RPG hero units on an octagonal tile grid. Last player standing wins.

**Genre Mashup:** Turn-Based Strategy × Survival × Card Game × Battle Royale  
**Platform:** Browser (desktop priority, mobile stretch goal)  
**Players:** 2-player duels (POC scope, expand later)  
**Target URL:** `onejas.one/<gameName>`

---

## 2. Recommended Tech Stack

### Frontend
| Layer | Tech | Why |
|-------|------|-----|
| **Rendering** | Three.js (WebGL2, WebGPU fallback) | You already know it from onejas.one. InstancedMesh for tile grid performance. OrthographicCamera for true isometric. |
| **UI Framework** | React + Tailwind | Same stack as glass-portfolio. HUD, menus, lobby, inventory all in React overlays on the Three.js canvas. |
| **Language** | TypeScript | Shared types between client and server. Non-negotiable for a project this complex. |
| **State Management** | Zustand or Jotai | Lightweight, no Redux boilerplate. Game state from server, UI state local. |

### Networking & Backend
| Layer | Tech | Why |
|-------|------|-----|
| **Game Server** | **Colyseus** (Node.js) | Purpose-built for authoritative multiplayer. Auto state sync via schema definitions — ideal for turn-based. TypeScript native. Free self-host, $15/mo managed cloud. Actively maintained (v0.16, 1.0 coming 2026). |
| **Auth & Accounts** | **Convex** (already in glass-portfolio) or Clerk | You've already got Convex wired up. Could extend it or use Clerk for simpler auth. |
| **Database** | Convex (player profiles, match history) + Redis (game session state, matchmaking queue) | Convex for persistent data, Redis for ephemeral game state caching. |
| **Deployment** | Vercel (frontend) + Railway/Fly.io (Colyseus server) | Vercel for the Next.js app. Colyseus needs a persistent WebSocket server — can't run on serverless. Railway or Fly.io are cheap and support WebSocket servers well. |

### Why Colyseus over Nakama?
- **Native Node.js/TypeScript** — Nakama's core is Go (TS is a runtime layer on top)
- **Simpler mental model** — schema-based state sync is perfect for turn-based
- **Lighter weight** — you don't need Nakama's social features, leaderboards etc. right now
- **Same ecosystem** — stays in the JS/TS world you're already in

---

## 3. Game World

### Tile Grid
- **Tile Shape:** Octagonal (octagons + small square fillers for tessellation)
- **Grid Size:** TBD — suggest starting with 15×15 for 2-player, scaling up for more players
- **3D Implementation:** InstancedMesh for tiles, custom BufferGeometry for octagon shape
- **Terrain Types:** Plains, Forest, Mountain, Water, Ruins (each affects movement cost, LoS, resources)
- **Map Generation:** Procedural via noise functions (Perlin/Simplex), seeded per match for fairness

### Camera
- OrthographicCamera at ~60° angle for true isometric view
- Pan/zoom controls (drag + scroll wheel)
- Camera follows active player's hero on their turn

### Fog of War
- **GPU-based:** DataTexture visibility map, sampled in tile fragment shaders
- **Three states per tile:** Unexplored (black) → Explored but not visible (dimmed/grayscale) → Currently visible (full color)
- **Updates on:** Hero movement, building placement, card effects

### Line of Sight
- Shadowcasting algorithm adapted for octagonal grid
- Terrain blocks LoS (mountains block, forests reduce range)
- Hero LoS range is a stat (can be upgraded)
- **Red Blob Games** hex/grid algorithms as reference (adapted for oct grid)

---

## 4. Core Mechanics

### Turn Structure
Each player's turn consists of **3 action phases** (in any order):

1. **Move** — Move hero unit up to movement stat in tiles
2. **Attack** — Attack an adjacent enemy hero/unit/building (if in range)
3. **Settlement Action** — ONE of:
   - Build a building (costs resources)
   - Train a unit (costs resources)
   - Upgrade a hero stat
   - Craft an item

Plus: **Card Draw** — At the start of each turn, draw 1 card. May play 1 card per turn. Max 3 cards in hand.

### Win Condition
- Eliminate all other players' hero units
- Hero dies = eliminated (no respawn)

---

## 5. Hero System (RPG Layer)

### Hero Selection
- Pre-match hero selection screen
- Each hero has a **predetermined name and lore**
- Different heroes have different **base stats and a unique passive ability**

### Stats
| Stat | Effect |
|------|--------|
| **HP** | Hit points. Zero = dead. |
| **ATK** | Base attack damage |
| **DEF** | Damage reduction |
| **MOV** | Tiles per turn movement |
| **RNG** | Attack range (tiles) |
| **VIS** | Line of sight range |
| **SPD** | Turn order priority (for simultaneous turn resolution) |

### Leveling
- Gain XP from: killing units, destroying buildings, exploring tiles, gathering resources
- Level up → choose 1 stat to increase OR unlock a skill

### Inventory & Gear
- **6 gear slots:** Weapon, Armor, Helm, Boots, Accessory 1, Accessory 2
- Gear is crafted from resources or found in Ruins tiles
- Gear modifies stats (e.g., Iron Sword: +3 ATK)

---

## 6. Resource & Survival Systems

### Resources
| Resource | Found In | Used For |
|----------|----------|----------|
| **Wood** | Forest tiles | Buildings, basic crafting |
| **Stone** | Mountain tiles | Buildings, walls, weapons |
| **Iron** | Mountain tiles (rare) | Advanced weapons, armor |
| **Food** | Plains, Forest | Sustaining hero, training units |
| **Water** | Water-adjacent tiles | Sustaining hero, some crafting |

### Survival
- Hero consumes **1 Food + 1 Water per turn**
- If hero has no food: loses 1 HP/turn
- If hero has no water: loses 2 HP/turn and -1 MOV
- Creates urgency to explore and gather, not just turtle

### Crafting
- Simple recipe system: `Wood + Iron = Iron Sword`, etc.
- Crafting is a settlement action (uses your turn's settlement phase)

---

## 7. Card System

### Draw & Hand
- Draw 1 card at the start of each turn
- Play up to 1 card per turn
- Max hand size: 3 (must discard if over)

### Card Categories (brainstorm)
| Category | Examples |
|----------|---------|
| **Combat** | +3 ATK this turn, Double strike, Ranged attack |
| **Movement** | Teleport 3 tiles, +2 MOV this turn, Swap positions |
| **Environment** | Spawn forest tile, Create wall, Flood area |
| **Buff/Debuff** | Heal 5 HP, Poison enemy (-1 HP/turn for 3 turns), Shield |
| **Economy** | Double resource gather, Steal 2 resources from enemy |
| **Vision** | Reveal 5-tile radius, Place scout ward, Temporary full map reveal |
| **Wild** | Copy last played card, Draw 2 cards, Force enemy discard |

### Card Deck
- Shared deck per match (all players draw from same pool)
- Or: each hero has a unique deck? (design decision needed)

---

## 8. Buildings & Units

### Buildings (built on tiles you control)
| Building | Cost | Effect |
|----------|------|--------|
| **Camp** | 5 Wood | Base of operations. Required for other buildings. |
| **Watchtower** | 3 Wood, 2 Stone | +3 VIS range from this tile |
| **Wall** | 4 Stone | Blocks movement, blocks LoS |
| **Forge** | 5 Stone, 3 Iron | Enables advanced crafting |
| **Farm** | 3 Wood | +1 Food per turn |
| **Well** | 4 Stone | +1 Water per turn |

### Units (trained from Camp)
- Basic Scout: cheap, fast, extends vision
- Militia: moderate HP/ATK, guards tiles
- Units have simplified stats (no leveling)
- Units can be commanded but cost Food to sustain

---

## 9. AI Wildcard NPC

- **Roaming AI-controlled hostile NPC** on the map
- Random pathing with aggro range — attacks nearest player unit/hero
- Spawns at random location, wanders
- Acts after all players' turns (its own "turn")
- Purpose: disruption, prevents camping, adds chaos
- Could drop loot on death, but respawns elsewhere after X turns

---

## 10. Multiplayer Infrastructure

### Lobby System
- Player creates account (Convex auth or Clerk)
- Lobby shows: online players, open servers/rooms, player stats
- Host can create a room with settings: map size, player count, turn timer
- Players join rooms, ready up, host starts match

### Match Flow
```
Lobby → Hero Select → Map Generation → Game Start
→ Turn Loop (draw card → move/attack/build → end turn)
→ Elimination → Victory Screen → Back to Lobby
```

### Turn Timer
- Configurable per room (30s, 60s, 90s, unlimited)
- Auto-end turn if timer expires (no actions taken = skip)

### Spectator Mode (stretch goal)
- Eliminated players can watch remaining players

---

## 11. Architecture Diagram

```
┌─────────────────────────────────────┐
│         BROWSER CLIENT              │
│  ┌──────────┐  ┌─────────────────┐  │
│  │ Three.js │  │ React UI (HUD,  │  │
│  │ (3D Map, │  │ Inventory, Chat │  │
│  │  Sprites, │  │ Lobby, Cards)   │  │
│  │  FoW)    │  │                 │  │
│  └──────────┘  └─────────────────┘  │
│         ↕ Colyseus Client SDK       │
└──────────────┬──────────────────────┘
               │ WebSocket
┌──────────────┴──────────────────────┐
│         COLYSEUS SERVER             │
│  ┌───────────────────────────────┐  │
│  │ Game Room (authoritative)     │  │
│  │  - Turn manager               │  │
│  │  - Board state (tiles, units) │  │
│  │  - Combat resolution          │  │
│  │  - Card deck & draws          │  │
│  │  - FoW calculation            │  │
│  │  - AI NPC logic               │  │
│  │  - Resource tracking          │  │
│  └───────────────────────────────┘  │
│         ↕ Redis (session cache)     │
│         ↕ Convex (persistent data)  │
└─────────────────────────────────────┘
```

---

## 12. Repo & Integration Plan

### Phase 1: Foundation
- New repo (e.g., `1j1-gridwars` or whatever the name becomes)
- Next.js + Three.js + TypeScript + Tailwind (same base as glass-portfolio)
- Basic oct-grid rendering with camera controls
- Tile click interaction

### Phase 2: Core Game
- Colyseus server setup (separate `/server` directory or monorepo)
- Turn system, hero movement, FoW, LoS
- Resource tiles, gathering
- Basic combat

### Phase 3: Depth
- Card system
- Buildings & units
- Survival (food/water drain)
- Crafting
- AI wildcard NPC

### Phase 4: Multiplayer Polish
- Auth & accounts
- Lobby system
- Matchmaking
- Hero selection screen
- Turn timer

### Phase 5: Integration
- Mount at `onejas.one/<gameName>` via Next.js route or subdomain
- Add as experiment in glass-portfolio experiments list
- Shared auth if possible (Convex)

---

## 13. Design Decisions (Answered 2026-04-04)

1. **Game Name:** Project HellYea (`project-hellyea`)
2. **Player Count:** 2-player duels for POC. Keep it lightweight.
3. **Card Deck:** Hero-specific decks. Players configure "loadouts" — deck builds tied to hero stat builds. Each player draws from their OWN pool. Post-match: rare card/loot drops on victory (tradeable reward system).
4. **Art Style:** Low-poly 3D, silhouetted/noir aesthetic. Basic shapes or free model assets for avatars. Lightweight.
5. **Hero Count:** Each player picks **2 heroes** at launch. Enables meta (ranged + rusher, tank + support, etc).
6. **Map Size:** 20×20+ for strategic depth. Support directed shapes (e.g., long skinny maps for close-combat).
7. **Turn System:** Simultaneous input, simultaneous resolution (Civ-style). Both players plan, then actions resolve at once. Edge cases to test: move-dodge-attack interactions.
8. **Monetization:** Free / demo first. No monetization for POC.
9. **Priority:** Playable local prototype that's also ready for 2-player multiplayer testing.

## 13a. Revised Core Rules (from J's answers)

### Two-Hero System
- Each player selects **2 heroes** pre-match
- Heroes operate independently on the board (separate positions, separate actions)
- Each hero gets its own turn actions (move, attack, settlement action)
- Creates meta: combo builds, flanking, split-push strategies

### Win Condition (Revised)
- Destroy ALL enemy heroes **AND** their Town Center
- Heroes CAN respawn if the player has a Town Center
- Respawn cost: 2 turns with NO actions (hero is "rebuilding")
- Destroy the Town Center first → enemy heroes become mortal (no respawn)
- Strategic choice: rush heroes or siege the base?

### Simultaneous Turns (Civ-style)
- Both players input all actions during a planning phase
- Actions resolve simultaneously when both players confirm
- **Conflict resolution:** If Player A attacks tile X and Player B moves FROM tile X in the same turn → the attack misses (dodge mechanic). This is emergent, not a bug.
- **Order of resolution:** Move → Attack → Settlement (all players' moves resolve, then all attacks, then all builds)
- Timer per planning phase (configurable)

### Deck Loadout System
- Heroes have stat archetypes (STR-lean, INT-lean, AGI-lean, etc.)
- Card pool contains "stat-leaning" cards that synergize with builds
- Pre-match: players configure deck loadouts (subset of their card collection)
- Post-match victory: rare card/loot drops with tradeable economy
- Card rarity tiers: Common, Uncommon, Rare, Legendary

### Map Shapes
- Standard: 20×20 square arena
- Narrow: 10×30 corridor (close combat, face-to-face)
- Diamond: rotated square (chokepoints at corners)
- Custom: stretch goal for map editor

---

## 14. Deep Research Appendix (2026-04-04)

> *The following is a synthesized report from the Gemini Deep Research agent based on the project's core requirements.*

# Building a Modern Multiplayer 3D Isometric Turn-Based Strategy Browser Game (2025-2026)

**Key Points**
*   **Engine Ecosystem:** The landscape of web game development leans heavily toward WebGL/WebGPU wrappers. Research suggests Three.js (via React Three Fiber) provides the greatest flexibility, while Babylon.js offers a more comprehensive "batteries-included" engine. 
*   **Multiplayer Architecture:** For competitive, turn-based card and tactical mechanics, an authoritative server is considered essential to prevent cheating. Colyseus and Nakama both offer excellent TypeScript-based backends, though Nakama scales more robustly for battle royale scenarios.
*   **Architectural Paradigm:** The Entity-Component-System (ECS) pattern is heavily favored over traditional Object-Oriented Programming (OOP) for complex browser games to ensure optimal CPU cache locality and code composability.
*   **Map and Pathing:** "Octagonal" grids are technically represented as 8-way square grids (octile grids). Line-of-sight and pathfinding on these grids are best handled by any-angle algorithms like Theta* combined with Wave Function Collapse for procedural map generation.

**Navigating Complexity in Browser Games**
Building a browser game that combines turn-based combat, real-time strategy (RTS) resource gathering, survival mechanics, and battle royale elimination is a highly ambitious endeavor. Developers must carefully balance the computational load of the client (rendering 3D graphics and UI) with the strict state management of the server.

**The State of Web Technologies**
With the standardization of WebGL 2.0 and the gradual rollout of WebGPU, browsers in 2025 and 2026 possess near-native rendering capabilities. However, JavaScript's single-threaded nature and garbage collection quirks require strict architectural discipline—specifically utilizing TypedArrays and data-oriented design—to maintain 60 frames per second (FPS) during complex game states. 

**Balancing Innovation and Risk**
While it is tempting to build custom solutions for every feature, leveraging established open-source frameworks like bitECS for state management and Nakama for networking reduces development time. The primary risk in this genre blend lies in state synchronization; therefore, adopting a strict separation between game logic and the rendering view is crucial.

***

## 1. Executive Summary
The synthesis of multiple genres—turn-based strategy, RTS resource gathering, card-based combat modifiers, RPG hero progression, survival mechanics, and battle royale elimination—presents a unique software engineering challenge, particularly within the constraints of a web browser. As of 2025-2026, the JavaScript and TypeScript ecosystems have matured significantly, offering robust tools capable of executing high-performance 3D graphics and complex authoritative multiplayer simulations.

This report provides a comprehensive technical blueprint for architecting a 3D isometric browser game encompassing these complex mechanics. Operating on an octagonal (octile) grid, the game requires advanced any-angle pathfinding and fog of war algorithms. The multiplayer component, essential for the battle royale and competitive card systems, demands a strict server-authoritative model to prevent client-side manipulation. Furthermore, to handle the vast array of entities—from trainable units and AI wildcard NPCs to individual resource nodes—the underlying game architecture must shift away from traditional Object-Oriented Programming (OOP) toward an Entity-Component-System (ECS) paradigm.

The ensuing sections analyze rendering engines, multiplayer backend frameworks, game architecture patterns, map generation methodologies, and card state management, concluding with a recommended technical stack and comprehensive risk assessment tailored for the 2025-2026 web development landscape.

## 2. Rendering Engine Analysis (Three.js, Babylon.js, PlayCanvas, Phaser)
The choice of rendering engine dictates the performance, visual fidelity, and development velocity of the project. For an isometric 3D game in a modern browser, developers must weigh minimal abstractions against full-suite game engines.

| Feature | Three.js | Babylon.js | PlayCanvas | Phaser |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Focus** | 3D Rendering Library | Full 3D Game Engine | 3D Engine with Cloud Editor | 2D Game Engine |
| **Architecture** | Code-first, highly modular | OOP, Batteries-included | ECS-based, GUI editor | Code-first, Scene-based |
| **Ecosystem** | Massive (React Three Fiber) | Strong, Microsoft-backed | Niche, collaborative | Massive for 2D |
| **Suitability for Isometric** | Excellent with orthographic cameras | Excellent | Very Good | Poor (2D only) |
| **TypeScript Support** | Excellent (DefinitelyTyped) | Native | Native | Native |

### Three.js
Three.js is the most ubiquitous 3D rendering library on the web, boasting millions of weekly downloads. Rather than being a full game engine, it is a lightweight wrapper around WebGL/WebGPU. 
*   **Pros:** Its modularity allows developers to inject their own physics and game logic architectures. In the modern React ecosystem, the `react-three-fiber` (R3F) wrapper allows for declarative 3D scene building, deeply integrating with state management libraries like Zustand and ECS libraries like Koota.
*   **Cons:** It lacks built-in game engine features (e.g., physics, complex asset pipelines, built-in pathfinding), meaning the developer must manually stitch together third-party libraries.

### Babylon.js
Developed by Microsoft, Babylon.js is a "batteries-included" 3D engine. It is explicitly designed for game development rather than pure rendering.
*   **Pros:** It features an extensive built-in toolset, including physics engines, collisions, robust asset inspectors, and native TypeScript support. Its performance is highly optimized, and it supports modern WebGPU standards out of the box. 
*   **Cons:** The engine utilizes a heavily Object-Oriented paradigm under the hood. While it can be paired with an external ECS, developers may find themselves fighting the engine's innate design patterns.

### PlayCanvas
PlayCanvas operates as both an open-source 3D web engine and a cloud-hosted development environment.
*   **Pros:** It includes a native built-in Entity-Component System, a robust GUI editor, and excellent collaborative tools for teams. It integrates well with ammo.js for physics and features a highly optimized asset loading pipeline.
*   **Cons:** It requires a reliance on their proprietary cloud editor for the best developer experience, which may alienate developers who prefer local, code-first environments.

### Phaser
Phaser is the premier framework for HTML5 games, but it is strictly a 2D engine. 
*   **Pros:** Highly optimized for sprite rendering, tilemaps, and 2D physics.
*   **Cons:** While isometric games *can* be faked in 2D using orthographic tile projection, building a true 3D isometric game with Z-axis mechanics, 3D line-of-sight, and complex polygonal models is not feasible in Phaser without extensive hacks.

## 3. Multiplayer Server Framework Comparison (Colyseus, Nakama, custom)
A game featuring battle royale mechanics, turn-based combat, and card modifiers mandates an **authoritative server architecture**. Client-authoritative models or pure peer-to-peer networks are extremely susceptible to hacking (e.g., modifying card draws, ignoring fog of war, teleporting). In an authoritative model, the client only sends *intentions* (e.g., “Play Card X,” “Move to Tile Y”), and the server simulates the result and broadcasts the new state.

### Colyseus
Colyseus is an open-source, Node.js-based multiplayer framework built specifically for room-based, state-synchronized games.
*   **Architecture:** It utilizes WebSockets and binary state synchronization (Delta Compression) to efficiently push state changes from the server to clients.
*   **Pros:** Written entirely in TypeScript, it allows developers to share ECS logic, interfaces, and math libraries directly between the client and the server. It is exceptionally easy to set up for turn-based and card games.
*   **Cons:** While it supports room scaling, managing a massive, seamless battle royale world requires custom horizontal scaling logic that outgrows basic room-based paradigms.

### Nakama
Nakama, developed by Heroic Labs, is an open-source scalable server designed for social and real-time multiplayer games.
*   **Architecture:** Written in Go, it allows developers to script server-side authoritative logic using TypeScript, Lua, or Go.
*   **Pros:** It provides enterprise-grade scalability, capable of handling thousands of concurrent users (CCU) efficiently. Furthermore, it includes built-in systems for matchmaking, leaderboards, user accounts, and social features, making it ideal for a persistent battle royale environment. It natively supports tick-based fixed loops for asynchronous real-time and active turn-based multiplayer.
*   **Cons:** The underlying engine is Go, which introduces a slight mental overhead when debugging server architecture, even if the game logic is written in TypeScript. 

### Custom WebSocket Solution
Using raw Node.js with `ws` or `Socket.io` allows for absolute control over the networking stack.
*   **Pros:** Complete control over binary payload formatting, custom rollback netcode, and server tick rates.
*   **Cons:** The developer must manually engineer room management, matchmaking, load balancing, sticky sessions, reconnect logic, and Delta state compression. For a complex game with card mechanics and survival logic, the boilerplate required presents a massive overhead and high risk of failure.

## 4. Game Architecture Patterns (ECS vs OOP, state machines)
Browser engines execute within the V8 JavaScript engine, meaning memory allocation and garbage collection can severely impact performance. When managing thousands of entities—such as individual resource nodes, survival timers, battle royale gas rings, trainable units, and AI NPCs—architecture is paramount.

### Object-Oriented Programming (OOP)
Traditional game development uses OOP, where a `Player` class inherits from a `Character` class, which inherits from a `GameObject` class.
*   **The Problem:** OOP scatters object data randomly across the heap. Iterating over thousands of units to update their survival parameters (food/water) causes massive CPU cache misses. Furthermore, as mechanics blend, the "diamond inheritance" problem emerges (e.g., how to class a “Building” that can “Attack” and holds “Inventory”). OOP leads to deeply nested conditionals and spaghetti code in highly complex systems.

### Entity-Component-System (ECS)
ECS separates data from behavior to achieve high composability and maximum performance.
*   **Entity:** A simple unique integer ID.
*   **Component:** Plain Data structures (Structs/Typed Arrays) holding state (e.g., `Position {x, y}`, `Health {current, max}`).
*   **System:** Pure functions that query all entities with a specific set of components and update them sequentially.
*   **Benefits:** ECS stores component data contiguously in memory (Data-Oriented Design) utilizing JavaScript's `SharedArrayBuffer` or `Float32Array`. This guarantees spatial locality, yielding massive performance boosts (up to 50x in tight loops). It inherently prevents race conditions in multiplayer environments by processing state changes in distinct, predictable phases.

### Ecosystem Libraries for TypeScript
*   **bitECS:** A minimal, data-oriented ECS library operating on strictly typed arrays. It is heavily optimized, lightweight (~5kb), and allows for millions of operations per second.
*   **Koota:** A rising ECS library tailored for React and React Three Fiber environments. It manages game state independently of the view layer while providing React hooks for selective re-rendering, bridging the gap between high-performance simulation and declarative UI.

## 5. Fog of War and Line of Sight Technical Deep Dive
The specification calls for an "octagonal tile grid." In graph theory and pathfinding algorithms, true octagons cannot perfectly tessellate space. Instead, this refers to an **Octile Grid** (a square grid where diagonal movement is permitted, yielding 8 degrees of freedom).

### Pathfinding on Octile Grids
Traditional A* pathfinding on 8-way grids restricts paths to 45-degree increments, creating "jagged" and unnatural movement paths, which is heavily noticeable in modern 3D games.
*   **Any-Angle Path Planning:** To allow units to traverse open areas smoothly, algorithms like **Theta*** and **Lazy Theta*** are utilized. Theta* checks line-of-sight (LoS) between the current node and the ancestor of its neighbor; if a direct path is clear of obstacles, it links them directly, bypassing intermediate grid cells.
*   **Optimization:** **Lazy Theta*** delays LoS calculations until a node is actually expanded, significantly reducing computational overhead in complex environments.

### Fog of War (FoW) and Line of Sight (LoS)
Fog of War dictates what information the client receives from the authoritative server. In a multiplayer battle royale, sending the entire map state to a client exposes the game to map-hacking.
*   **Server-Side Culling:** The server calculates LoS for all units controlled by a player. It uses a modified **Bresenham's Line Algorithm** or discrete raycasting tailored for 1D arrays representing the 2D octile grid to trace sightlines.
*   **Client Representation:** The server dispatches an array of visible entities and visible tile coordinates. The client rendering engine (e.g., Three.js) then utilizes a custom Shader Material or Post-Processing pass to visually obscure non-visible tiles. Areas previously seen remain in a “greyed out” state (displaying static buildings/resources but no active enemies).

## 6. Procedural Map Generation Approaches
Given the battle royale and survival elements, replayability necessitates procedurally generated octile environments.

### Perlin/Simplex Noise
The traditional approach involves layering continuous noise functions (Perlin noise) at varying frequencies and amplitudes to generate heightmaps and biome temperature/moisture maps.
*   **Pros:** Extremely fast, highly parallelizable, and produces natural, sweeping landscapes.
*   **Cons:** Fails to generate structured logic (e.g., road networks, logical base layouts, or coherent city blocks).

### Wave Function Collapse (WFC)
WFC is a deterministic, constraint-based algorithm that solves grid states similar to Sudoku. Given a set of adjacency rules (e.g., “Water can only touch Sand,” “Road must connect to Road”), the algorithm calculates the entropy of each cell and recursively collapses possibilities until the grid is formed.
*   **Application in Octile Grids:** WFC works exceptionally well for generating human-made structures, ruins, and tactical chokepoints required for an RTS and RPG game. 
*   **Implementation Strategy:** For massive battle royale maps, computing WFC globally is computationally prohibitive and prone to unresolvable contradictions (requiring costly backtracking). The optimal methodology is **Layered Block-Based WFC**:
    1.  Use Perlin Noise to generate macro-biomes and broad terrain elevation.
    2.  Divide the map into "chunks".
    3.  Run WFC on specific chunks to generate micro-structures (e.g., towns, fortresses, dense resource groves) utilizing seeded randomizers to ensure deterministic generation across server and client.

## 7. Card System Design Patterns
Incorporating card-based modifiers (e.g., buffs, tactical strikes, survival resource drops) into a multiplayer isometric game requires rigorous state management.

### State Modeling
The card system must be entirely independent of the visual representation.
The state is mathematically reduced to arrays of integer IDs (Entities in the ECS) residing in distinct zones:
1.  **Deck:** Hidden zone. Order matters.
2.  **Hand:** Private zone. Visible only to the owner.
3.  **Board/Active:** Public zone. Modifiers currently applied to the grid or hero units.
4.  **Discard/Void:** Public or private zone containing exhausted cards.

### Synchronization Strategies
Because card games demand strict precision, if players see conflicting states, trust in the game immediately erodes.
*   **Event Sourcing (Diffs):** Instead of synchronizing the whole array, the server validates a card play and broadcasts an Event Diff (e.g., `{ action: “PLAY_CARD”, cardId: 45, targetEntity: 102 }`).
*   **Predict-Rollback vs. Strict Server Authority:** For fast-paced tactical games, clients predict the outcome of a card play for immediate visual feedback. If the server detects an invalid move (e.g., insufficient action points, card not in hand), the server broadcasts a rejection, and the client “rolls back” the local ECS state to the last known valid server tick. For slower turn-based phases, strict server authority (where the UI waits for the server response before animating) is highly secure and easier to implement.

## 8. Similar Games Analysis
Analyzing existing titles helps validate the proposed mechanics and highlight potential pitfalls.

*   **Baldur's Gate 3 / Divinity: Original Sin 2:** These are the gold standards for 3D isometric turn-based combat.
    *   *What they did right:* Elevation mechanics significantly impact combat. Environmental hazards (fire, water, poison) create emergent tactical puzzles.
    *   *What to adapt:* Implementing a “surface” system in the ECS where grid tiles carry component data for elemental statuses.
*   **XCOM 2:** The premier tactical grid game.
    *   *What they did right:* The half-cover / full-cover system and strict LoS rules create tense positioning.
    *   *What to adapt:* Raycasting from the octile grid center to determine cover bonuses against ranged attacks.
*   **Browser MMOs & Web Strategy (e.g., FreeCiv, Slither.io, Krunker):**
    *   *What they did right:* Frictionless entry. Users can immediately join via URL without downloads.
    *   *What they did wrong:* Many browser games fail to prevent client-side hacking due to trusting the client's calculations too heavily. 

## 9. Recommended Stack with Justification
Based on the synthesis of rendering needs, complex data arrays, scalable multiplayer, and the 2025-2026 tech ecosystem, the following stack is recommended:

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Language** | **TypeScript** | Crucial for maintaining type safety across the client and the backend. Prevents runtime errors common in massive codebases. |
| **Frontend Framework** | **React + Vite** | React excels at complex, state-driven UI (inventories, card hands, survival meters). Vite provides a lightning-fast development server. |
| **Rendering Engine** | **Three.js (via React Three Fiber)** | R3F allows developers to declare 3D scenes identically to React components. It offers maximum flexibility without forcing an unwanted OOP game logic paradigm. |
| **Game Architecture** | **Koota / bitECS** | Koota provides a highly performant ECS with React bindings, seamlessly linking pure data states with the 3D view layer and the UI. |
| **Backend / Multiplayer** | **Nakama (TypeScript Logic)** | Provides enterprise scalability required for a Battle Royale. Written in Go but allows server-authoritative TS logic for card validation and Fog of War calculations. |
| **State Sync** | **Predict-Rollback Event System** | Resolves the latency inherent to browser environments, maintaining responsiveness during resource gathering while remaining secure. |

## 10. Risk Assessment and Pitfalls
1.  **Performance Death by OOP:** Attempting to build an RTS + Survival game using traditional nested classes will overwhelm the browser's garbage collector. **Mitigation:** Strict adherence to Data-Oriented Design and ECS. Every unit, card, and building must be an integer ID, not an object.
2.  **State Desynchronization:** If the client and server process the exact same physics or combat math but end up with different results (e.g., floating-point inaccuracies across different browsers), the game will break. **Mitigation:** Use deterministic math libraries (fixed-point arithmetic) and rely on the server as the absolute single source of truth.
3.  **Network Bandwidth Saturation:** An octile grid with hundreds of AI wildcards, resources, and moving heroes generates massive state data. Broadcasting this to 100 battle royale players at 60Hz will crash the connection. **Mitigation:** Implement aggressive *Interest Management*. The server must only send state updates to a client for entities that are currently within that specific player's Line of Sight or Fog of War threshold.
4.  **UI Thread Blocking:** Processing WFC map generation, pathfinding for 100 NPCs, and LoS algorithms simultaneously can freeze the browser tab. **Mitigation:** Offload all heavy computations (map generation, Theta* pathfinding) to **Web Workers** so the main thread remains dedicated to rendering and React updates.
5.  **Scope Creep:** Combining 4X, RTS, Survival, Battle Royale, RPG, and Card Battler genres is historically perilous. **Mitigation:** Begin by finalizing the core ECS loop and network synchronization of moving a single generic entity on an octile grid. Layer systems (Cards -> Survival -> Buildings) sequentially, validating multiplayer invariants continuously.

---

*This doc is alive. We'll iterate as design decisions get made.*
