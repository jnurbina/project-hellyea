// === Game State Store — Simultaneous Planning + SPD Resolution ===

import { create } from 'zustand';
import * as THREE from 'three';
import { GameState, Hero, Tile, Player, HeroStats, TERRAIN_CONFIG, Unit, UnitType, UNIT_STATS, UNIT_COSTS, UNIT_CAPS, TimeOfDay, TIME_OF_DAY_CYCLE, HeroDebuffs, HERO_CONSUMPTION, SCOUT_CONSUMPTION, FARMER_CONSUMPTION, HERO_STARVATION_DEBUFFS, UNIT_STARVATION_DEBUFFS, Building } from './types';
import { generateGrid, findPath, calculateVisibility, octileDistance, chebyshevDistance } from './grid';

// === Helpers ===

function cloneGameState(gs: GameState): GameState {
  return {
    ...gs,
    grid: gs.grid.map(row => row.map(t => ({ ...t }))),
    players: Object.fromEntries(
      Object.entries(gs.players).map(([id, p]) => [id, {
        ...p,
        heroes: p.heroes.map(h => ({ ...h, position: { ...h.position }, stats: { ...h.stats }, baseStats: { ...h.baseStats }, debuffs: { ...h.debuffs } })) as [Hero, Hero],
        units: p.units.map(u => ({ ...u, position: { ...u.position }, stats: { ...u.stats }, baseStats: { ...u.baseStats }, debuffs: { ...u.debuffs }, resourcePouch: u.resourcePouch ? { ...u.resourcePouch } : undefined })),
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
    for (const unit of player.units) {
      if (!unit.alive || unit.id === excludeId) continue;
      occupied.add(`${unit.position.q},${unit.position.r}`);
    }
    for (const building of player.buildings) {
      occupied.add(`${building.position.q},${building.position.r}`);
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

function getAllUnits(gs: GameState): Unit[] {
  return Object.values(gs.players).flatMap(p => [...p.units]);
}

function findUnit(gs: GameState, unitId: string): Unit | undefined {
  return getAllUnits(gs).find(u => u.id === unitId);
}

function getEnemyTargets(gs: GameState, ownerId: string): Array<{ id: string; position: { q: number; r: number }; type: 'hero' | 'unit' }> {
  const targets: Array<{ id: string; position: { q: number; r: number }; type: 'hero' | 'unit' }> = [];
  for (const player of Object.values(gs.players)) {
    if (player.id === ownerId) continue;
    for (const hero of player.heroes) {
      if (hero.alive) targets.push({ id: hero.id, position: hero.position, type: 'hero' });
    }
    for (const unit of player.units) {
      if (unit.alive) targets.push({ id: unit.id, position: unit.position, type: 'unit' });
    }
  }
  return targets;
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
    const currentTile = grid[current.r][current.q];
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
      let stepCost = base * (isDiag ? 1.414 : 1);

      // Mountain ascension cost: +2 when moving FROM non-mountain TO mountain
      if (tile.terrain === 'mountain' && currentTile.terrain !== 'mountain') {
        stepCost += 2;
      }

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
      // Use Chebyshev distance: diagonal tiles count as 1 range
      const dist = chebyshevDistance(hq, hr, q, r);
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

/** Compute all tiles reachable by a unit within their MOV range */
function computeMoveTilesForUnit(gs: GameState, unit: Unit): Set<string> {
  const reachable = new Set<string>();
  const occupied = getOccupiedTiles(gs, unit.id);
  const grid = gs.grid;
  const mov = unit.stats.mov;
  const costs = new Map<string, number>();
  const queue: { q: number; r: number; cost: number }[] = [{ q: unit.position.q, r: unit.position.r, cost: 0 }];
  costs.set(`${unit.position.q},${unit.position.r}`, 0);
  const DIRS = [
    { dq: 0, dr: -1 }, { dq: 1, dr: -1 }, { dq: 1, dr: 0 }, { dq: 1, dr: 1 },
    { dq: 0, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: -1, dr: -1 },
  ];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentTile = grid[current.r][current.q];
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
      let stepCost = base * (isDiag ? 1.414 : 1);

      // Mountain ascension cost: +2 when moving FROM non-mountain TO mountain
      if (tile.terrain === 'mountain' && currentTile.terrain !== 'mountain') {
        stepCost += 2;
      }

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
    const prevTile = grid[prev.r][prev.q];
    const base = TERRAIN_CONFIG[tile.terrain].moveCost;
    const isDiag = prev.q !== cur.q && prev.r !== cur.r;
    let cost = base * (isDiag ? 1.414 : 1);

    // Mountain ascension cost: +2 when moving FROM non-mountain TO mountain
    if (tile.terrain === 'mountain' && prevTile.terrain !== 'mountain') {
      cost += 2;
    }

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

export type ActionMode = 'idle' | 'move' | 'attack' | 'gather' | 'place_tc';
export type GamePhase = 'planning' | 'resolution';

export interface QueuedAction {
  movePath?: { q: number; r: number }[];
  moveDest?: { q: number; r: number };
  attackTargetTile?: { q: number; r: number };
  gatherTile?: { q: number; r: number };
  depositTile?: { q: number; r: number }; // TC position for deposit action
  builtTC?: boolean; // True if hero built a TC this turn (consumes their action)
  trainUnit?: UnitType; // Unit type being trained from TC this turn
  // Track the order actions were queued: 'attack-first' means attack before move
  actionOrder?: 'move-first' | 'attack-first';
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

export interface GatherAnimation {
  heroId: string;
  q: number;
  r: number;
  resourceType: string;
  amount: number;
}

export interface AttackAnimation {
  attackerId: string;
  attackerPos: { q: number; r: number };
  targetPos: { q: number; r: number };
  type: 'melee' | 'ranged';
  progress: number; // 0-1
  damage: number | 'MISS';
}

interface GameStore {
  gameState: GameState | null;

  // Turn structure
  phase: GamePhase;
  round: number;
  day: number;
  roundInDay: number; // 1-12 (3 rounds per TOD phase)
  timeOfDay: TimeOfDay;
  timeOfDayIndex: number; // 0-3 for morn/noon/dusk/night
  planningPlayerId: string;
  queuedActions: Record<string, QueuedAction>;
  selectedHeroId: string | null;
  selectedBuildingId: string | null;

  // Resolution
  resolutionOrder: string[];
  resolutionIndex: number;
  resolutionLocked: boolean;

  // UI state
  actionMode: ActionMode;
  moveTiles: Set<string>;
  attackTiles: Set<string>;
  placementTiles: Set<string>; // Valid tiles for TC placement
  hoveredTile: { q: number; r: number } | null;
  hoveredHeroId: string | null; // For status panel - tracks hero being hovered
  currentPath: { q: number; r: number }[] | null;
  pendingTarget: { q: number; r: number } | null;
  targetHeroId: string | null;
  showEndTurnConfirm: boolean;
  showInventoryPanel: boolean; // New: state for inventory modal
  showBuildModal: boolean; // Build TC modal state
  showRecruitModal: boolean; // Recruit unit modal state
  selectedUnitId: string | null; // Selected Farmer unit for giving commands

  // Camera & animation
  cameraConfig: CameraConfig | null;
  cameraConfigVersion: number;
  moveAnimation: MoveAnimation | null;
  gatherAnimation: GatherAnimation | null;
  attackAnimation: AttackAnimation | null;
  onCameraArrived: (() => void) | null;
  missIndicator: { q: number; r: number } | null;
  damageIndicators: DamageIndicator[];

  // Actions
  initGame: (mapWidth?: number, mapHeight?: number) => void;
  selectHero: (heroId: string | null) => void;
  selectUnit: (unitId: string | null) => void; // Select a controllable unit (Farmer)
  selectBuilding: (buildingId: string | null) => void;
  setActionMode: (mode: ActionMode) => void;
  setHoveredTile: (q: number, r: number) => void;
  clearHover: () => void;
  handleTileClick: (q: number, r: number) => void;
  requestEndTurn: () => void;
  confirmEndTurn: () => void;
  cancelEndTurn: () => void;
  toggleInventory: (heroId: string) => void; // New: action to open/close inventory
  closeInventory: () => void; // Close inventory modal
  cancelAction: () => void; // Cancel current action mode without deselecting
  toggleBuildModal: () => void; // Toggle build modal
  closeBuildModal: () => void; // Close build modal
  toggleRecruitModal: () => void; // Toggle recruit modal
  closeRecruitModal: () => void; // Close recruit modal
  startTCPlacement: (heroId: string) => boolean; // Enter TC placement mode
  placeTownCenter: (heroId: string, q: number, r: number) => boolean; // Place TC at specific tile
  cancelPlacement: () => void; // Cancel placement mode
  trainUnit: (unitType: UnitType) => boolean; // Queue unit training from TC
  tickMoveAnimation: (delta: number) => boolean;
  processNextResolution: () => void;
  processScoutAI: (scoutId: string) => void; // Scout autonomous AI logic
  executeScoutAttack: (scoutId: string, targetTile: { q: number; r: number }) => void; // Scout attack execution
  processFarmerAction: (farmerId: string) => void; // Farmer queued action execution
  executeFarmerGather: (farmerId: string, targetTile: { q: number; r: number }) => void;
  executeFarmerDeposit: (farmerId: string) => void;
  executeAttackTile: (attackerId: string, targetTile: { q: number; r: number }) => void;
  executeGather: (heroId: string, targetTile: { q: number; r: number }) => void; // New: gather action
  executeDeposit: (heroId: string) => void; // Deposit resources to TC
  startResolution: () => void;
  startNewRound: () => void;
  updateVisibility: () => void;
  focusHero: (heroId: string) => void;
  focusPosition: (x: number, z: number) => void; // New: focus camera on map position
  deselectAll: () => void; // New: deselect hero and close modals
  depositResources: (heroId: string) => void; // New: deposit hero's pouch to player pool
  // Debug functions
  debugSpawnScout: () => void;
  debugSpawnFarmer: () => void;
  debugPlaceTC: () => void;
  debugAddResources: (amount: number) => void;
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
  day: 1,
  roundInDay: 1,
  timeOfDay: 'morn',
  timeOfDayIndex: 0,
  planningPlayerId: 'player1',
  queuedActions: {},
  selectedHeroId: null,
  selectedBuildingId: null,
  resolutionOrder: [],
  resolutionIndex: 0,
  resolutionLocked: false,
  actionMode: 'idle',
  moveTiles: new Set(),
  attackTiles: new Set(),
  placementTiles: new Set(),
  hoveredTile: null,
  hoveredHeroId: null,
  currentPath: null,
  pendingTarget: null,
  targetHeroId: null,
  showEndTurnConfirm: false,
  showInventoryPanel: false,
  showBuildModal: false,
  showRecruitModal: false,
  selectedUnitId: null,
  cameraConfig: null,
  cameraConfigVersion: 0,
  moveAnimation: null,
  gatherAnimation: null,
  attackAnimation: null,
  onCameraArrived: null,
  missIndicator: null,
  damageIndicators: [],

  initGame: (mapWidth = 12, mapHeight = 12) => {
    const grid = generateGrid(mapWidth, mapHeight, Date.now());
    const defaultHeroDebuffs: HeroDebuffs = {
      movPenalty: 0, spdPenalty: 0, rngPenalty: 0, atkPenalty: 0,
      hpPenaltyPercent: 0, daysWithoutFood: 0, daysWithoutWater: 0,
    };
    const makeHero = (template: typeof DEFAULT_HEROES[0], id: string, owner: string, q: number, r: number): Hero => ({
      id, name: template.name, lore: template.lore, archetype: template.archetype,
      stats: { ...template.stats }, baseStats: { ...template.stats }, debuffs: { ...defaultHeroDebuffs },
      position: { q, r }, alive: true, respawnTimer: 0, hasMoved: false, hasAttacked: false,
      inventory: {
        head: null, body: null, hands: null, feet: null, accessory: null,
        resourcePouch: {
          id: 'pouch', name: 'Resource Pouch', type: 'resourcePouch', maxResourceAmount: 8,
          resources: { food: 1, water: 1 }, // Heroes start with 1 food + 1 water
        },
      }, owner,
    });

    const players: Record<string, Player> = {
      player1: {
        id: 'player1', name: 'Player 1',
        heroes: [makeHero(DEFAULT_HEROES[0], 'p1-hero1', 'player1', 2, 2), makeHero(DEFAULT_HEROES[2], 'p1-hero2', 'player1', 3, 3)],
        units: [],
        resources: { wood: 0, stone: 0, iron: 0, food: 0, water: 0 }, hand: [], deck: [], buildings: [], actionsSubmitted: false,
      },
      player2: {
        id: 'player2', name: 'Player 2',
        heroes: [makeHero(DEFAULT_HEROES[1], 'p2-hero1', 'player2', mapWidth - 3, mapHeight - 3), makeHero(DEFAULT_HEROES[3], 'p2-hero2', 'player2', mapWidth - 4, mapHeight - 4)],
        units: [],
        resources: { wood: 0, stone: 0, iron: 0, food: 0, water: 0 }, hand: [], deck: [], buildings: [], actionsSubmitted: false,
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
      day: 1,
      roundInDay: 1,
      timeOfDay: 'morn',
      timeOfDayIndex: 0,
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

  toggleInventory: (heroId) => {
    const { selectedHeroId, showInventoryPanel, actionMode } = get();
    // If inventory is open for the selected hero, close it.
    // Otherwise, open it for the given hero (and select that hero if not already).
    if (showInventoryPanel && selectedHeroId === heroId) {
      set({ showInventoryPanel: false });
    } else {
      // Opening inventory cancels any pending action and hides toolbar
      set({
        showInventoryPanel: true,
        selectedHeroId: heroId,
        actionMode: 'idle',
        moveTiles: new Set(),
        attackTiles: new Set(),
        pendingTarget: null,
        targetHeroId: null,
        currentPath: null,
      });
    }
  },

  closeInventory: () => {
    set({ showInventoryPanel: false });
  },

  toggleBuildModal: () => {
    const { showBuildModal, actionMode } = get();
    if (showBuildModal) {
      set({ showBuildModal: false });
    } else {
      set({
        showBuildModal: true,
        actionMode: 'idle',
        moveTiles: new Set(),
        attackTiles: new Set(),
        pendingTarget: null,
        targetHeroId: null,
        currentPath: null,
      });
    }
  },

  closeBuildModal: () => {
    set({ showBuildModal: false });
  },

  toggleRecruitModal: () => {
    const { showRecruitModal } = get();
    if (showRecruitModal) {
      set({ showRecruitModal: false });
    } else {
      set({
        showRecruitModal: true,
        actionMode: 'idle',
        moveTiles: new Set(),
        attackTiles: new Set(),
        pendingTarget: null,
      });
    }
  },

  closeRecruitModal: () => {
    set({ showRecruitModal: false });
  },

  startTCPlacement: (heroId: string) => {
    const { gameState, planningPlayerId } = get();
    if (!gameState) return false;

    const hero = findHero(gameState, heroId);
    if (!hero || !hero.alive || hero.owner !== planningPlayerId) return false;

    const player = gameState.players[hero.owner];

    // Check one TC per player limit
    const existingTC = player.buildings.find(b => b.type === 'town_center');
    if (existingTC) return false;

    // Check resources in hero's pouch (1 wood + 1 stone + 1 food + 1 water)
    const pouch = hero.inventory.resourcePouch;
    if (!pouch?.resources) return false;
    const wood = pouch.resources.wood || 0;
    const stone = pouch.resources.stone || 0;
    const food = pouch.resources.food || 0;
    const water = pouch.resources.water || 0;
    if (wood < 1 || stone < 1 || food < 1 || water < 1) return false;

    // Compute valid placement tiles (adjacent to hero, not water, not occupied)
    const occupied = getOccupiedTiles(gameState, hero.id);
    const validTiles = new Set<string>();
    const DIRS = [
      { dq: 0, dr: -1 }, { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 0 },
      { dq: 1, dr: -1 }, { dq: 1, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: -1 },
    ];
    for (const dir of DIRS) {
      const nq = hero.position.q + dir.dq;
      const nr = hero.position.r + dir.dr;
      if (nr < 0 || nr >= gameState.mapHeight || nq < 0 || nq >= gameState.mapWidth) continue;
      const tile = gameState.grid[nr][nq];
      if (tile.terrain === 'water') continue;
      if (tile.buildingId) continue;
      const key = `${nq},${nr}`;
      if (occupied.has(key)) continue;
      validTiles.add(key);
    }

    if (validTiles.size === 0) return false;

    set({
      actionMode: 'place_tc',
      placementTiles: validTiles,
      showBuildModal: false,
      moveTiles: new Set(),
      attackTiles: new Set(),
      pendingTarget: null,
    });
    return true;
  },

  placeTownCenter: (heroId: string, q: number, r: number) => {
    const { gameState, placementTiles, planningPlayerId } = get();
    if (!gameState) return false;

    const tileKey = `${q},${r}`;
    if (!placementTiles.has(tileKey)) return false;

    const gs = cloneGameState(gameState);
    const hero = findHero(gs, heroId);
    if (!hero || !hero.alive || hero.owner !== planningPlayerId) return false;

    const player = gs.players[hero.owner];
    const pouch = hero.inventory.resourcePouch;
    if (!pouch?.resources) return false;

    // Deduct resources (1 wood + 1 stone + 1 food + 1 water)
    pouch.resources.wood = (pouch.resources.wood || 0) - 1;
    pouch.resources.stone = (pouch.resources.stone || 0) - 1;
    pouch.resources.food = (pouch.resources.food || 0) - 1;
    pouch.resources.water = (pouch.resources.water || 0) - 1;

    // Create the building
    const newBuilding = {
      id: `tc-${hero.owner}-${Date.now()}`,
      type: 'town_center' as const,
      position: { q, r },
      owner: hero.owner,
      hp: 100,
      maxHp: 100,
      constructedAt: gs.turn,
    };

    player.buildings.push(newBuilding);
    gs.grid[r][q].buildingId = newBuilding.id;

    // TC bonus: stockpile gains 1 food + 1 water when placed
    player.resources.food += 1;
    player.resources.water += 1;

    // Mark hero as having used their action this turn
    const newQueued = { ...get().queuedActions };
    newQueued[heroId] = { ...newQueued[heroId], builtTC: true };

    set({
      gameState: gs,
      queuedActions: newQueued,
      actionMode: 'idle',
      placementTiles: new Set(),
      pendingTarget: null,
    });
    return true;
  },

  cancelPlacement: () => {
    set({
      actionMode: 'idle',
      placementTiles: new Set(),
      pendingTarget: null,
    });
  },

  trainUnit: (unitType: UnitType) => {
    const { gameState, planningPlayerId, queuedActions } = get();
    if (!gameState) return false;

    const player = gameState.players[planningPlayerId];
    const tc = player.buildings.find(b => b.type === 'town_center');
    if (!tc) return false;

    // Check unit cap
    const currentCount = player.units.filter(u => u.unitType === unitType && u.alive).length;
    if (currentCount >= UNIT_CAPS[unitType]) return false;

    // Check resources
    const cost = UNIT_COSTS[unitType];
    if (player.resources.food < cost.food || player.resources.water < cost.water || player.resources.wood < cost.wood || player.resources.stone < cost.stone) return false;

    // Check if already training this turn (use TC id as key)
    const tcKey = `tc-${tc.id}`;
    if (queuedActions[tcKey]?.trainUnit) return false;

    // Check if TC was just built this turn (cooldown)
    const tcBuiltThisTurn = Object.values(queuedActions).some(q => q.builtTC);
    if (tcBuiltThisTurn) return false;

    // Queue the training action
    const newQueued = { ...queuedActions };
    newQueued[tcKey] = { trainUnit: unitType };

    // Deduct resources immediately (committed)
    const gs = cloneGameState(gameState);
    gs.players[planningPlayerId].resources.food -= cost.food;
    gs.players[planningPlayerId].resources.water -= cost.water;
    gs.players[planningPlayerId].resources.wood -= cost.wood;
    gs.players[planningPlayerId].resources.stone -= cost.stone;

    set({ gameState: gs, queuedActions: newQueued, showRecruitModal: false });
    return true;
  },

  cancelAction: () => {
    set({
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      placementTiles: new Set(),
      pendingTarget: null,
      targetHeroId: null,
      currentPath: null,
    });
  },

  selectHero: (heroId) => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') { set({ selectedHeroId: null, selectedUnitId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null, currentPath: null }); return; }
    if (!heroId) { set({ selectedHeroId: null, selectedUnitId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null, currentPath: null }); return; }
    const hero = findHero(gameState, heroId);
    if (!hero || hero.owner !== planningPlayerId || !hero.alive) { set({ selectedHeroId: null, actionMode: 'idle' }); return; }
    set({ selectedHeroId: heroId, selectedUnitId: null, selectedBuildingId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null, currentPath: null });
  },

  selectUnit: (unitId) => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') { set({ selectedUnitId: null, selectedHeroId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, currentPath: null }); return; }
    if (!unitId) { set({ selectedUnitId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, currentPath: null }); return; }
    const unit = findUnit(gameState, unitId);
    if (!unit || unit.owner !== planningPlayerId || !unit.alive) { set({ selectedUnitId: null, actionMode: 'idle' }); return; }
    // Only Farmers are controllable (Scouts are autonomous)
    if (unit.unitType !== 'farmer') { set({ selectedUnitId: null, actionMode: 'idle' }); return; }
    set({ selectedUnitId: unitId, selectedHeroId: null, selectedBuildingId: null, actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, currentPath: null });
  },

  selectBuilding: (buildingId) => {
    set({
      selectedBuildingId: buildingId,
      selectedHeroId: null,
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      pendingTarget: null,
    });
  },

  setActionMode: (mode) => {
    const { gameState, selectedHeroId, selectedUnitId, queuedActions } = get();
    if (!gameState) return;

    // Handle Farmer unit action mode
    if (selectedUnitId) {
      const unit = findUnit(gameState, selectedUnitId);
      if (!unit || unit.unitType !== 'farmer') return;
      const queued = queuedActions[selectedUnitId];
      // Only deposit locks out move (gather-then-move combo is allowed)
      const hasQueuedDeposit = !!queued?.depositTile;

      if (mode === 'move' && !queued?.moveDest && !hasQueuedDeposit) {
        // Compute move tiles for Farmer
        const moveTiles = computeMoveTilesForUnit(gameState, unit);
        set({ actionMode: 'move', moveTiles, attackTiles: new Set(), pendingTarget: null });
      } else if (mode === 'gather') {
        // Farmer gather - use move destination if queued, otherwise current position
        const gatherPos = queued?.moveDest || unit.position;
        // Farmer gather - double press to confirm
        if (get().actionMode === 'gather') {
          // Re-check if gather is already queued (prevent double-queue)
          const freshQueued = get().queuedActions[unit.id];
          if (freshQueued?.gatherTile) return;
          const tile = gameState.grid[gatherPos.r][gatherPos.q];
          if (tile.resourceType && (tile.resourceAmount || 0) > 0) {
            const newQueued = { ...get().queuedActions };
            newQueued[unit.id] = { ...newQueued[unit.id], gatherTile: { q: gatherPos.q, r: gatherPos.r } };
            set({ queuedActions: newQueued, actionMode: 'idle', pendingTarget: null });
          }
          return;
        }
        // Re-fetch to ensure we have fresh state
        const freshQueued = get().queuedActions[unit.id];
        if (freshQueued?.gatherTile) return;
        const tile = gameState.grid[gatherPos.r][gatherPos.q];
        const pouchTotal = unit.resourcePouch
          ? Object.values(unit.resourcePouch).reduce((sum, n) => sum + (n || 0), 0)
          : 0;
        const hasSpace = pouchTotal < unit.stats.pouchCapacity;
        if (tile.resourceType && (tile.resourceAmount || 0) > 0 && hasSpace) {
          set({ actionMode: 'gather', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: { q: gatherPos.q, r: gatherPos.r } });
        }
      } else {
        set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null });
      }
      return;
    }

    // Handle Hero action mode
    if (!selectedHeroId) return;
    const hero = findHero(gameState, selectedHeroId);
    if (!hero) return;
    const queued = queuedActions[selectedHeroId];

    // ACTION COMBO LOGIC:
    // - Deposit locks out ALL other actions (move/attack/gather)
    // - Gather and Attack are mutually exclusive
    // - Move can be added (unless already queued or deposit queued)
    const hasQueuedGather = !!queued?.gatherTile;
    const hasQueuedAttack = !!queued?.attackTargetTile;
    const hasQueuedDeposit = !!queued?.depositTile;

    // Deposit locks out all other actions
    if (hasQueuedDeposit) {
      set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
      return;
    }

    if (mode === 'move' && !queued?.moveDest) {
      // Move is always allowed if not already queued
      set({ actionMode: 'move', moveTiles: computeMoveTiles(gameState, hero), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
    } else if (mode === 'attack' && !queued?.attackTargetTile && !hasQueuedGather) {
      // Attack blocked only by gather (not by deposit)
      let attackHero = hero;
      if (queued?.moveDest) {
        attackHero = { ...hero, position: { ...queued.moveDest } };
      }
      set({ actionMode: 'attack', attackTiles: computeAttackTiles(gameState, attackHero), moveTiles: new Set(), pendingTarget: null, targetHeroId: null });
    } else if (mode === 'gather' && !hasQueuedAttack) {
      // Gather blocked only by attack (not by deposit or move)
      // Gather position: use move destination if move is queued, otherwise hero's current position
      const gatherPos = queued?.moveDest || hero.position;
      const tile = gameState.grid[gatherPos.r][gatherPos.q];
      const pouch = hero.inventory.resourcePouch;
      const currentTotal = pouch?.resources
        ? Object.values(pouch.resources).reduce((sum, n) => sum + (n || 0), 0)
        : (pouch?.resourceAmount || 0);
      const pouchMax = pouch?.maxResourceAmount || 8;
      const hasSpace = currentTotal < pouchMax;

      // If already in gather mode, confirm the gather (G twice)
      if (get().actionMode === 'gather') {
        if (tile.resourceType && (tile.resourceAmount || 0) > 0) {
          const newQueued = { ...get().queuedActions };
          newQueued[hero.id] = { ...newQueued[hero.id], gatherTile: { q: gatherPos.q, r: gatherPos.r } };
          set({ queuedActions: newQueued, actionMode: 'idle', pendingTarget: null });
        }
        return;
      }
      // First G press - enter gather mode if valid
      if (queued?.gatherTile) return; // Already queued

      if (tile.resourceType && (tile.resourceAmount || 0) > 0 && hasSpace) {
        set({ actionMode: 'gather', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: { q: gatherPos.q, r: gatherPos.r }, targetHeroId: null });
      } else {
        set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
      }
    } else {
      set({ actionMode: 'idle', moveTiles: new Set(), attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
    }
  },

  setHoveredTile: (q, r) => {
    const { gameState, selectedHeroId, actionMode, planningPlayerId } = get();
    // Track hovered hero for status panel - always set this regardless of action mode
    const heroOnTile = gameState ? getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r) : null;
    const newHoveredHeroId = heroOnTile?.id || null;

    if (!gameState || !selectedHeroId) { set({ hoveredTile: { q, r }, hoveredHeroId: newHoveredHeroId }); return; }
    const hero = findHero(gameState, selectedHeroId);
    if (!hero) { set({ hoveredTile: { q, r }, hoveredHeroId: newHoveredHeroId }); return; }

    if (actionMode === 'move') {
      const occupied = getOccupiedTiles(gameState, hero.id);
      const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, Infinity, occupied);
      const truncated = fullPath ? truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov) : null;
      set({ hoveredTile: { q, r }, hoveredHeroId: newHoveredHeroId, currentPath: truncated });
    } else if (actionMode === 'attack') {
      const enemy = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner !== hero.owner);
      set({ hoveredTile: { q, r }, hoveredHeroId: newHoveredHeroId, currentPath: null, targetHeroId: enemy?.id || null });
    } else if (actionMode === 'gather') {
      // No hover logic for gather, just check if it's the hero's tile
      const isHeroTile = hero.position.q === q && hero.position.r === r;
      set({ hoveredTile: isHeroTile ? { q, r } : null, hoveredHeroId: newHoveredHeroId, currentPath: null });
    } else {
      set({ hoveredTile: { q, r }, hoveredHeroId: newHoveredHeroId, currentPath: null });
    }
  },

  clearHover: () => set({ hoveredTile: null, hoveredHeroId: null, currentPath: null }),

  handleTileClick: (q, r) => {
    const { gameState, selectedHeroId, selectedUnitId, actionMode, pendingTarget, moveAnimation, phase, planningPlayerId, showInventoryPanel } = get();
    if (!gameState || phase !== 'planning' || moveAnimation || showInventoryPanel) return;

    // Handle farmer unit tile clicks
    if (selectedUnitId) {
      const unit = findUnit(gameState, selectedUnitId);
      if (!unit || unit.unitType !== 'farmer') return;
      const tileKey = `${q},${r}`;

      if (actionMode === 'move') {
        if (!get().moveTiles.has(tileKey)) {
          set({ actionMode: 'idle', moveTiles: new Set(), pendingTarget: null, currentPath: null });
          return;
        }
        if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
          const occupied = getOccupiedTiles(gameState, unit.id);
          const fullPath = findPath(gameState.grid, unit.position.q, unit.position.r, q, r, Infinity, occupied);
          if (!fullPath || fullPath.length < 2) return;
          const truncated = truncatePathToMovement(fullPath, gameState.grid, unit.stats.mov);
          if (!truncated || truncated.length < 2) return;
          const dest = truncated[truncated.length - 1];

          const newQueued = { ...get().queuedActions };
          newQueued[unit.id] = { ...newQueued[unit.id], movePath: truncated, moveDest: dest };
          set({ queuedActions: newQueued, actionMode: 'idle', moveTiles: new Set(), pendingTarget: null, currentPath: null });
        } else {
          set({ pendingTarget: { q, r } });
        }
      } else if (actionMode === 'gather') {
        // Allow gather at current position OR move destination
        const queued = get().queuedActions[unit.id];
        const gatherPos = queued?.moveDest || unit.position;
        if (gatherPos.q !== q || gatherPos.r !== r) {
          set({ actionMode: 'idle', pendingTarget: null });
          return;
        }
        const tile = gameState.grid[gatherPos.r][gatherPos.q];
        if (!tile.resourceType || (tile.resourceAmount || 0) <= 0) {
          set({ actionMode: 'idle', pendingTarget: null });
          return;
        }
        if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
          const newQueued = { ...get().queuedActions };
          newQueued[unit.id] = { ...newQueued[unit.id], gatherTile: { q, r } };
          set({ queuedActions: newQueued, actionMode: 'idle', pendingTarget: null });
        } else {
          set({ pendingTarget: { q, r } });
        }
      }
      return;
    }

    if (!selectedHeroId) {
      const heroOnTile = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner === planningPlayerId);
      if (heroOnTile) { get().selectHero(heroOnTile.id); return; }
      // Also check for owned farmers on the tile
      const farmerOnTile = getAllUnits(gameState).find(u => u.alive && u.unitType === 'farmer' && u.position.q === q && u.position.r === r && u.owner === planningPlayerId);
      if (farmerOnTile) { get().selectUnit(farmerOnTile.id); return; }
      return;
    }

    const hero = findHero(gameState, selectedHeroId);
    if (!hero) return;
    const tileKey = `${q},${r}`;

    if (actionMode === 'move') {
      if (!get().moveTiles.has(tileKey)) {
        // Clicked non-targetable tile - cancel action and return to idle (shows toolbar)
        set({ actionMode: 'idle', moveTiles: new Set(), pendingTarget: null, currentPath: null });
        return;
      }
      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        const occupied = getOccupiedTiles(gameState, hero.id);
        const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, Infinity, occupied);
        if (!fullPath || fullPath.length < 2) return;
        const truncated = truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov);
        if (!truncated || truncated.length < 2) return;
        const dest = truncated[truncated.length - 1];

        const newQueued = { ...get().queuedActions };
        const existing = newQueued[hero.id] || {};
        // If attack was already queued, this is attack-first (attack then move)
        const actionOrder = existing.attackTargetTile ? 'attack-first' : 'move-first';
        newQueued[hero.id] = { ...existing, movePath: truncated, moveDest: dest, actionOrder };

        set({ queuedActions: newQueued, actionMode: 'idle', moveTiles: new Set(), pendingTarget: null, currentPath: null });
      } else {
        set({ pendingTarget: { q, r } });
      }
    } else if (actionMode === 'attack') {
      if (!get().attackTiles.has(tileKey)) {
        // Clicked non-targetable tile - cancel action and return to idle (shows toolbar)
        set({ actionMode: 'idle', attackTiles: new Set(), pendingTarget: null, targetHeroId: null });
        return;
      }
      const enemy = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner !== hero.owner);

      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        const newQueued = { ...get().queuedActions };
        const existing = newQueued[hero.id] || {};
        // If move was already queued, keep move-first; otherwise this is attack-first
        const actionOrder = existing.moveDest ? 'move-first' : 'attack-first';
        newQueued[hero.id] = { ...existing, attackTargetTile: { q, r }, actionOrder };

        set({ queuedActions: newQueued, actionMode: 'idle', attackTiles: new Set(), pendingTarget: null, targetHeroId: enemy?.id || null });
      } else {
        set({ pendingTarget: { q, r }, targetHeroId: enemy?.id || null });
      }
    } else if (actionMode === 'gather') {
      // Gather position: use move destination if queued, otherwise hero's current position
      const queued = get().queuedActions[hero.id];
      const gatherPos = queued?.moveDest || hero.position;
      const tile = gameState.grid[gatherPos.r][gatherPos.q];
      // If clicking anywhere other than gather position, cancel
      if (gatherPos.q !== q || gatherPos.r !== r) {
        set({ actionMode: 'idle', pendingTarget: null });
        return;
      }
      if (!tile.resourceType || (tile.resourceAmount || 0) <= 0) {
        set({ actionMode: 'idle', pendingTarget: null });
        return;
      }

      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        // Confirmed gather at gather position (current pos or move destination)
        const newQueued = { ...get().queuedActions };
        newQueued[hero.id] = { ...newQueued[hero.id], gatherTile: { q, r } };

        set({ queuedActions: newQueued, actionMode: 'idle', pendingTarget: null });
      } else {
        // First click on gather position
        set({ pendingTarget: { q, r } });
      }
    } else if (actionMode === 'place_tc') {
      const { placementTiles } = get();
      if (!placementTiles.has(tileKey)) {
        // Clicked outside valid placement area - cancel
        get().cancelPlacement();
        return;
      }
      if (pendingTarget && pendingTarget.q === q && pendingTarget.r === r) {
        // Confirmed placement
        get().placeTownCenter(hero.id, q, r);
      } else {
        // First click - set pending
        set({ pendingTarget: { q, r } });
      }
    } else {
      const heroOnTile = getAllHeroes(gameState).find(h => h.alive && h.position.q === q && h.position.r === r && h.owner === planningPlayerId);
      if (heroOnTile) {
        get().selectHero(heroOnTile.id);
      } else if (selectedHeroId) {
        // Clicking on empty tile deselects current hero
        get().deselectAll();
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

    // Heroes with queued actions
    const allHeroes = getAllHeroes(gameState).filter(h => h.alive);
    const heroesWithActions = allHeroes
      .filter(h => queuedActions[h.id]?.moveDest || queuedActions[h.id]?.attackTargetTile || queuedActions[h.id]?.gatherTile || queuedActions[h.id]?.depositTile);

    // Scouts always act (autonomous AI), Farmers act when they have queued actions
    const allUnits = getAllUnits(gameState).filter(u => u.alive);
    const scouts = allUnits.filter(u => u.unitType === 'scout');
    const farmersWithActions = allUnits.filter(u =>
      u.unitType === 'farmer' && (queuedActions[u.id]?.moveDest || queuedActions[u.id]?.gatherTile || queuedActions[u.id]?.depositTile)
    );

    // Combine and sort by SPD
    type Actor = { id: string; spd: number; type: 'hero' | 'scout' | 'farmer' };
    const actors: Actor[] = [
      ...heroesWithActions.map(h => ({ id: h.id, spd: h.stats.spd, type: 'hero' as const })),
      ...scouts.map(s => ({ id: s.id, spd: s.stats.spd, type: 'scout' as const })),
      ...farmersWithActions.map(f => ({ id: f.id, spd: f.stats.spd, type: 'farmer' as const })),
    ];
    actors.sort((a, b) => b.spd - a.spd);
    const order = actors.map(a => a.id);

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

    const actorId = resolutionOrder[resolutionIndex];

    // Check if this is a Scout (autonomous unit)
    const unit = findUnit(gameState, actorId);
    if (unit && unit.unitType === 'scout' && unit.alive) {
      get().processScoutAI(actorId);
      return;
    }

    // Check if this is a Farmer (controllable unit)
    if (unit && unit.unitType === 'farmer' && unit.alive) {
      get().processFarmerAction(actorId);
      return;
    }

    // Otherwise, it's a hero with queued action
    const hero = findHero(gameState, actorId);
    const action = queuedActions[actorId];

    if (!hero || !hero.alive || !action) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    set({
      selectedHeroId: actorId,
      ...makeCameraConfig(new THREE.Vector3(hero.position.q, 0, hero.position.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          const isAttackFirst = action.actionOrder === 'attack-first';
          const hasMove = action.movePath && action.movePath.length > 1;
          const hasAttack = !!action.attackTargetTile;
          const hasGather = !!action.gatherTile;

          // Check if gather is at current position (gather first) or at move destination (move first then gather)
          const gatherAtCurrentPos = hasGather &&
            action.gatherTile!.q === hero.position.q &&
            action.gatherTile!.r === hero.position.r;

          // Determine first action based on order
          if (isAttackFirst && hasAttack) {
            // Attack first, then move after (handled in executeAttackTile callback)
            get().executeAttackTile(actorId, action.attackTargetTile!);
          } else if (gatherAtCurrentPos) {
            // Gather at current position first, then move after (handled in executeGather callback)
            get().executeGather(actorId, action.gatherTile!);
          } else if (hasMove) {
            // Move first (attack/gather at destination will be handled after move completes)
            set({
              moveAnimation: {
                heroId: hero.id,
                path: action.movePath!,
                currentIndex: 0,
                progress: 0,
              },
            });
          } else if (hasAttack) {
            get().executeAttackTile(actorId, action.attackTargetTile!);
          } else if (hasGather) {
            get().executeGather(actorId, action.gatherTile!);
          } else if (action.depositTile) {
            get().executeDeposit(actorId);
          } else {
            set({ resolutionIndex: resolutionIndex + 1 });
            setTimeout(() => get().processNextResolution(), 500);
          }
        }, 400);
      },
    });
  },

  processScoutAI: (scoutId: string) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const scout = findUnit(gs, scoutId);
    if (!scout || !scout.alive || scout.unitType !== 'scout') {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    // Find all enemy targets
    const enemies = getEnemyTargets(gs, scout.owner);

    // SHARED AWARENESS: Check if any allied unit (hero, scout, farmer) has vision on enemies
    const alliedUnits: Array<{ position: { q: number; r: number }; vis: number }> = [];
    const player = gs.players[scout.owner];
    for (const hero of player.heroes) {
      if (hero.alive) alliedUnits.push({ position: hero.position, vis: hero.stats.vis });
    }
    for (const unit of player.units) {
      if (unit.alive) alliedUnits.push({ position: unit.position, vis: unit.stats.vis });
    }

    // Check for visible enemies - scout's own vision OR allied unit vision (shared awareness)
    let visibleEnemy: { id: string; position: { q: number; r: number }; dist: number } | null = null;
    for (const enemy of enemies) {
      // Check scout's own vision
      const scoutDist = octileDistance(scout.position.q, scout.position.r, enemy.position.q, enemy.position.r);
      if (scoutDist <= scout.stats.vis) {
        if (!visibleEnemy || scoutDist < visibleEnemy.dist) {
          visibleEnemy = { ...enemy, dist: scoutDist };
        }
        continue;
      }
      // Check allied unit vision (shared awareness)
      for (const ally of alliedUnits) {
        const allyDist = octileDistance(ally.position.q, ally.position.r, enemy.position.q, enemy.position.r);
        if (allyDist <= ally.vis) {
          const distFromScout = octileDistance(scout.position.q, scout.position.r, enemy.position.q, enemy.position.r);
          if (!visibleEnemy || distFromScout < visibleEnemy.dist) {
            visibleEnemy = { ...enemy, dist: distFromScout };
          }
          break;
        }
      }
    }

    // Update LKP (Last Known Position)
    if (visibleEnemy) {
      scout.lastKnownPosition = { ...visibleEnemy.position };
      scout.lkpTurnsRemaining = 3;
      scout.currentTargetId = visibleEnemy.id;
    } else if (scout.lkpTurnsRemaining && scout.lkpTurnsRemaining > 0) {
      scout.lkpTurnsRemaining--;
      if (scout.lkpTurnsRemaining <= 0) {
        scout.lastKnownPosition = undefined;
        scout.currentTargetId = undefined;
      }
    }

    // Determine target position
    let targetPos: { q: number; r: number } | null = null;
    if (visibleEnemy) {
      targetPos = visibleEnemy.position;
    } else if (scout.lastKnownPosition) {
      targetPos = scout.lastKnownPosition;
    }

    // Calculate path to target or explore toward enemy zone
    const occupied = getOccupiedTiles(gs, scoutId);
    let movePath: { q: number; r: number }[] = [];
    let attackTarget: { q: number; r: number } | null = null;

    // TACTICAL DECISION MAKING
    // Calculate survival metrics for combat decisions
    const calculateSurvival = (attacker: { atk: number; hp: number; def: number }, defender: { atk: number; hp: number; def: number }) => {
      const damageToDefender = Math.max(1, attacker.atk - defender.def);
      const damageToAttacker = Math.max(1, defender.atk - attacker.def);
      const hitsToKill = Math.ceil(defender.hp / damageToDefender);
      const hitsToDie = Math.ceil(attacker.hp / damageToAttacker);
      return { hitsToKill, hitsToDie, canWin: hitsToDie > hitsToKill };
    };

    // Get enemy stats for survival calculation
    let enemyStats: { atk: number; hp: number; def: number } | null = null;
    if (visibleEnemy) {
      const enemyHero = getAllHeroes(gs).find(h => h.id === visibleEnemy.id && h.alive);
      const enemyUnit = getAllUnits(gs).find(u => u.id === visibleEnemy.id && u.alive);
      if (enemyHero) {
        enemyStats = { atk: enemyHero.stats.atk, hp: enemyHero.stats.hp, def: enemyHero.stats.def };
      } else if (enemyUnit) {
        enemyStats = { atk: enemyUnit.stats.atk, hp: enemyUnit.stats.hp, def: enemyUnit.stats.def };
      }
    }

    // Count nearby enemies for outnumbered check
    const nearbyEnemies = enemies.filter(e =>
      octileDistance(scout.position.q, scout.position.r, e.position.q, e.position.r) <= scout.stats.vis
    );
    const isOutnumbered = nearbyEnemies.length > 1;

    // Determine tactical decision
    type TacticalDecision = 'stand_and_fight' | 'hit_and_run' | 'engage' | 'retreat';
    let tacticalDecision: TacticalDecision = 'engage';

    // Check if enemy is in attack range from current position
    const currentAttackDist = visibleEnemy
      ? octileDistance(scout.position.q, scout.position.r, visibleEnemy.position.q, visibleEnemy.position.r)
      : Infinity;
    const inAttackRange = currentAttackDist <= scout.stats.rng;

    // FALLBACK: If enemy is in attack range but we couldn't get their stats, still attack
    if (visibleEnemy && inAttackRange && !enemyStats) {
      tacticalDecision = 'stand_and_fight';
    } else if (visibleEnemy && enemyStats) {
      const survival = calculateSurvival(
        { atk: scout.stats.atk, hp: scout.stats.hp, def: scout.stats.def },
        enemyStats
      );

      const hpPercent = scout.stats.hp / scout.stats.maxHp;

      if (inAttackRange) {
        if (survival.canWin && !isOutnumbered) {
          // Can kill before dying and not outnumbered -> stand and fight
          tacticalDecision = 'stand_and_fight';
        } else if (hpPercent < 0.3 || (isOutnumbered && hpPercent < 0.5)) {
          // Low health or outnumbered with moderate health -> hit and run
          tacticalDecision = 'hit_and_run';
        } else if (!survival.canWin && survival.hitsToDie <= 2) {
          // Will die in 1-2 hits -> hit and run
          tacticalDecision = 'hit_and_run';
        } else {
          // Default: stand and fight if in range
          tacticalDecision = 'stand_and_fight';
        }
      } else {
        // Not in range - engage normally
        tacticalDecision = 'engage';
      }
    }

    // Execute tactical decision
    if (tacticalDecision === 'stand_and_fight' && visibleEnemy) {
      // Stay in place and attack
      attackTarget = visibleEnemy.position;
      movePath = [];
    } else if (tacticalDecision === 'hit_and_run' && visibleEnemy) {
      // Attack first, then retreat
      attackTarget = visibleEnemy.position;

      // Find retreat direction (away from enemy)
      const retreatDir = {
        dq: scout.position.q - visibleEnemy.position.q,
        dr: scout.position.r - visibleEnemy.position.r
      };
      const mag = Math.sqrt(retreatDir.dq ** 2 + retreatDir.dr ** 2) || 1;
      retreatDir.dq = Math.round(retreatDir.dq / mag);
      retreatDir.dr = Math.round(retreatDir.dr / mag);

      // Find best retreat tile
      const retreatTiles: { q: number; r: number; score: number }[] = [];
      for (let dq = -scout.stats.mov; dq <= scout.stats.mov; dq++) {
        for (let dr = -scout.stats.mov; dr <= scout.stats.mov; dr++) {
          const nq = scout.position.q + dq;
          const nr = scout.position.r + dr;
          if (nq >= 0 && nq < gs.mapWidth && nr >= 0 && nr < gs.mapHeight) {
            const tile = gs.grid[nr][nq];
            const tileKey = `${nq},${nr}`;
            if (tile.terrain !== 'water' && !occupied.has(tileKey)) {
              // Score based on distance from enemy and alignment with retreat direction
              const enemyDist = octileDistance(nq, nr, visibleEnemy.position.q, visibleEnemy.position.r);
              const alignScore = (dq * retreatDir.dq + dr * retreatDir.dr);
              retreatTiles.push({ q: nq, r: nr, score: enemyDist * 2 + alignScore });
            }
          }
        }
      }

      if (retreatTiles.length > 0) {
        retreatTiles.sort((a, b) => b.score - a.score);
        const retreatDest = retreatTiles[0];
        const retreatPath = findPath(gs.grid, scout.position.q, scout.position.r, retreatDest.q, retreatDest.r, scout.stats.mov + 2, occupied);
        if (retreatPath && retreatPath.length > 1) {
          movePath = truncatePathToMovement(retreatPath, gs.grid, scout.stats.mov);
        }
      }
    } else if (!attackTarget && targetPos) {
      // Path toward target
      const fullPath = findPath(
        gs.grid,
        scout.position.q, scout.position.r,
        targetPos.q, targetPos.r,
        scout.stats.mov + 10, // Extra range for pathfinding
        occupied
      );

      if (fullPath && fullPath.length > 1) {
        // Truncate to MOV stat (use full extent)
        movePath = truncatePathToMovement(fullPath, gs.grid, scout.stats.mov);

        // PATH ENGAGEMENT: Check for enemies along the path and stop to engage them
        // This prevents scouts from running past enemies
        for (let i = 1; i < movePath.length; i++) {
          const pathTile = movePath[i];
          for (const enemy of enemies) {
            const distToEnemy = octileDistance(pathTile.q, pathTile.r, enemy.position.q, enemy.position.r);
            if (distToEnemy <= scout.stats.rng) {
              // Found enemy in range from this path tile - truncate path here and engage
              movePath = movePath.slice(0, i + 1);
              attackTarget = enemy.position;
              break;
            }
          }
          if (attackTarget) break;
        }

        // If no path engagement, check if enemy is in attack range from final position
        if (!attackTarget) {
          const finalPos = movePath[movePath.length - 1];
          if (visibleEnemy) {
            const attackDist = octileDistance(finalPos.q, finalPos.r, visibleEnemy.position.q, visibleEnemy.position.r);
            if (attackDist <= scout.stats.rng) {
              attackTarget = visibleEnemy.position;
            }
          }
        }
      }
    } else if (tacticalDecision === 'engage' || !visibleEnemy) {
      // SMART EXPLORATION: Move toward enemy starting zone with edge awareness
      // Player1 starts near (2,2), Player2 starts near (mapWidth-3, mapHeight-3)
      const enemyZone = scout.owner === 'player1'
        ? { q: gs.mapWidth - 3, r: gs.mapHeight - 3 }
        : { q: 2, r: 2 };
      const mapCenter = { q: gs.mapWidth / 2, r: gs.mapHeight / 2 };

      // Compute all reachable tiles within MOV range (use full extent)
      const reachableTiles = computeMoveTilesForUnit(gs, scout);
      const reachableList = Array.from(reachableTiles).map(key => {
        const [q, r] = key.split(',').map(Number);
        return { q, r };
      });

      if (reachableList.length > 0) {
        // Score each tile: prefer enemy direction, avoid edges, slight randomness
        const scoredTiles = reachableList.map(tile => {
          let score = 0;
          // Distance to enemy zone (closer = better)
          const enemyDist = octileDistance(tile.q, tile.r, enemyZone.q, enemyZone.r);
          const currentEnemyDist = octileDistance(scout.position.q, scout.position.r, enemyZone.q, enemyZone.r);
          score += (currentEnemyDist - enemyDist) * 3; // Reward moving toward enemy

          // Distance from edges (penalize being near map boundaries)
          const edgeMargin = 2;
          const distFromEdge = Math.min(
            tile.q, tile.r,
            gs.mapWidth - 1 - tile.q,
            gs.mapHeight - 1 - tile.r
          );
          if (distFromEdge < edgeMargin) {
            score -= (edgeMargin - distFromEdge) * 2; // Penalize edges
          }

          // Slight preference toward map center when exploring
          const centerDist = octileDistance(tile.q, tile.r, mapCenter.q, mapCenter.r);
          const currentCenterDist = octileDistance(scout.position.q, scout.position.r, mapCenter.q, mapCenter.r);
          if (currentCenterDist > centerDist) {
            score += 1; // Small bonus for moving toward center
          }

          // Add small random factor for variety
          score += Math.random() * 2;

          return { tile, score };
        });

        // Pick the best-scoring tile
        scoredTiles.sort((a, b) => b.score - a.score);
        const bestDest = scoredTiles[0].tile;

        // Pathfind to destination
        const fullPath = findPath(
          gs.grid,
          scout.position.q, scout.position.r,
          bestDest.q, bestDest.r,
          scout.stats.mov + 2,
          occupied
        );

        if (fullPath && fullPath.length > 1) {
          movePath = truncatePathToMovement(fullPath, gs.grid, scout.stats.mov);

          // PATH ENGAGEMENT during exploration: Check for enemies along the path
          for (let i = 1; i < movePath.length; i++) {
            const pathTile = movePath[i];
            for (const enemy of enemies) {
              const distToEnemy = octileDistance(pathTile.q, pathTile.r, enemy.position.q, enemy.position.r);
              if (distToEnemy <= scout.stats.rng) {
                // Found enemy in range - truncate path and engage
                movePath = movePath.slice(0, i + 1);
                attackTarget = enemy.position;
                break;
              }
            }
            if (attackTarget) break;
          }
        }
      }
    }

    // FALLBACK: If no movement path found and not attacking, find any adjacent passable tile
    if (movePath.length <= 1 && !attackTarget) {
      const adjacentOffsets = [
        { dq: 1, dr: 0 }, { dq: -1, dr: 0 }, { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
        { dq: 1, dr: 1 }, { dq: 1, dr: -1 }, { dq: -1, dr: 1 }, { dq: -1, dr: -1 }
      ];
      const shuffled = adjacentOffsets.sort(() => Math.random() - 0.5);
      for (const offset of shuffled) {
        const nq = scout.position.q + offset.dq;
        const nr = scout.position.r + offset.dr;
        if (nq >= 0 && nq < gs.mapWidth && nr >= 0 && nr < gs.mapHeight) {
          const tile = gs.grid[nr][nq];
          const tileKey = `${nq},${nr}`;
          if (tile.terrain !== 'water' && !occupied.has(tileKey)) {
            movePath = [{ q: scout.position.q, r: scout.position.r }, { q: nq, r: nr }];
            break;
          }
        }
      }
    }

    // Update scout in game state
    const playerIdx = Object.keys(gs.players).find(pid => gs.players[pid].units.some(u => u.id === scoutId));
    if (playerIdx) {
      const unitIdx = gs.players[playerIdx].units.findIndex(u => u.id === scoutId);
      if (unitIdx >= 0) {
        gs.players[playerIdx].units[unitIdx] = scout;
      }
    }

    // Execute Scout action with camera focus
    // For hit-and-run: attack first, then retreat (store retreat path for after attack)
    const isHitAndRun = tacticalDecision === 'hit_and_run' && attackTarget && movePath.length > 1;

    set({
      gameState: gs,
      selectedHeroId: null,
      ...makeCameraConfig(new THREE.Vector3(scout.position.q, 0, scout.position.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          if (isHitAndRun) {
            // HIT-AND-RUN: Attack first, then retreat
            // Store retreat path in queued actions for after attack
            const qa = { ...get().queuedActions };
            qa[scoutId] = { movePath: movePath, actionOrder: 'attack-first' };
            set({ queuedActions: qa });
            get().executeScoutAttack(scoutId, attackTarget!);
          } else if (movePath.length > 1) {
            // Normal move (then attack after if target)
            set({
              moveAnimation: {
                heroId: scoutId,
                path: movePath,
                currentIndex: 0,
                progress: 0,
              },
            });
            if (attackTarget) {
              const qa = { ...get().queuedActions };
              qa[scoutId] = { attackTargetTile: attackTarget };
              set({ queuedActions: qa });
            }
          } else if (attackTarget) {
            get().executeScoutAttack(scoutId, attackTarget);
          } else {
            set({ resolutionIndex: get().resolutionIndex + 1 });
            setTimeout(() => get().processNextResolution(), 500);
          }
        }, 400);
      },
    });
  },

  executeScoutAttack: (scoutId: string, targetTile: { q: number; r: number }) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const scout = findUnit(gs, scoutId);
    if (!scout || !scout.alive) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    // Find target at tile (could be hero or unit)
    let target: { id: string; hp: number; def: number; owner: string; position: { q: number; r: number } } | null = null;

    const targetHero = getAllHeroes(gs).find(
      h => h.alive && h.position.q === targetTile.q && h.position.r === targetTile.r && h.owner !== scout.owner
    );
    if (targetHero) {
      target = { id: targetHero.id, hp: targetHero.stats.hp, def: targetHero.stats.def, owner: targetHero.owner, position: targetHero.position };
    } else {
      const targetUnit = getAllUnits(gs).find(
        u => u.alive && u.position.q === targetTile.q && u.position.r === targetTile.r && u.owner !== scout.owner
      );
      if (targetUnit) {
        target = { id: targetUnit.id, hp: targetUnit.stats.hp, def: targetUnit.stats.def, owner: targetUnit.owner, position: targetUnit.position };
      }
    }

    if (!target) {
      // Target moved or died
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 500);
      return;
    }

    // Calculate damage
    const damage = Math.max(1, scout.stats.atk - target.def);
    const newHp = Math.max(0, target.hp - damage);

    // Apply damage
    const targetHeroRef = getAllHeroes(gs).find(h => h.id === target!.id);
    const targetUnitRef = getAllUnits(gs).find(u => u.id === target!.id);

    if (targetHeroRef) {
      targetHeroRef.stats.hp = newHp;
      if (newHp <= 0) {
        targetHeroRef.alive = false;
        targetHeroRef.respawnTimer = 2;
      }
    } else if (targetUnitRef) {
      targetUnitRef.stats.hp = newHp;
      if (newHp <= 0) {
        targetUnitRef.alive = false; // Permadeath for units
      }
    }

    // Add damage indicator
    const newIndicator: DamageIndicator = {
      id: `dmg-${Date.now()}`,
      q: targetTile.q,
      r: targetTile.r,
      amount: damage,
      color: '#ff8844',
    };

    set({
      gameState: gs,
      damageIndicators: [...get().damageIndicators, newIndicator],
    });

    // Check for hit-and-run retreat path
    const action = get().queuedActions[scoutId];
    const hasRetreatPath = action?.movePath && action.movePath.length > 1 && action.actionOrder === 'attack-first';

    setTimeout(() => {
      if (hasRetreatPath && scout.alive) {
        // Execute retreat movement after attack
        set({
          moveAnimation: {
            heroId: scoutId,
            path: action.movePath!,
            currentIndex: 0,
            progress: 0,
          },
        });
        // Clear the queued action so we don't attack again after retreat
        const qa = { ...get().queuedActions };
        delete qa[scoutId];
        set({ queuedActions: qa });
      } else {
        set({ resolutionIndex: resolutionIndex + 1 });
        setTimeout(() => get().processNextResolution(), 500);
      }
    }, 600);
  },

  processFarmerAction: (farmerId: string) => {
    const { gameState, queuedActions, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const farmer = findUnit(gs, farmerId);
    const action = queuedActions[farmerId];

    if (!farmer || !farmer.alive || farmer.unitType !== 'farmer' || !action) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    set({
      selectedHeroId: null,
      ...makeCameraConfig(new THREE.Vector3(farmer.position.q, 0, farmer.position.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          const hasMove = action.movePath && action.movePath.length > 1;
          const hasGather = !!action.gatherTile;

          // Check if gather is at current position (gather first) or at move destination (move first)
          const gatherAtCurrentPos = hasGather &&
            action.gatherTile!.q === farmer.position.q &&
            action.gatherTile!.r === farmer.position.r;

          if (gatherAtCurrentPos) {
            // Gather at current position first, then move after (handled in executeFarmerGather callback)
            get().executeFarmerGather(farmerId, action.gatherTile!);
          } else if (hasMove) {
            // Move first (gather at destination will be handled after move completes in tickMoveAnimation)
            set({
              moveAnimation: {
                heroId: farmerId,
                path: action.movePath!,
                currentIndex: 0,
                progress: 0,
              },
            });
          } else if (hasGather) {
            get().executeFarmerGather(farmerId, action.gatherTile!);
          } else if (action.depositTile) {
            get().executeFarmerDeposit(farmerId);
          } else {
            set({ resolutionIndex: get().resolutionIndex + 1 });
            setTimeout(() => get().processNextResolution(), 500);
          }
        }, 400);
      },
    });
  },

  executeFarmerGather: (farmerId: string, targetTile: { q: number; r: number }) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const farmer = findUnit(gs, farmerId);
    if (!farmer || !farmer.alive || farmer.unitType !== 'farmer') {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    const tile = gs.grid[targetTile.r][targetTile.q];
    if (!tile.resourceType || !tile.resourceAmount || tile.resourceAmount <= 0) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    // Farmer gathers 2-3 resources
    const gatherAmount = Math.min(
      Math.floor(Math.random() * 2) + 2, // 2-3
      tile.resourceAmount,
      farmer.stats.pouchCapacity - Object.values(farmer.resourcePouch || {}).reduce((sum, n) => sum + (n || 0), 0)
    );

    if (gatherAmount <= 0) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    tile.resourceAmount -= gatherAmount;
    if (!farmer.resourcePouch) farmer.resourcePouch = {};
    farmer.resourcePouch[tile.resourceType] = (farmer.resourcePouch[tile.resourceType] || 0) + gatherAmount;

    set({
      gameState: gs,
      gatherAnimation: { heroId: farmerId, q: targetTile.q, r: targetTile.r, resourceType: tile.resourceType, amount: gatherAmount },
    });

    setTimeout(() => {
      set({ gatherAnimation: null });

      // Check if there's a move queued after gather (gather-then-move combo)
      const { queuedActions } = get();
      const action = queuedActions[farmerId];
      if (action?.movePath && action.movePath.length > 1) {
        // Clear gatherTile so tickMoveAnimation doesn't trigger another gather
        const newQueuedActions = { ...queuedActions };
        newQueuedActions[farmerId] = { ...action, gatherTile: undefined };
        set({ queuedActions: newQueuedActions });

        // Start move after gather
        setTimeout(() => {
          set({
            moveAnimation: {
              heroId: farmerId,
              path: action.movePath!,
              currentIndex: 0,
              progress: 0,
            },
          });
        }, 300);
      } else {
        set({ resolutionIndex: resolutionIndex + 1 });
        setTimeout(() => get().processNextResolution(), 300);
      }
    }, 800);
  },

  executeFarmerDeposit: (farmerId: string) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const farmer = findUnit(gs, farmerId);
    if (!farmer || !farmer.alive || !farmer.resourcePouch) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    const player = gs.players[farmer.owner];
    // Transfer resources from farmer pouch to player stockpile
    for (const [resType, amount] of Object.entries(farmer.resourcePouch)) {
      if (amount && amount > 0) {
        player.resources[resType as keyof typeof player.resources] += amount;
      }
    }
    farmer.resourcePouch = {};

    set({ gameState: gs, resolutionIndex: resolutionIndex + 1 });
    setTimeout(() => get().processNextResolution(), 500);
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

    // Check for hero target first, then unit target (scouts/farmers)
    const targetHero = getAllHeroes(gs).find(
      h => h.alive && h.position.q === targetTile.q && h.position.r === targetTile.r && h.owner !== attacker.owner
    );
    const targetUnit = !targetHero ? getAllUnits(gs).find(
      u => u.alive && u.position.q === targetTile.q && u.position.r === targetTile.r && u.owner !== attacker.owner
    ) : null;
    const target = targetHero || targetUnit;

    // Determine attack type based on range
    const attackType: 'melee' | 'ranged' = attacker.stats.rng <= 1 ? 'melee' : 'ranged';
    const animDuration = attackType === 'melee' ? 400 : 600;

    set({
      targetHeroId: target?.id || null,
      selectedHeroId: attackerId,
      ...makeCameraConfig(new THREE.Vector3(targetTile.q, 0, targetTile.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });

        // Start attack animation
        const previewDamage = target ? Math.max(1, attacker.stats.atk - target.stats.def) : 'MISS';
        set({
          attackAnimation: {
            attackerId,
            attackerPos: { ...attacker.position },
            targetPos: { ...targetTile },
            type: attackType,
            progress: 0,
            damage: previewDamage,
          },
        });

        // Apply damage after animation
        setTimeout(() => {
          set({ attackAnimation: null });
          let damageAmount: number | 'MISS';
          if (target) {
            const damage = Math.max(1, attacker.stats.atk - target.stats.def);
            target.stats.hp -= damage;
            if (target.stats.hp <= 0) {
              target.stats.hp = 0;
              target.alive = false;

              if (targetHero) {
                // Heroes respawn
                targetHero.respawnTimer = 2;

                // LOOT: Winner loots as much of dead hero's pouch as fits
                const targetPouch = targetHero.inventory.resourcePouch?.resources;
                const attackerPouch = attacker.inventory.resourcePouch;
                if (targetPouch && attackerPouch) {
                  if (!attackerPouch.resources) attackerPouch.resources = {};
                  const attackerMax = attackerPouch.maxResourceAmount || 8;
                  const attackerCurrent = Object.values(attackerPouch.resources).reduce((sum, n) => sum + (n || 0), 0);
                  let spaceLeft = attackerMax - attackerCurrent;

                  // Transfer resources (remainder is destroyed)
                  for (const [resType, amount] of Object.entries(targetPouch)) {
                    if (amount && amount > 0 && spaceLeft > 0) {
                      const toTransfer = Math.min(amount, spaceLeft);
                      attackerPouch.resources[resType as keyof typeof attackerPouch.resources] =
                        (attackerPouch.resources[resType as keyof typeof attackerPouch.resources] || 0) + toTransfer;
                      spaceLeft -= toTransfer;
                    }
                  }
                  // Clear dead hero's pouch
                  targetHero.inventory.resourcePouch!.resources = {};
                }
              }
              // Units have permadeath (no respawn timer needed, already handled by alive=false)
            }
            attacker.hasAttacked = true;
            damageAmount = damage;
          } else {
            attacker.hasAttacked = true;
            damageAmount = 'MISS';
          }

          const newIndicatorId = THREE.MathUtils.generateUUID();
          const newDamageIndicators = [...get().damageIndicators, {
            id: newIndicatorId,
            q: targetTile.q, r: targetTile.r,
            amount: damageAmount,
            color: damageAmount === 'MISS' ? '#ff4444' : '#ffffff',
          }];

          set({ gameState: gs, damageIndicators: newDamageIndicators });

          setTimeout(() => {
            // Clear this specific damage indicator after animation
            set(s => ({ damageIndicators: s.damageIndicators.filter(d => d.id !== newIndicatorId) }));

            // Check if there's a move to do after attack (attack-first order)
            const { queuedActions } = get();
            const action = queuedActions[attackerId];
            if (action?.actionOrder === 'attack-first' && action.movePath && action.movePath.length > 1) {
              // Do the move after attack
              set({ targetHeroId: null });
              setTimeout(() => {
                set({
                  moveAnimation: {
                    heroId: attackerId,
                    path: action.movePath!,
                    currentIndex: 0,
                    progress: 0,
                  },
                });
              }, 300);
            } else {
              set({ resolutionIndex: resolutionIndex + 1, targetHeroId: null, selectedHeroId: null });
              setTimeout(() => get().processNextResolution(), 500);
            }
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

    // Initialize resource pouch if needed
    if (!hero.inventory.resourcePouch) {
      hero.inventory.resourcePouch = {
        id: 'pouch',
        name: 'Resource Pouch',
        type: 'resourcePouch',
        maxResourceAmount: 5,
        resources: {}
      };
    }
    const pouch = hero.inventory.resourcePouch;

    // Initialize resources object if not present
    if (!pouch.resources) {
      pouch.resources = {};
    }

    // Calculate total resources currently in pouch
    const currentTotal = Object.values(pouch.resources).reduce((sum, n) => sum + (n || 0), 0);
    const pouchMax = pouch.maxResourceAmount || 8;
    const spaceInPouch = pouchMax - currentTotal;

    if (spaceInPouch <= 0) {
      // Pouch is full - can't gather
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    const resourceType = tile.resourceType!;
    const availableOnTile = tile.resourceAmount || 0;

    // Gather 1-2 resources at a time (random)
    const baseGatherAmount = Math.floor(Math.random() * 2) + 1; // 1 or 2
    const gatheredAmount = Math.min(baseGatherAmount, spaceInPouch, availableOnTile);

    if (gatheredAmount > 0) {
      pouch.resources[resourceType] = (pouch.resources[resourceType] || 0) + gatheredAmount;
      tile.resourceAmount! -= gatheredAmount;
    }
    hero.hasMoved = true;

    set({
      gameState: gs,
      selectedHeroId: heroId,
      gatherAnimation: {
        heroId,
        q: targetTile.q,
        r: targetTile.r,
        resourceType,
        amount: gatheredAmount,
      },
      ...makeCameraConfig(new THREE.Vector3(targetTile.q, 0, targetTile.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        // Animation runs for 1.2 seconds, then clear and check for move after gather
        setTimeout(() => {
          set({ gatherAnimation: null });

          // Check if there's a move queued after gather
          const { queuedActions } = get();
          const action = queuedActions[heroId];
          if (action?.movePath && action.movePath.length > 1) {
            // Clear gatherTile so tickMoveAnimation doesn't trigger another gather
            const newQueuedActions = { ...queuedActions };
            newQueuedActions[heroId] = { ...action, gatherTile: undefined };
            set({ queuedActions: newQueuedActions });

            // Do the move after gather
            setTimeout(() => {
              set({
                moveAnimation: {
                  heroId,
                  path: action.movePath!,
                  currentIndex: 0,
                  progress: 0,
                },
              });
            }, 300);
          } else {
            set({ resolutionIndex: resolutionIndex + 1, selectedHeroId: null });
            setTimeout(() => get().processNextResolution(), 300);
          }
        }, 1200);
      },
    });
  },

  executeDeposit: (heroId: string) => {
    const { gameState, resolutionIndex } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);
    const hero = findHero(gs, heroId);
    if (!hero || !hero.alive) {
      set({ resolutionIndex: resolutionIndex + 1 });
      setTimeout(() => get().processNextResolution(), 300);
      return;
    }

    const player = gs.players[hero.owner];
    const pouch = hero.inventory.resourcePouch;

    if (pouch?.resources) {
      for (const [type, amount] of Object.entries(pouch.resources)) {
        if (amount && amount > 0) {
          player.resources[type as keyof typeof player.resources] += amount;
        }
      }
      pouch.resources = {};
    }

    set({
      gameState: gs,
      selectedHeroId: heroId,
      ...makeCameraConfig(new THREE.Vector3(hero.position.q, 0, hero.position.r), get().cameraConfig?.angle ?? Math.PI / 4, 120),
      onCameraArrived: () => {
        set({ onCameraArrived: null });
        setTimeout(() => {
          set({ resolutionIndex: resolutionIndex + 1, selectedHeroId: null });
          setTimeout(() => get().processNextResolution(), 300);
        }, 600);
      },
    });
  },

  startNewRound: () => {
    const { gameState, round, queuedActions, timeOfDayIndex, day, roundInDay } = get();
    if (!gameState) return;

    const gs = cloneGameState(gameState);

    // 12 rounds = 1 day, 3 rounds per TOD phase
    const ROUNDS_PER_TOD = 3;
    const ROUNDS_PER_DAY = 12;

    const newRoundInDay = (roundInDay % ROUNDS_PER_DAY) + 1;
    const newTimeOfDayIndex = Math.floor((newRoundInDay - 1) / ROUNDS_PER_TOD);
    const newTimeOfDay = TIME_OF_DAY_CYCLE[newTimeOfDayIndex];
    let newDay = day;

    // End of day (round 12 -> round 1): process consumption
    if (newRoundInDay === 1 && roundInDay === ROUNDS_PER_DAY) {
      newDay = day + 1;

      // Collect all consumable entities sorted by HP (weakest first)
      type ConsumableEntity = { type: 'hero' | 'scout' | 'farmer'; entity: Hero | Unit; player: Player };
      const consumables: ConsumableEntity[] = [];

      for (const player of Object.values(gs.players)) {
        for (const hero of player.heroes) {
          if (hero.alive) consumables.push({ type: 'hero', entity: hero, player });
        }
        for (const unit of player.units) {
          if (unit.alive) {
            consumables.push({ type: unit.unitType as 'scout' | 'farmer', entity: unit, player });
          }
        }
      }

      // Sort by current HP (weakest first)
      consumables.sort((a, b) => {
        const aHp = 'stats' in a.entity ? a.entity.stats.hp : 0;
        const bHp = 'stats' in b.entity ? b.entity.stats.hp : 0;
        return aHp - bHp;
      });

      // Process consumption for each entity
      for (const { type, entity, player } of consumables) {
        if (type === 'hero') {
          const hero = entity as Hero;
          const needFood = HERO_CONSUMPTION.food;
          const needWater = HERO_CONSUMPTION.water;
          const pouch = hero.inventory.resourcePouch?.resources;
          const tc = player.buildings.find(b => b.type === 'town_center');

          // Check food: inventory first, then TC stockpile
          const pouchFood = pouch?.food || 0;
          let ateFood = false;
          if (pouchFood >= needFood) {
            pouch!.food = pouchFood - needFood;
            ateFood = true;
          } else if (tc && player.resources.food >= needFood) {
            player.resources.food -= needFood;
            ateFood = true;
          }

          if (ateFood) {
            hero.debuffs.daysWithoutFood = 0;
            hero.debuffs.movPenalty = 0;
            hero.debuffs.spdPenalty = 0;
          } else {
            hero.debuffs.daysWithoutFood++;
            hero.debuffs.movPenalty += HERO_STARVATION_DEBUFFS.noFood.movPenalty;
            hero.debuffs.spdPenalty += HERO_STARVATION_DEBUFFS.noFood.spdPenalty;
            hero.debuffs.hpPenaltyPercent += HERO_STARVATION_DEBUFFS.noFood.hpPercent;
          }

          // Check water: inventory first, then TC stockpile
          const pouchWater = pouch?.water || 0;
          let drankWater = false;
          if (pouchWater >= needWater) {
            pouch!.water = pouchWater - needWater;
            drankWater = true;
          } else if (tc && player.resources.water >= needWater) {
            player.resources.water -= needWater;
            drankWater = true;
          }

          if (drankWater) {
            hero.debuffs.daysWithoutWater = 0;
            hero.debuffs.rngPenalty = 0;
            hero.debuffs.atkPenalty = 0;
          } else {
            hero.debuffs.daysWithoutWater++;
            hero.debuffs.rngPenalty += HERO_STARVATION_DEBUFFS.noWater.rngPenalty;
            hero.debuffs.atkPenalty += HERO_STARVATION_DEBUFFS.noWater.atkPenalty;
            hero.debuffs.hpPenaltyPercent += HERO_STARVATION_DEBUFFS.noWater.hpPercent;
          }

          // Apply debuffs to stats
          hero.stats.mov = Math.max(1, hero.baseStats.mov - hero.debuffs.movPenalty);
          hero.stats.spd = Math.max(1, hero.baseStats.spd - hero.debuffs.spdPenalty);
          hero.stats.rng = Math.max(0, hero.baseStats.rng - hero.debuffs.rngPenalty);
          hero.stats.atk = Math.max(0, hero.baseStats.atk - hero.debuffs.atkPenalty);

          // Apply HP penalty (does not restore HP when eating)
          if (hero.debuffs.hpPenaltyPercent > 0) {
            const hpLoss = Math.floor(hero.baseStats.maxHp * (hero.debuffs.hpPenaltyPercent / 100));
            hero.stats.maxHp = Math.max(1, hero.baseStats.maxHp - hpLoss);
            hero.stats.hp = Math.min(hero.stats.hp, hero.stats.maxHp);
            if (hero.stats.hp <= 0) {
              hero.alive = false;
              hero.respawnTimer = 2;
            }
          }

        } else if (type === 'scout') {
          const scout = entity as Unit;
          const needFood = SCOUT_CONSUMPTION.food;
          const hasFood = player.resources.food >= needFood;

          if (hasFood) {
            player.resources.food -= needFood;
            // Clear debuffs
            scout.debuffs.movPenalty = 0;
            scout.debuffs.spdPenalty = 0;
          } else {
            // Apply starvation debuffs
            scout.debuffs.movPenalty += UNIT_STARVATION_DEBUFFS.scout.noFood.movPenalty;
            scout.debuffs.spdPenalty += UNIT_STARVATION_DEBUFFS.scout.noFood.spdPenalty;
            // HP penalty
            const hpLoss = Math.floor(scout.baseStats.maxHp * (UNIT_STARVATION_DEBUFFS.scout.noFood.hpPercent / 100));
            scout.stats.hp = Math.max(0, scout.stats.hp - hpLoss);
            if (scout.stats.hp <= 0) {
              scout.alive = false;
            }
          }

          // Apply debuffs to stats
          scout.stats.mov = Math.max(1, scout.baseStats.mov - scout.debuffs.movPenalty);
          scout.stats.spd = Math.max(1, scout.baseStats.spd - scout.debuffs.spdPenalty);

        } else if (type === 'farmer') {
          const farmer = entity as Unit;
          const needWater = FARMER_CONSUMPTION.water;
          const hasWater = player.resources.water >= needWater;

          if (hasWater) {
            player.resources.water -= needWater;
            // Clear debuffs
            farmer.debuffs.movPenalty = 0;
            farmer.debuffs.gatherPenalty = 0;
          } else {
            // Apply starvation debuffs
            farmer.debuffs.movPenalty += UNIT_STARVATION_DEBUFFS.farmer.noWater.movPenalty;
            farmer.debuffs.gatherPenalty += UNIT_STARVATION_DEBUFFS.farmer.noWater.gatherPenalty;
            // HP penalty
            const hpLoss = Math.floor(farmer.baseStats.maxHp * (UNIT_STARVATION_DEBUFFS.farmer.noWater.hpPercent / 100));
            farmer.stats.hp = Math.max(0, farmer.stats.hp - hpLoss);
            if (farmer.stats.hp <= 0) {
              farmer.alive = false;
            }
          }

          // Apply debuffs to stats
          farmer.stats.mov = Math.max(1, farmer.baseStats.mov - farmer.debuffs.movPenalty);
          farmer.stats.gatherMin = Math.max(1, farmer.baseStats.gatherMin - farmer.debuffs.gatherPenalty);
          farmer.stats.gatherMax = Math.max(1, farmer.baseStats.gatherMax - farmer.debuffs.gatherPenalty);
        }
      }
    }

    // Process unit training (spawn units from TC)
    for (const [key, action] of Object.entries(queuedActions)) {
      if (key.startsWith('tc-') && action.trainUnit) {
        const tcId = key.replace('tc-', '');
        // Find the TC and its owner
        for (const player of Object.values(gs.players)) {
          const tc = player.buildings.find(b => b.id === tcId);
          if (tc) {
            const unitType = action.trainUnit;
            const stats = { ...UNIT_STATS[unitType] };
            const baseStats = { ...UNIT_STATS[unitType] };

            // Find spawn position adjacent to TC
            const occupied = getOccupiedTiles(gs);
            let spawnPos: { q: number; r: number } | null = null;
            const DIRS = [
              { dq: 0, dr: -1 }, { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 0 },
              { dq: 1, dr: -1 }, { dq: 1, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: -1 },
            ];
            for (const dir of DIRS) {
              const pos = { q: tc.position.q + dir.dq, r: tc.position.r + dir.dr };
              if (pos.q >= 0 && pos.q < gs.mapWidth && pos.r >= 0 && pos.r < gs.mapHeight) {
                const tile = gs.grid[pos.r][pos.q];
                if (tile.terrain !== 'water' && !occupied.has(`${pos.q},${pos.r}`)) {
                  spawnPos = pos;
                  break;
                }
              }
            }

            if (spawnPos) {
              const newUnit: Unit = {
                id: `unit-${player.id}-${unitType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                unitType,
                owner: player.id,
                position: spawnPos,
                stats,
                baseStats,
                debuffs: { movPenalty: 0, spdPenalty: 0, atkPenalty: 0, rngPenalty: 0, gatherPenalty: 0 },
                alive: true,
                resourcePouch: unitType === 'farmer' ? {} : undefined,
              };
              player.units.push(newUnit);
              // Mark the new position as occupied for subsequent spawns
              occupied.add(`${spawnPos.q},${spawnPos.r}`);
            }
            break;
          }
        }
      }
    }

    for (const player of Object.values(gs.players)) {
      // Find player's town center
      const townCenter = player.buildings.find(b => b.type === 'town_center');

      for (const hero of player.heroes) {
        hero.hasMoved = false;
        hero.hasAttacked = false;
        // Respawn dead heroes only if player has a town center
        if (!hero.alive && townCenter) {
          hero.respawnTimer--;
          if (hero.respawnTimer <= 0) {
            hero.alive = true;
            hero.stats.hp = hero.stats.maxHp;
            // Find closest open tile to town center
            const tcPos = townCenter.position;
            const occupied = getOccupiedTiles(gs);
            let bestPos = tcPos;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dq = -1; dq <= 1; dq++) {
                if (dr === 0 && dq === 0) continue;
                const pos = { q: tcPos.q + dq, r: tcPos.r + dr };
                if (pos.q >= 0 && pos.q < gs.mapWidth && pos.r >= 0 && pos.r < gs.mapHeight) {
                  if (!occupied.has(`${pos.q},${pos.r}`)) {
                    bestPos = pos;
                    break;
                  }
                }
              }
              if (bestPos !== tcPos) break;
            }
            hero.position = bestPos;
          }
        } else if (!hero.alive && !townCenter) {
          // No TC = no respawn, just tick timer
          if (hero.respawnTimer > 0) hero.respawnTimer--;
        }
      }
    }
    gs.turn = round + 1;

    const p1mid = getPlayerMidpoint(gs, 'player1');

    set({
      gameState: gs,
      phase: 'planning',
      round: round + 1,
      day: newDay,
      roundInDay: newRoundInDay,
      timeOfDay: newTimeOfDay,
      timeOfDayIndex: newTimeOfDayIndex,
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
        const unit = findUnit(gs, moveAnimation.heroId);

        if (hero) {
          // Hero movement
          const dest = moveAnimation.path[moveAnimation.path.length - 1];
          hero.position = { q: dest.q, r: dest.r };
          hero.hasMoved = true;
          set({ gameState: gs, moveAnimation: null });
          get().updateVisibility();

          const action = queuedActions[moveAnimation.heroId];
          // Clear movePath from queued actions so executeGather doesn't trigger another move
          if (action?.movePath) {
            const newQueuedActions = { ...get().queuedActions };
            newQueuedActions[moveAnimation.heroId] = { ...action, movePath: undefined, moveDest: undefined };
            set({ queuedActions: newQueuedActions });
          }

          // Only do attack after move if it's move-first order (or no order specified)
          const shouldAttackAfterMove = action?.attackTargetTile && action?.actionOrder !== 'attack-first';
          if (shouldAttackAfterMove) {
            setTimeout(() => {
              get().executeAttackTile(moveAnimation.heroId, action.attackTargetTile!);
            }, 300);
          } else if (action?.gatherTile) {
            setTimeout(() => {
              get().executeGather(moveAnimation.heroId, action.gatherTile!);
            }, 300);
          } else {
            set({ resolutionIndex: resolutionIndex + 1 });
            setTimeout(() => get().processNextResolution(), 500);
          }
        } else if (unit) {
          // Unit (Scout/Farmer) movement
          const dest = moveAnimation.path[moveAnimation.path.length - 1];
          unit.position = { q: dest.q, r: dest.r };
          set({ gameState: gs, moveAnimation: null });
          get().updateVisibility();

          const action = queuedActions[moveAnimation.heroId];
          // Clear movePath from queued actions so executeFarmerGather doesn't trigger another move
          if (action?.movePath) {
            const newQueuedActions = { ...get().queuedActions };
            newQueuedActions[moveAnimation.heroId] = { ...action, movePath: undefined, moveDest: undefined };
            set({ queuedActions: newQueuedActions });
          }

          // Scout attack after move
          if (unit.unitType === 'scout' && action?.attackTargetTile) {
            setTimeout(() => {
              get().executeScoutAttack(moveAnimation.heroId, action.attackTargetTile!);
            }, 300);
          } else if (unit.unitType === 'farmer' && action?.gatherTile) {
            // Farmer gather after move
            setTimeout(() => {
              get().executeFarmerGather(moveAnimation.heroId, action.gatherTile!);
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

  focusPosition: (x, z) => {
    set({
      ...makeCameraConfig(new THREE.Vector3(x, 0, z), get().cameraConfig?.angle ?? Math.PI / 4, get().cameraConfig?.zoom ?? 120),
    });
  },

  deselectAll: () => {
    set({
      selectedHeroId: null,
      selectedBuildingId: null,
      actionMode: 'idle',
      moveTiles: new Set(),
      attackTiles: new Set(),
      placementTiles: new Set(),
      pendingTarget: null,
      targetHeroId: null,
      showInventoryPanel: false,
      showBuildModal: false,
      showRecruitModal: false,
      currentPath: null,
    });
  },

  depositResources: (heroId) => {
    const { gameState, queuedActions, planningPlayerId } = get();
    if (!gameState) return;

    const hero = findHero(gameState, heroId);
    if (!hero || !hero.inventory.resourcePouch || hero.owner !== planningPlayerId) return;

    const player = gameState.players[hero.owner];

    // Check if hero is adjacent to their Town Center
    const townCenter = player.buildings.find(b => b.type === 'town_center');
    if (!townCenter) return;

    const tcPos = townCenter.position;
    const heroPos = hero.position;
    const dist = Math.max(Math.abs(tcPos.q - heroPos.q), Math.abs(tcPos.r - heroPos.r));
    if (dist > 1) return;

    // Check hero has resources to deposit
    const pouch = hero.inventory.resourcePouch;
    const hasResources = pouch.resources && Object.values(pouch.resources).some(v => (v || 0) > 0);
    if (!hasResources) return;

    // Queue deposit action (locks out move/attack/gather like gather does)
    const newQueued = { ...queuedActions };
    newQueued[heroId] = { depositTile: { q: tcPos.q, r: tcPos.r } };

    set({ queuedActions: newQueued, showInventoryPanel: false });
  },

  // Debug functions
  debugSpawnScout: () => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') return;

    const gs = cloneGameState(gameState);
    const player = gs.players[planningPlayerId];

    // Find a spawn position near player's starting area
    const startQ = planningPlayerId === 'player1' ? 2 : gs.mapWidth - 3;
    const startR = planningPlayerId === 'player1' ? 2 : gs.mapHeight - 3;
    const occupied = getOccupiedTiles(gs);

    // Find first unoccupied adjacent tile
    const offsets = [{ dq: 0, dr: 0 }, { dq: 1, dr: 0 }, { dq: -1, dr: 0 }, { dq: 0, dr: 1 }, { dq: 0, dr: -1 }, { dq: 1, dr: 1 }, { dq: -1, dr: 1 }, { dq: 1, dr: -1 }, { dq: -1, dr: -1 }];
    let spawnPos: { q: number; r: number } | null = null;
    for (const off of offsets) {
      const q = startQ + off.dq;
      const r = startR + off.dr;
      if (q >= 0 && q < gs.mapWidth && r >= 0 && r < gs.mapHeight) {
        const tile = gs.grid[r][q];
        if (tile.terrain !== 'water' && !occupied.has(`${q},${r}`)) {
          spawnPos = { q, r };
          break;
        }
      }
    }
    if (!spawnPos) return;

    const scoutStats = { ...UNIT_STATS.scout, hp: UNIT_STATS.scout.maxHp };
    const scout: Unit = {
      id: `scout-${Date.now()}`,
      unitType: 'scout',
      owner: planningPlayerId,
      position: spawnPos,
      alive: true,
      stats: scoutStats,
      baseStats: { ...scoutStats },
      debuffs: { movPenalty: 0, spdPenalty: 0, atkPenalty: 0, rngPenalty: 0, gatherPenalty: 0 },
    };
    player.units.push(scout);
    set({ gameState: gs });
  },

  debugSpawnFarmer: () => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') return;

    const gs = cloneGameState(gameState);
    const player = gs.players[planningPlayerId];

    const startQ = planningPlayerId === 'player1' ? 2 : gs.mapWidth - 3;
    const startR = planningPlayerId === 'player1' ? 2 : gs.mapHeight - 3;
    const occupied = getOccupiedTiles(gs);

    const offsets = [{ dq: 0, dr: 0 }, { dq: 1, dr: 0 }, { dq: -1, dr: 0 }, { dq: 0, dr: 1 }, { dq: 0, dr: -1 }, { dq: 1, dr: 1 }, { dq: -1, dr: 1 }, { dq: 1, dr: -1 }, { dq: -1, dr: -1 }];
    let spawnPos: { q: number; r: number } | null = null;
    for (const off of offsets) {
      const q = startQ + off.dq;
      const r = startR + off.dr;
      if (q >= 0 && q < gs.mapWidth && r >= 0 && r < gs.mapHeight) {
        const tile = gs.grid[r][q];
        if (tile.terrain !== 'water' && !occupied.has(`${q},${r}`)) {
          spawnPos = { q, r };
          break;
        }
      }
    }
    if (!spawnPos) return;

    const farmerStats = { ...UNIT_STATS.farmer, hp: UNIT_STATS.farmer.maxHp };
    const farmer: Unit = {
      id: `farmer-${Date.now()}`,
      unitType: 'farmer',
      owner: planningPlayerId,
      position: spawnPos,
      alive: true,
      stats: farmerStats,
      baseStats: { ...farmerStats },
      debuffs: { movPenalty: 0, spdPenalty: 0, atkPenalty: 0, rngPenalty: 0, gatherPenalty: 0 },
      resourcePouch: {},
    };
    player.units.push(farmer);
    set({ gameState: gs });
  },

  debugPlaceTC: () => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') return;

    const gs = cloneGameState(gameState);
    const player = gs.players[planningPlayerId];

    // Don't place if already has TC
    if (player.buildings.some(b => b.type === 'town_center')) return;

    const startQ = planningPlayerId === 'player1' ? 3 : gs.mapWidth - 4;
    const startR = planningPlayerId === 'player1' ? 3 : gs.mapHeight - 4;
    const occupied = getOccupiedTiles(gs);

    const offsets = [{ dq: 0, dr: 0 }, { dq: 1, dr: 0 }, { dq: -1, dr: 0 }, { dq: 0, dr: 1 }, { dq: 0, dr: -1 }];
    let placePos: { q: number; r: number } | null = null;
    for (const off of offsets) {
      const q = startQ + off.dq;
      const r = startR + off.dr;
      if (q >= 0 && q < gs.mapWidth && r >= 0 && r < gs.mapHeight) {
        const tile = gs.grid[r][q];
        if (tile.terrain === 'plains' && !occupied.has(`${q},${r}`)) {
          placePos = { q, r };
          break;
        }
      }
    }
    if (!placePos) return;

    const tc: Building = {
      id: `tc-${planningPlayerId}-${Date.now()}`,
      type: 'town_center',
      owner: planningPlayerId,
      position: placePos,
      hp: 500,
      maxHp: 500,
      constructedAt: get().round,
    };
    player.buildings.push(tc);
    set({ gameState: gs });
  },

  debugAddResources: (amount: number) => {
    const { gameState, planningPlayerId, phase } = get();
    if (!gameState || phase !== 'planning') return;

    const gs = cloneGameState(gameState);
    const player = gs.players[planningPlayerId];

    player.resources.wood += amount;
    player.resources.stone += amount;
    player.resources.iron += amount;
    player.resources.food += amount;
    player.resources.water += amount;

    set({ gameState: gs });
  },
}));
