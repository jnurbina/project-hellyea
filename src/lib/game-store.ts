// === Game State Store (Zustand) — Hero Initiative System ===

import { create } from 'zustand';
import * as THREE from 'three';
import { GameState, Hero, Tile, Player, HeroStats, TERRAIN_CONFIG } from './types';
import { generateGrid, findPath, calculateVisibility, octileDistance } from './grid';

// === Helpers ===

function cloneGameState(gs: GameState): GameState {
  return {
    ...gs,
    grid: gs.grid.map(row => row.map(t => ({ ...t }))),
    players: Object.fromEntries(
      Object.entries(gs.players).map(([id, p]) => [id, {
        ...p,
        heroes: p.heroes.map(h => ({ ...h, position: { ...h.position }, stats: { ...h.stats } })) as [Hero, Hero],
        resources: { ...p.resources },
      }])
    ),
    pendingActions: Object.fromEntries(
      Object.entries(gs.pendingActions).map(([id, a]) => [id, [...a]])
    ),
  };
}

function getOccupiedTiles(gs: GameState, excludeId?: string): Set<string> {
  const occupied = new Set<string>();
  for (const player of Object.values(gs.players)) {
    for (const hero of player.heroes) {
      if (!hero.alive || hero.id === excludeId) continue;
      occupied.add(`${hero.position.q},${hero.position.r}`);
    }
  }
  return occupied;
}

function getAllHeroes(gs: GameState): Hero[] {
  return Object.values(gs.players).flatMap(p => [...p.heroes]);
}

function findHero(gs: GameState, heroId: string): Hero | undefined {
  return getAllHeroes(gs).find(h => h.id === heroId);
}

/** Build the initiative order: all living heroes sorted by SPD descending */
function buildInitiativeOrder(gs: GameState): string[] {
  return getAllHeroes(gs)
    .filter(h => h.alive)
    .sort((a, b) => b.stats.spd - a.stats.spd)
    .map(h => h.id);
}

/** Compute all tiles reachable by a hero within their MOV range */
function computeMoveTiles(gs: GameState, hero: Hero): Set<string> {
  const reachable = new Set<string>();
  const occupied = getOccupiedTiles(gs, hero.id);
  const grid = gs.grid;
  const mov = hero.stats.mov;

  // BFS with cost tracking
  const costs = new Map<string, number>();
  const queue: { q: number; r: number; cost: number }[] = [{ q: hero.position.q, r: hero.position.r, cost: 0 }];
  const startKey = `${hero.position.q},${hero.position.r}`;
  costs.set(startKey, 0);

  const DIRS = [
    { dq: 0, dr: -1 }, { dq: 1, dr: -1 }, { dq: 1, dr: 0 }, { dq: 1, dr: 1 },
    { dq: 0, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: -1, dr: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dir of DIRS) {
      const nq = current.q + dir.dq;
      const nr = current.r + dir.dr;
      if (nr < 0 || nr >= grid.length || nq < 0 || nq >= grid[0].length) continue;
      const nKey = `${nq},${nr}`;
      if (occupied.has(nKey)) continue;
      const tile = grid[nr][nq];
      const base = TERRAIN_CONFIG[tile.terrain].moveCost;
      if (base >= 99) continue;
      const isDiag = dir.dq !== 0 && dir.dr !== 0;
      const stepCost = base * (isDiag ? 1.414 : 1);
      const totalCost = current.cost + stepCost;
      if (totalCost > mov) continue;
      if (costs.has(nKey) && costs.get(nKey)! <= totalCost) continue;
      costs.set(nKey, totalCost);
      reachable.add(nKey);
      queue.push({ q: nq, r: nr, cost: totalCost });
    }
  }
  return reachable;
}

/** Compute all tiles attackable by a hero within range, checking LoS */
function computeAttackTiles(gs: GameState, hero: Hero): Set<string> {
  const attackable = new Set<string>();
  const grid = gs.grid;
  const rng = hero.stats.rng;
  const hq = hero.position.q;
  const hr = hero.position.r;

  for (let r = 0; r < grid.length; r++) {
    for (let q = 0; q < grid[0].length; q++) {
      if (q === hq && r === hr) continue;
      const dist = octileDistance(hq, hr, q, r);
      if (dist > rng) continue;
      // Check if tile has an enemy hero
      const hasEnemy = getAllHeroes(gs).some(
        h => h.alive && h.owner !== hero.owner && h.position.q === q && h.position.r === r
      );
      if (!hasEnemy) continue;
      attackable.add(`${q},${r}`);
    }
  }
  return attackable;
}

