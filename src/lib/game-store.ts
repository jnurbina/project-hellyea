// === Game State Store (Zustand) ===

import { create } from 'zustand';
import * as THREE from 'three';
import { GameState, Hero, TurnAction, Tile, Player, HeroStats, TERRAIN_CONFIG } from './types';
import { generateGrid, findPath, calculateVisibility, octileDistance } from './grid';

// Deep-clone game state so Zustand detects changes in nested hero positions etc.
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

const getPlayerHeroMidpoint = (player: Player): THREE.Vector3 => {
  const living = player.heroes.filter(h => h.alive);
  if (living.length === 0) return new THREE.Vector3();
  const sum = living.reduce(
    (acc, h) => acc.add(new THREE.Vector3(h.position.q, 0, h.position.r)),
    new THREE.Vector3()
  );
  return sum.divideScalar(living.length);
};

export interface CameraConfig {
  target: THREE.Vector3;
  angle: number;
  zoom: number;
}

interface GameStore {
  gameState: GameState | null;
  activePlayerId: string | null;
  turnOrder: string[];
  selectedHero: string | null;
  hoveredTile: { q: number; r: number } | null;
  currentPath: { q: number; r: number }[] | null;
  cameraConfig: CameraConfig | null;

  initGame: (mapWidth?: number, mapHeight?: number) => void;
  selectHero: (heroId: string | null) => void;
  setHoveredTile: (q: number, r: number) => void;
  clearHover: () => void;
  moveHero: (heroId: string, q: number, r: number) => void;
  attackHero: (attackerId: string, targetId: string) => void;
  endTurn: () => void;
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
  activePlayerId: null,
  turnOrder: [],
  selectedHero: null,
  hoveredTile: null,
  currentPath: null,
  cameraConfig: null,

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

    // Fastest hero determines first player
    const allHeroes = Object.values(players).flatMap(p => p.heroes);
    const fastestHero = [...allHeroes].sort((a, b) => b.stats.spd - a.stats.spd)[0];
    const firstPlayer = fastestHero.owner;
    const secondPlayer = firstPlayer === 'player1' ? 'player2' : 'player1';
    const turnOrder = [firstPlayer, secondPlayer];

    const gameState: GameState = {
      phase: 'planning', turn: 1, grid, players, pendingActions: { player1: [], player2: [] }, mapWidth, mapHeight,
    };

    // Set initial state with camera pointing at first player
    const activePlayer = gameState.players[firstPlayer];
    const opponent = gameState.players[secondPlayer];
    const playerMid = getPlayerHeroMidpoint(activePlayer);
    const opponentMid = getPlayerHeroMidpoint(opponent);
    const toOpp = opponentMid.clone().sub(playerMid);
    const angle = Math.atan2(toOpp.x, toOpp.z) + Math.PI;

    set({
      gameState,
      activePlayerId: firstPlayer,
      turnOrder,
      cameraConfig: { target: playerMid, angle, zoom: 70 },
    });

