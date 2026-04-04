// === Game State Store — Simultaneous Planning + SPD Resolution ===

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
  const costs = new Map<string, number>();
  const queue: { q: number; r: number; cost: number }[] = [{ q: hero.position.q, r: hero.position.r, cost: 0 }];
  costs.set(`${hero.position.q},${hero.position.r}`, 0);
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

/** Compute all tiles in attack range (not just enemy-occupied ones) */
function computeAttackTiles(gs: GameState, hero: Hero): Set<string> {
  const attackable = new Set<string>();
  const rng = hero.stats.rng;
  const hq = hero.position.q;
  const hr = hero.position.r;
  const grid = gs.grid;
  for (let r = 0; r < grid.length; r++) {
    for (let q = 0; q < grid[0].length; q++) {
      if (q === hq && r === hr) continue;
      const dist = octileDistance(hq, hr, q, r);
      if (dist <= rng) {
        const tile = grid[r][q];
        if (TERRAIN_CONFIG[tile.terrain].moveCost < 99) { // can't attack water
          attackable.add(`${q},${r}`);
        }
      }
    }
  }
  return attackable;
}

export function truncatePathToMovement(
  path: { q: number; r: number }[], grid: Tile[][], maxMov: number
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

// Helper to create camera config with auto-incrementing version
let _cameraVersion = 0;
function makeCameraConfig(target: THREE.Vector3, angle: number, zoom: number): { cameraConfig: CameraConfig; cameraConfigVersion: number } {
  return {
    cameraConfig: { target: target.clone(), angle, zoom },
    cameraConfigVersion: ++_cameraVersion,
  };
}

function getPlayerMidpoint(gs: GameState, playerId: string): THREE.Vector3 {
  const player = gs.players[playerId];
  const living = player.heroes.filter(h => h.alive);
  if (living.length === 0) return new THREE.Vector3(gs.mapWidth / 2, 0, gs.mapHeight / 2);
  const sum = living.reduce((acc, h) => acc.add(new THREE.Vector3(h.position.q, 0, h.position.r)), new THREE.Vector3());
  return sum.divideScalar(living.length);
}

// === Types ===

export type ActionMode = 'idle' | 'move' | 'attack' | 'gather';
export type GamePhase = 'planning' | 'resolution';

export interface QueuedAction {
  movePath?: { q: number; r: number }[];
  moveDest?: { q: number; r: number };
  attackTargetTile?: { q: number; r: number };
  gatherTile?: { q: number; r: number };
}

export interface CameraConfig {
  target: THREE.Vector3;
  angle: number;
  zoom: number;
}

export interface MoveAnimation {
  heroId: string;
  path: { q: number; r: number }[];
  currentIndex: number;
  progress: number;
}

export interface DamageIndicator {
  id: string;
  q: number; r: number;
  amount: number | 'MISS';
  color: string;
}

interface GameStore {
  gameState: GameState | null;

  // Turn structure
  phase: GamePhase;
  round: number;
  planningPlayerId: string;
  queuedActions: Record<string, QueuedAction>;
  selectedHeroId: string | null;

  // Resolution
  resolutionOrder: string[];
  resolutionIndex: number;
  resolutionLocked: boolean;

  // UI state
  actionMode: ActionMode;
  moveTiles: Set<string>;
  attackTiles: Set<string>;
  hoveredTile: { q: number; r: number } | null;
  currentPath: { q: number; r: number }[] | null;
  pendingTarget: { q: number; r: number } | null;
  targetHeroId: string | null;
  showEndTurnConfirm: boolean;

  // Camera & animation
  cameraConfig: CameraConfig | null;
  cameraConfigVersion: number;
  moveAnimation: MoveAnimation | null;
  onCameraArrived: (() => void) | null;
  missIndicator: { q: number; r: number } | null;
  damageIndicators: DamageIndicator[]; // New: for floating damage numbers

  // Actions
  initGame: (mapWidth?: number, mapHeight?: number) => void;
  selectHero: (heroId: string | null) => void;
  setActionMode: (mode: ActionMode) => void;
  setHoveredTile: (q: number, r: number) => void;
  clearHover: () => void;
  handleTileClick: (q: number, r: number) => void;
  requestEndTurn: () => void;
  confirmEndTurn: () => void;
  cancelEndTurn: () => void;
  tickMoveAnimation: (delta: number) => boolean;
  processNextResolution: () => void;
  executeAttackTile: (attackerId: string, targetTile: { q: number; r: number }) => void;
  executeGather: (heroId: string, targetTile: { q: number; r: number }) => void; // New: gather action
  startResolution: () => void;
  startNewRound: () => void;
  updateVisibility: () => void;
  focusHero: (heroId: string) => void;
}

const DEFAULT_HEROES: { name: string; lore: string; archetype: Hero['archetype']; stats: HeroStats }[] = [
  { name: 'Kael', lore: 'A swift blade from the outer wastes.', archetype: 'agi', stats: { hp: 80, maxHp: 80, atk: 12, def: 6, mov: 5, rng: 1, vis: 6, spd: 8 } },
  { name: 'Morrigan', lore: 'Fire walks with her.', archetype: 'int', stats: { hp: 60, maxHp: 60, atk: 18, def: 4, mov: 3, rng: 4, vis: 7, spd: 5 } },
  { name: 'Gort', lore: 'Mountain-born. Mountain-hard.', archetype: 'str', stats: { hp: 120, maxHp: 120, atk: 15, def: 12, mov: 3, rng: 1, vis: 4, spd: 3 } },
  { name: 'Vesper', lore: 'Sees all. Says nothing.', archetype: 'int', stats: { hp: 70, maxHp: 70, atk: 10, def: 5, mov: 4, rng: 3, vis: 9, spd: 6 } },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  phase: 'planning',
  round: 1,
  planningPlayerId: 'player1',
  queuedActions: {},
  selectedHeroId: null,
  resolutionOrder: [],
  resolutionIndex: 0,
  resolutionLocked: false,
  actionMode: 'idle',
  moveTiles: new Set(),
  attackTiles: new Set(),
  hoveredTile: null,
  currentPath: null,
  pendingTarget: null,
  targetHeroId: null,
  showEndTurnConfirm: false,
  cameraConfig: null,
  cameraConfigVersion: 0,
  moveAnimation: null,
  onCameraArrived: null,
  missIndicator: null,
  damageIndicators: [],

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

    const p1mid = getPlayerMidpoint(gameState, 'player1');

    set({
      gameState,
      phase: 'planning',
      round: 1,
      planningPlayerId: 'player1',
      queuedActions: {},
      selectedHeroId: null,
      resolutionLocked: false,
      actionMode: 'idle',
      showEndTurnConfirm: false,
      missIndicator: null,
      damageIndicators: [],
      ...makeCameraConfig(p1mid, Math.PI * 1.25, 120),
    });

    get().updateVisibility();
  },

  selectHero: (heroId) => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') { set({ selectedHeroId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null, currentPath: null }); return; }
    if (!heroId) { set({ selectedHeroId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null, currentPath: null }); return; }
    const hero = findHero(gameState, heroId);
    if (!hero || hero.owner !== planningPlayerId || !hero.alive) { set({ selectedHeroId: null, actionMode: 'idle' }); return; }
    set({ selectedHeroId: heroId, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null, currentPath: null });
  },

  setActionMode: (mode) => {
    const { gameState, selectedHeroId, queuedActions } = get();
    if (!gameState || !selectedHeroId) return;
    const hero = findHero(gameState, selectedHeroId);
    if (!hero) return;
    const queued = queuedActions[selectedHeroId];

    if (mode === 'move' && !queued?.moveDest) {
      set({ actionMode: 'move', moveTiles: computeMoveTiles(gameState, hero), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
    } else if (mode === 'attack' && !queued?.attackTargetTile) {
      let attackHero = hero;
      if (queued?.moveDest) {
        attackHero = { ...hero, position: { ...queued.moveDest } };
      }
      set({ actionMode: 'attack', attackTiles: computeAttackTiles(gameState, attackHero), moveTiles: new Set(), pendingTarget: null, targetHeroId: null });
    } else if (mode === 'gather' && !queued?.gatherTile) { // New gather mode
      // Hero must be on a resource tile, and resource amount > 0
      const tile = gameState.grid[hero.position.r][hero.position.q];
      if (tile.resourceType && (tile.resourceAmount || 0) > 0) {
        set({ actionMode: 'gather', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
      } else {
        set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
      }
    } else {
      set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
    }
  },

  setHoveredTile: (q, r) => {
    const { gameState, selectedHeroId, actionMode } = get();
    if (!gameState || !selectedHeroId) { set({ hoveredTile: { q, r } }); return; }
    const hero = findHero(gameState, selectedHeroId);
    if (!hero) { set({ hoveredTile: { q, r } }); return; }

    if (actionMode === 'move') {
      const occupied = getOccupiedTiles(gameState, hero.id);
      const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, Infinity, occupied);
      const truncated = fullPath ? truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov) : null;
      set({ hoveredTile: { q, r }, currentPath: truncated });
    } else if (actionMode === 'attack') {
      const enemy = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner !== hero.owner);
      set({ hoveredTile: { q, r }, currentPath: null, targetHeroId: enemy?.id || null });
    } else if (actionMode === 'gather') {
      // No hover logic for gather, just check if it's the hero's tile
      const isHeroTile = hero.position.q === q && hero.position.r === r;
      set({ hoveredTile: isHeroTile ? { q, r } : null, currentPath: null });
    } else {
      set({ hoveredTile: { q, r }, currentPath: null });
    }
  },

  clearHover: () => set({ hoveredTile: null, currentPath: null }),

  handleTileClick: (q, r) => {
    const { gameState, selectedHeroId, actionMode, pendingTarget, moveAnimation, phase, planningPlayerId } = get();
    if (!gameState || phase !== 'planning' || moveAnimation) return;

    if (!selectedHeroId) {
      const heroOnTile = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner === planningPlayerId);
      if (heroOnTile) get().selectHero(heroOnTile.id);
      return;
    }

    const hero = findHero(gameState, selectedHeroId);
    if (!hero) return;
    const tileKey = `${q},${r}`;

    if (actionMode === 'move') {
      if (!get().moveTiles.has(tileKey)) return;
      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        const occupied = getOccupiedTiles(gameState, hero.id);
        const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, Infinity, occupied);
        if (!fullPath || fullPath.length < 2) return;
        const truncated = truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov);
        if (!truncated || truncated.length < 2) return;
        const dest = truncated[truncated.length - 1];

        const newQueued = { ...get().queuedActions };
        newQueued[hero.id] = { ...newQueued[hero.id], movePath: truncated, moveDest: dest };

        set({ queuedActions: newQueued, actionMode: 'idle', moveTiles: new Set(), pendingTarget: null, currentPath: null });
      } else {
        set({ pendingTarget: { q, r } });
      }
    } else if (actionMode === 'attack') {
      if (!get().attackTiles.has(tileKey)) return;
      const enemy = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner !== hero.owner);

      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        const newQueued = { ...get().queuedActions };
        newQueued[hero.id] = { ...newQueued[hero.id], attackTargetTile: { q, r } };

        set({ queuedActions: newQueued, actionMode: 'idle', attackTiles: new Set(), pendingTarget: null, targetHeroId: enemy?.id || null });
      } else {
        set({ pendingTarget: { q, r }, targetHeroId: enemy?.id || null });
      }
    } else if (actionMode === 'gather') { // New gather click handler
      const tile = gameState.grid[hero.position.r][hero.position.q];
      if (!tile.resourceType || (tile.resourceAmount || 0) <= 0) return; // Cannot gather if no resource or empty
      
      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r && hero.position.q === q && hero.position.r === r) {
        // Confirmed gather on hero's tile
        const newQueued = { ...get().queuedActions };
        newQueued[hero.id] = { ...newQueued[hero.id], gatherTile: { q, r } };

        set({ queuedActions: newQueued, actionMode: 'idle', pendingTarget: null });
      } else if (hero.position.q === q && hero.position.r === r) {
        // First click on hero's tile for gather
        set({ pendingTarget: { q, r } });
      }
    } else {
      const heroOnTile = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner === planningPlayerId);
      if (heroOnTile) {
        get().selectHero(heroOnTile.id);
      }
    }
  },

  requestEndTurn: () => {
    set({ showEndTurnConfirm: true });
  },

  confirmEndTurn: () => {
    const { planningPlayerId } = get();
    set({ showEndTurnConfirm: false });

    if (planningPlayerId === 'player1') {
      const { gameState } = get();
      if (!gameState) return;
      const p2mid = getPlayerMidpoint(gameState, 'player2');
      set({
        planningPlayerId: 'player2',
        selectedHeroId: null,
        actionMode: 'idle',
        moveTiles: new Set(),
        attackTiles: new Set(),
        pendingTarget: null,
        targetHeroId: null,
        currentPath: null,
        ...makeCameraConfig(p2mid, Math.PI * 0.25, 120),
      });
      get().updateVisibility();
    } else {
      get().startResolution();
    }
  },

  cancelEndTurn: () => {
    set({ showEndTurnConfirm: false });
  },

  startResolution: () => {
    const { gameState, queuedActions } = get();
    if (!gameState) return;

    const allHeroes = getAllHeroes(gameState).filter(h => h.alive);
    const order = allHeroes
      .filter(h => queuedActions[h.id]?.moveDest || queuedActions[h.id]?.attackTargetTile || queuedActions[h.id]?.gatherTile) // Include gather
      .sort((a, b) => b.stats.spd - a.stats.spd)
      .map(h => h.id);

    if (order.length === 0) {
      setTimeout(() => get().startNewRound(), 800);
      return;
    }

    set({
      phase: 'resolution',
      resolutionOrder: order,
      resolutionIndex: 0,
      resolutionLocked: true,
      selectedHeroId: null,
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      damageIndicators: [], // Clear damage indicators from previous round
    });

    get().processNextResolution();
  },

  processNextResolution: () => {
    const { gameState, queuedActions, resolutionOrder, resolutionIndex } = get();
    if (!gameState) return;

    if (resolutionIndex >= resolutionOrder.length) {
      setTimeout(() => get().startNewRound(), 800);
      return;
    }

    const heroId = resolutionOrder[resolutionIndex];
    const hero = findHero(gameState, heroId);
    const action = queuedActions[heroId];

    if (!hero || !hero.alive || !action) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    set({
      selectedHeroId: heroId,
      ...makeCameraConfig(new THREE.Vector3(hero.position.q, 0, hero.position.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          if (action.movePath && action.movePath.length > 1) {
            set({
              moveAnimation: {
                heroId: hero.id,
                path: action.movePath,
                currentIndex: 0,
                progress: 0,
              },
            });
          } else if (action.attackTargetTile) {
            get().executeAttackTile(heroId, action.attackTargetTile);
          } else if (action.gatherTile) { // New gather execution
            get().executeGather(heroId, action.gatherTile);
          } else {
            set({ resolutionIndex: resolutionIndex + 1 });
            setTimeout(() => get().processNextResolution(), 500);
          }
        }, 400);
      },
    });
  },

  executeAttackTile: (attackerId: string, targetTile: { q: number; r: number }) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const attacker = findHero(gs, attackerId);
    if (!attacker || !attacker.alive) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    const target = getAllHeroes(gs).find(
      h => h.alive && h.position.q === targetTile.q && h.position.r === targetTile.r && h.owner !== attacker.owner
    );

    set({
      targetHeroId: target?.id || null,
      selectedHeroId: attackerId,
      ...makeCameraConfig(new THREE.Vector3(targetTile.q, 0, targetTile.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          let damageAmount: number | 'MISS';
          if (target) {
            const damage = Math.max(1, attacker.stats.atk - target.stats.def);
            target.stats.hp -= damage;
            if (target.stats.hp <= 0) { target.stats.hp = 0; target.alive = false; }
            attacker.hasAttacked = true;
            damageAmount = damage;
          } else {
            attacker.hasAttacked = true;
            damageAmount = 'MISS';
          }

          const newDamageIndicators = [...get().damageIndicators, {
            id: THREE.MathUtils.generateUUID(),
            q: targetTile.q, r: targetTile.r,
            amount: damageAmount,
            color: damageAmount === 'MISS' ? '#ff4444' : '#ffffff',
          }];

          set({ gameState: gs, damageIndicators: newDamageIndicators });

          setTimeout(() => {
            // Clear this specific damage indicator after animation
            set(s => ({ damageIndicators: s.damageIndicators.filter(d => d.id !== newDamageIndicators[0].id) }));
            set({ resolutionIndex: resolutionIndex + 1, targetHeroId: null, selectedHeroId: null });
            setTimeout(() => get().processNextResolution(), 500);
          }, damageAmount === 'MISS' ? 1200 : 1000); 
        }, 300);
      },
    });
  },

  executeGather: (heroId: string, targetTile: { q: number; r: number }) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const hero = findHero(gs, heroId);
    const tile = gs.grid[targetTile.r][targetTile.q];

    if (!hero || !hero.alive || !tile.resourceType || (tile.resourceAmount || 0) <= 0) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    // Add resource to player
    const player = gs.players[hero.owner];
    if (player) {
      const gatheredAmount = Math.min(hero.stats.mov, tile.resourceAmount || 0); // Gather up to hero MOV, or remaining
      player.resources[tile.resourceType] = (player.resources[tile.resourceType] || 0) + gatheredAmount;
      tile.resourceAmount! -= gatheredAmount;
    }
    hero.hasMoved = true; // Gathering counts as a move action

    set({
      gameState: gs,
      selectedHeroId: heroId, // Keep hero selected to show panel
      ...makeCameraConfig(new THREE.Vector3(targetTile.q, 0, targetTile.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          set({ resolutionIndex: resolutionIndex + 1, selectedHeroId: null });
          setTimeout(() => get().processNextResolution(), 800); // Shorter pause for gather
        }, 500);
      },
    });
  },

  startNewRound: () => {
    const { gameState, round } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    for (const player of Object.values(gs.players)) {
      for (const hero of player.heroes) {
        hero.hasMoved = false;
        hero.hasAttacked = false;
        // New: Respawn dead heroes
        if (!hero.alive) {
          hero.respawnTimer--;
          if (hero.respawnTimer <= 0) {
            hero.alive = true;
            hero.stats.hp = hero.stats.maxHp; // Full HP on respawn
            // Respawn at town center or near start
            if (hero.owner === 'player1') hero.position = { q: 2, r: 2 };
            else hero.position = { q: gs.mapWidth - 3, r: gs.mapHeight - 3 };
          }
        }
      }
    }
    gs.turn = round + 1;

    const p1mid = getPlayerMidpoint(gs, 'player1');

    set({
      gameState: gs,
      phase: 'planning',
      round: round + 1,
      planningPlayerId: 'player1',
      queuedActions: {},
      selectedHeroId: null,
      resolutionOrder: [],
      resolutionIndex: 0,
      resolutionLocked: false,
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      pendingTarget: null,
      targetHeroId: null,
      missIndicator: null,
      damageIndicators: [],
      ...makeCameraConfig(p1mid, Math.PI * 1.25, 120),
    });

    get().updateVisibility();
  },

  tickMoveAnimation: (delta) => {
    const { moveAnimation, gameState, queuedActions, resolutionIndex } = get();
    if (!moveAnimation || !gameState) return false;

    const MOVE_SPEED = 4;
    const newProgress = moveAnimation.progress + delta * MOVE_SPEED;

    if (newProgress >= 1) {
      const nextIndex = moveAnimation.currentIndex + 1;
      if (nextIndex >= moveAnimation.path.length - 1) {
        const gs = cloneGameState(gameState);
        const hero = findHero(gs, moveAnimation.heroId);
        if (hero) {
          const dest = moveAnimation.path[moveAnimation.path.length - 1];
          hero.position = { q: dest.q, r: dest.r };
          hero.hasMoved = true;
          set({ gameState: gs, moveAnimation: null });
          get().updateVisibility();

          const action = queuedActions[moveAnimation.heroId];
          if (action?.attackTargetTile) {
            setTimeout(() => {
              get().executeAttackTile(moveAnimation.heroId, action.attackTargetTile!);
            }, 300);
          } else if (action?.gatherTile) { // New gather after move
            setTimeout(() => {
              get().executeGather(moveAnimation.heroId, action.gatherTile!);
            }, 300);
          } else {
            set({ resolutionIndex: resolutionIndex + 1 });
            setTimeout(() => get().processNextResolution(), 500);
          }
        } else {
          set({ moveAnimation: null });
        }
        return false;
      }

      set({ moveAnimation: { ...moveAnimation, currentIndex: nextIndex, progress: newProgress - 1 } });
      return true;
    }

    set({ moveAnimation: { ...moveAnimation, progress: newProgress } });
    return true;
  },

  updateVisibility: () => {
    const { gameState } = get();
    if (!gameState) return;
    const gs = cloneGameState(gameState);
    // Fog of war disabled for prototype — all tiles visible
    for (const row of gs.grid) {
      for (const tile of row) {
        tile.visible = 'visible';
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
      ...makeCameraConfig(new THREE.Vector3(hero.position.q, 0, hero.position.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
    });
  },
}));