export function truncatePathToMovement(
  path: { q: number; r: number }[],
  grid: Tile[][],
  maxMov: number
): { q: number; r: number }[] {
  if (path.length <= 1) return path;
  const result = [path[0]];
  let spent = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const cur = path[i];
    const tile = grid[cur.r][cur.q];
    const base = TERRAIN_CONFIG[tile.terrain].moveCost;
    const isDiag = prev.q !== cur.q && prev.r !== cur.r;
    const cost = base * (isDiag ? 1.414 : 1);
    if (spent + cost > maxMov) break;
    spent += cost;
    result.push(cur);
  }
  return result;
}

// === Store Types ===

export type ActionMode = 'idle' | 'move' | 'attack';

export interface CameraConfig {
  target: THREE.Vector3;
  angle: number;
  zoom: number;
}

export interface MoveAnimation {
  heroId: string;
  path: { q: number; r: number }[];
  currentIndex: number;
  progress: number; // 0-1 between currentIndex and next
}

interface GameStore {
  gameState: GameState | null;
  
  // Initiative system
  initiativeOrder: string[];    // hero IDs sorted by SPD
  initiativeIndex: number;      // current position in the order
  activeHeroId: string | null;  // hero whose turn it is
  round: number;
  
  // UI state
  actionMode: ActionMode;
  moveTiles: Set<string>;       // green range preview
  attackTiles: Set<string>;     // red range preview
  hoveredTile: { q: number; r: number } | null;
  currentPath: { q: number; r: number }[] | null;
  pendingTarget: { q: number; r: number } | null;  // first click location
  targetHeroId: string | null;  // hero being targeted (for bottom-right panel)
  
  // Camera
  cameraConfig: CameraConfig | null;
  
  // Animation
  moveAnimation: MoveAnimation | null;
  
  // Actions
  initGame: (mapWidth?: number, mapHeight?: number) => void;
  setActionMode: (mode: ActionMode) => void;
  setHoveredTile: (q: number, r: number) => void;
  clearHover: () => void;
  handleTileClick: (q: number, r: number) => void;
  advanceTurn: () => void;
  updateVisibility: () => void;
  focusHero: (heroId: string) => void;
  tickMoveAnimation: (delta: number) => boolean; // returns true if still animating
}