    // Calculate visibility for first player
    get().updateVisibility();
  },

  selectHero: (heroId) => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId || !heroId) {
      set({ selectedHero: null, currentPath: null });
      return;
    }
    const hero = Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === heroId);
    if (hero && hero.owner === activePlayerId && hero.alive) {
      set({ selectedHero: heroId, currentPath: null });
    } else {
      set({ selectedHero: null, currentPath: null });
    }
  },

  setHoveredTile: (q, r) => {
    const { gameState, selectedHero } = get();
    if (!gameState || !selectedHero) {
      set({ hoveredTile: { q, r } });
      return;
    }
    const hero = Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === selectedHero);
    if (!hero || !hero.alive || hero.hasMoved) {
      set({ hoveredTile: { q, r }, currentPath: null });
      return;
    }
    const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r);
    const truncated = fullPath ? truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov) : null;
    set({ hoveredTile: { q, r }, currentPath: truncated });
  },

  clearHover: () => set({ hoveredTile: null, currentPath: null }),

  moveHero: (heroId, q, r) => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;

    const gs = cloneGameState(gameState);
    const player = gs.players[activePlayerId];
    const hero = player?.heroes.find(h => h.id === heroId);
    if (!hero || !hero.alive || hero.hasMoved) return;

    const fullPath = findPath(gs.grid, hero.position.q, hero.position.r, q, r);
    if (!fullPath || fullPath.length < 2) return;

    const truncated = truncatePathToMovement(fullPath, gs.grid, hero.stats.mov);
    if (!truncated || truncated.length < 2) return;

    const dest = truncated[truncated.length - 1];
    hero.position = { q: dest.q, r: dest.r };
    hero.hasMoved = true;

    set({ gameState: gs, selectedHero: null, currentPath: null });
    get().updateVisibility();
  },

  attackHero: (attackerId, targetId) => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;

    const gs = cloneGameState(gameState);
    const attacker = gs.players[activePlayerId]?.heroes.find(h => h.id === attackerId);
    const targetPlayer = Object.values(gs.players).find(p => p.heroes.some(h => h.id === targetId));
    const target = targetPlayer?.heroes.find(h => h.id === targetId);

    if (!attacker || !target || attacker.owner === target.owner || attacker.hasAttacked) return;

    const dist = octileDistance(attacker.position.q, attacker.position.r, target.position.q, target.position.r);
    if (dist > attacker.stats.rng) return;

    const damage = Math.max(1, attacker.stats.atk - target.stats.def);
    target.stats.hp -= damage;
    if (target.stats.hp <= 0) {
      target.stats.hp = 0;
      target.alive = false;
    }
    attacker.hasAttacked = true;

    set({ gameState: gs, selectedHero: null });
  },

  endTurn: () => {
    const { gameState, activePlayerId, turnOrder } = get();
    if (!gameState || !activePlayerId) return;

    const gs = cloneGameState(gameState);

    const currentIndex = turnOrder.indexOf(activePlayerId);
    const nextIndex = (currentIndex + 1) % turnOrder.length;
    const nextPlayerId = turnOrder[nextIndex];

    // Full round completed → increment turn, reset all hero actions
    if (nextIndex === 0) {
      gs.turn++;
      for (const player of Object.values(gs.players)) {
        for (const hero of player.heroes) {
          hero.hasMoved = false;
          hero.hasAttacked = false;
        }
      }
    }

    // Camera snap: behind next player's units, facing opponent
    const activePlayer = gs.players[nextPlayerId];
    const opponentId = turnOrder.find(id => id !== nextPlayerId)!;
    const opponent = gs.players[opponentId];
    const playerMid = getPlayerHeroMidpoint(activePlayer);
    const opponentMid = getPlayerHeroMidpoint(opponent);
    const toOpp = opponentMid.clone().sub(playerMid);
    const angle = Math.atan2(toOpp.x, toOpp.z) + Math.PI;

    set({
      gameState: gs,
      activePlayerId: nextPlayerId,
      selectedHero: null,
      currentPath: null,
      cameraConfig: { target: playerMid, angle, zoom: 70 },
    });

    // Recalculate fog of war for the new active player
    get().updateVisibility();
  },

  updateVisibility: () => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;

    const gs = cloneGameState(gameState);
    const player = gs.players[activePlayerId];
    if (!player) return;

    // Reset all tiles from visible → explored
    for (const row of gs.grid) {
      for (const tile of row) {
        if (tile.visible === 'visible') tile.visible = 'explored';
      }
    }

    // Reveal tiles around each living hero
    for (const hero of player.heroes) {
      if (!hero.alive) continue;
      const visibleTiles = calculateVisibility(gs.grid, hero.position.q, hero.position.r, hero.stats.vis);
      for (const key of visibleTiles) {
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
    const hero = Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === heroId);
    if (!hero || !hero.alive) return;

    set({
      cameraConfig: {
        target: new THREE.Vector3(hero.position.q, 0, hero.position.r),
        angle: get().cameraConfig?.angle ?? Math.PI / 4,
        zoom: 80, // closer zoom on focus
      },
    });
  },
}));

function truncatePathToMovement(
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