const DEFAULT_HEROES: { name: string; lore: string; archetype: Hero['archetype']; stats: HeroStats }[] = [
  { name: 'Kael', lore: 'A swift blade from the outer wastes.', archetype: 'agi', stats: { hp: 80, maxHp: 80, atk: 12, def: 6, mov: 5, rng: 1, vis: 6, spd: 8 } },
  { name: 'Morrigan', lore: 'Fire walks with her.', archetype: 'int', stats: { hp: 60, maxHp: 60, atk: 18, def: 4, mov: 3, rng: 4, vis: 7, spd: 5 } },
  { name: 'Gort', lore: 'Mountain-born. Mountain-hard.', archetype: 'str', stats: { hp: 120, maxHp: 120, atk: 15, def: 12, mov: 3, rng: 1, vis: 4, spd: 3 } },
  { name: 'Vesper', lore: 'Sees all. Says nothing.', archetype: 'int', stats: { hp: 70, maxHp: 70, atk: 10, def: 5, mov: 4, rng: 3, vis: 9, spd: 6 } },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  initiativeOrder: [],
  initiativeIndex: 0,
  activeHeroId: null,
  round: 1,
  actionMode: 'idle',
  moveTiles: new Set(),
  attackTiles: new Set(),
  hoveredTile: null,
  currentPath: null,
  pendingTarget: null,
  targetHeroId: null,
  cameraConfig: null,
  moveAnimation: null,

  initGame: (mapWidth = 20, mapHeight = 20) => {
    const grid = generateGrid(mapWidth, mapHeight, Date.now());

    const makeHero = (template: typeof DEFAULT_HEROES[0], id: string, owner: string, q: number, r: number): Hero => ({
      id, name: template.name, lore: template.lore, archetype: template.archetype, stats: { ...template.stats },
      position: { q, r }, alive: true, respawnTimer: 0, hasMoved: false, hasAttacked: false,
      inventory: [null, null, null, null, null, null], owner,
    });

    const players: Record<string, Player> = {
      player1: {
        id: 'player1', name: 'Player 1',
        heroes: [makeHero(DEFAULT_HEROES[0], 'p1-hero1', 'player1', 2, 2), makeHero(DEFAULT_HEROES[2], 'p1-hero2', 'player1', 3, 3)],
        resources: { wood: 10, stone: 5, iron: 2, food: 15, water: 15 }, hand: [], deck: [], buildings: [], actionsSubmitted: false,
      },
      player2: {
        id: 'player2', name: 'Player 2',
        heroes: [makeHero(DEFAULT_HEROES[1], 'p2-hero1', 'player2', mapWidth - 3, mapHeight - 3), makeHero(DEFAULT_HEROES[3], 'p2-hero2', 'player2', mapWidth - 4, mapHeight - 4)],
        resources: { wood: 10, stone: 5, iron: 2, food: 15, water: 15 }, hand: [], deck: [], buildings: [], actionsSubmitted: false,
      }
    };

    const gameState: GameState = {
      phase: 'planning', turn: 1, grid, players, pendingActions: { player1: [], player2: [] }, mapWidth, mapHeight,
    };

    const order = buildInitiativeOrder(gameState);
    const firstHeroId = order[0];
    const firstHero = findHero(gameState, firstHeroId)!;

    set({
      gameState,
      initiativeOrder: order,
      initiativeIndex: 0,
      activeHeroId: firstHeroId,
      round: 1,
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      pendingTarget: null,
      targetHeroId: null,
      cameraConfig: {
        target: new THREE.Vector3(firstHero.position.q, 0, firstHero.position.r),
        angle: firstHero.owner === 'player1' ? Math.PI * 1.25 : Math.PI * 0.25,
        zoom: 120,
      },
    });

    get().updateVisibility();
  },

  setActionMode: (mode) => {
    const { gameState, activeHeroId } = get();
    if (!gameState || !activeHeroId) return;
    const hero = findHero(gameState, activeHeroId);
    if (!hero) return;

    if (mode === 'move' && !hero.hasMoved) {
      set({ actionMode: 'move', moveTiles: computeMoveTiles(gameState, hero), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
    } else if (mode === 'attack' && !hero.hasAttacked) {
      set({ actionMode: 'attack', attackTiles: computeAttackTiles(gameState, hero), moveTiles: new Set(), pendingTarget: null, targetHeroId: null });
    } else {
      set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
    }
  },

  setHoveredTile: (q, r) => {
    const { gameState, activeHeroId, actionMode } = get();
    if (!gameState || !activeHeroId) { set({ hoveredTile: { q, r } }); return; }

    const hero = findHero(gameState, activeHeroId);
    if (!hero) { set({ hoveredTile: { q, r } }); return; }

    if (actionMode === 'move' && !hero.hasMoved) {
      const occupied = getOccupiedTiles(gameState, hero.id);
      const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, Infinity, occupied);
      const truncated = fullPath ? truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov) : null;
      set({ hoveredTile: { q, r }, currentPath: truncated });
    } else if (actionMode === 'attack') {
      // Check if hovered tile has an enemy
      const enemy = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner !== hero.owner);
      set({ hoveredTile: { q, r }, currentPath: null, targetHeroId: enemy?.id || null });
    } else {
      set({ hoveredTile: { q, r }, currentPath: null });
    }
  },

  clearHover: () => set({ hoveredTile: null, currentPath: null }),

  handleTileClick: (q, r) => {
    const { gameState, activeHeroId, actionMode, pendingTarget, moveAnimation } = get();
    if (!gameState || !activeHeroId || moveAnimation) return;

    const hero = findHero(gameState, activeHeroId);
    if (!hero) return;
    const tileKey = `${q},${r}`;

    if (actionMode === 'move') {
      const moveTiles = get().moveTiles;
      if (!moveTiles.has(tileKey)) return;

      // Double-click confirmation
      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        // Confirmed! Execute move with animation
        const occupied = getOccupiedTiles(gameState, hero.id);
        const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, Infinity, occupied);
        if (!fullPath || fullPath.length < 2) return;
        const truncated = truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov);
        if (!truncated || truncated.length < 2) return;

        set({
          moveAnimation: { heroId: hero.id, path: truncated, currentIndex: 0, progress: 0 },
          pendingTarget: null,
          actionMode: 'idle',
          moveTiles: new Set(),
        });
      } else {
        // First click — mark pending
        set({ pendingTarget: { q, r } });
      }
    } else if (actionMode === 'attack') {
      if (!get().attackTiles.has(tileKey)) return;
      const enemy = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner !== hero.owner);
      if (!enemy) return;

      // Double-click confirmation
      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        // Confirmed! Execute attack
        const gs = cloneGameState(gameState);
        const attacker = findHero(gs, activeHeroId)!;
        const target = findHero(gs, enemy.id)!;

        const damage = Math.max(1, attacker.stats.atk - target.stats.def);
        target.stats.hp -= damage;
        if (target.stats.hp <= 0) { target.stats.hp = 0; target.alive = false; }
        attacker.hasAttacked = true;

        set({
          gameState: gs,
          pendingTarget: null,
          actionMode: 'idle',
          attackTiles: new Set(),
          targetHeroId: target.id, // keep target panel showing so they see the HP drop
        });

        // Auto-advance if hero has used both actions
        const updatedHero = findHero(gs, activeHeroId)!;
        if (updatedHero.hasMoved && updatedHero.hasAttacked) {
          setTimeout(() => get().advanceTurn(), 600);
        }
      } else {
        // First click — set pending + show target
        set({ pendingTarget: { q, r }, targetHeroId: enemy.id });
      }
    }
  },

  advanceTurn: () => {
    const { gameState, initiativeOrder, initiativeIndex } = get();
    if (!gameState) return;

    let gs = cloneGameState(gameState);
    let nextIndex = initiativeIndex + 1;
    let round = get().round;

    // If we've gone through all heroes, start a new round
    if (nextIndex >= initiativeOrder.length) {
      nextIndex = 0;
      round++;
      // Reset all hero actions
      for (const player of Object.values(gs.players)) {
        for (const hero of player.heroes) {
          hero.hasMoved = false;
          hero.hasAttacked = false;
        }
      }
      gs.turn = round;
    }

    // Rebuild initiative in case someone died
    const order = buildInitiativeOrder(gs);
    if (order.length === 0) return; // game over

    const safeIndex = nextIndex >= order.length ? 0 : nextIndex;
    const nextHeroId = order[safeIndex];
    const nextHero = findHero(gs, nextHeroId)!;

    set({
      gameState: gs,
      initiativeOrder: order,
      initiativeIndex: safeIndex,
      activeHeroId: nextHeroId,
      round,
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      pendingTarget: null,
      targetHeroId: null,
      currentPath: null,
      cameraConfig: {
        target: new THREE.Vector3(nextHero.position.q, 0, nextHero.position.r),
        angle: nextHero.owner === 'player1' ? Math.PI * 1.25 : Math.PI * 0.25,
        zoom: 120,
      },
    });

    get().updateVisibility();
  },

  updateVisibility: () => {
    const { gameState, activeHeroId } = get();
    if (!gameState || !activeHeroId) return;

    const hero = findHero(gameState, activeHeroId);
    if (!hero) return;

    const gs = cloneGameState(gameState);
    const player = gs.players[hero.owner];
    if (!player) return;

    for (const row of gs.grid) {
      for (const tile of row) {
        if (tile.visible === 'visible') tile.visible = 'explored';
      }
    }

    // Reveal for ALL of this player's heroes (not just active one)
    for (const h of player.heroes) {
      if (!h.alive) continue;
      const vis = calculateVisibility(gs.grid, h.position.q, h.position.r, h.stats.vis);
      for (const key of vis) {
        const [tq, tr] = key.split(',').map(Number);
        if (tr >= 0 && tr < gs.grid.length && tq >= 0 && tq < gs.grid[0].length) {
          gs.grid[tr][tq].visible = 'visible';
        }
      }
    }

    set({ gameState: gs });
  },

  focusHero: (heroId) => {
    const { gameState } = get();
    if (!gameState) return;
    const hero = findHero(gameState, heroId);
    if (!hero || !hero.alive) return;
    set({
      cameraConfig: {
        target: new THREE.Vector3(hero.position.q, 0, hero.position.r),
        angle: get().cameraConfig?.angle ?? Math.PI / 4,
        zoom: 120,
      },
    });
  },

  tickMoveAnimation: (delta) => {
    const { moveAnimation, gameState } = get();
    if (!moveAnimation || !gameState) return false;

    const MOVE_SPEED = 4; // tiles per second
    const newProgress = moveAnimation.progress + delta * MOVE_SPEED;

    if (newProgress >= 1) {
      // Advance to next segment
      const nextIndex = moveAnimation.currentIndex + 1;
      if (nextIndex >= moveAnimation.path.length - 1) {
        // Animation complete — commit the move
        const gs = cloneGameState(gameState);
        const hero = findHero(gs, moveAnimation.heroId);
        if (hero) {
          const dest = moveAnimation.path[moveAnimation.path.length - 1];
          hero.position = { q: dest.q, r: dest.r };
          hero.hasMoved = true;

          set({ gameState: gs, moveAnimation: null });
          get().updateVisibility();

          // Auto-advance if hero fully spent
          if (hero.hasAttacked) {
            setTimeout(() => get().advanceTurn(), 300);
          }
        } else {
          set({ moveAnimation: null });
        }
        return false;
      }

      set({
        moveAnimation: {
          ...moveAnimation,
          currentIndex: nextIndex,
          progress: newProgress - 1,
        },
      });
      return true;
    }

    set({
      moveAnimation: { ...moveAnimation, progress: newProgress },
    });
    return true;
  },
}));
