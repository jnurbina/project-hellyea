'use client';

import { useEffect, useMemo } from 'react';
import { useGameStore, QueuedAction, ActionMode } from '@/lib/game-store';
import { Hero, UnitType, UNIT_STATS, UNIT_COSTS, UNIT_CAPS, UNIT_UPKEEP, TimeOfDay } from '@/lib/types';
import InventoryPanel from './InventoryPanel';
import Minimap from './Minimap';
import { playSelectSound, playBlurSound } from '@/app/page';

export default function GameHUD() {
  const gameState = useGameStore(s => s.gameState);
  const phase = useGameStore(s => s.phase);
  const round = useGameStore(s => s.round);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const selectedHeroId = useGameStore(s => s.selectedHeroId);
  const selectedUnitId = useGameStore(s => s.selectedUnitId);
  const actionMode = useGameStore(s => s.actionMode);
  const queuedActions = useGameStore(s => s.queuedActions);
  const targetHeroId = useGameStore(s => s.targetHeroId);
  const pendingTarget = useGameStore(s => s.pendingTarget);
  const showEndTurnConfirm = useGameStore(s => s.showEndTurnConfirm);
  const showInventoryPanel = useGameStore(s => s.showInventoryPanel);
  const resolutionOrder = useGameStore(s => s.resolutionOrder);
  const resolutionIndex = useGameStore(s => s.resolutionIndex);
  const moveAnimation = useGameStore(s => s.moveAnimation);
  const day = useGameStore(s => s.day);
  const roundInDay = useGameStore(s => s.roundInDay);
  const timeOfDay = useGameStore(s => s.timeOfDay);
  const timeOfDayIndex = useGameStore(s => s.timeOfDayIndex);

  const selectHero = useGameStore(s => s.selectHero);
  const setActionMode = useGameStore(s => s.setActionMode);
  const requestEndTurn = useGameStore(s => s.requestEndTurn);
  const confirmEndTurn = useGameStore(s => s.confirmEndTurn);
  const cancelEndTurn = useGameStore(s => s.cancelEndTurn);
  const focusHero = useGameStore(s => s.focusHero);
  const toggleInventory = useGameStore(s => s.toggleInventory);

  const deselectAll = useGameStore(s => s.deselectAll);
  const cancelAction = useGameStore(s => s.cancelAction);
  const toggleBuildModal = useGameStore(s => s.toggleBuildModal);
  const showBuildModal = useGameStore(s => s.showBuildModal);
  const selectedBuildingId = useGameStore(s => s.selectedBuildingId);
  const selectBuilding = useGameStore(s => s.selectBuilding);

  const closeBuildModal = useGameStore(s => s.closeBuildModal);
  const showRecruitModal = useGameStore(s => s.showRecruitModal);
  const toggleRecruitModal = useGameStore(s => s.toggleRecruitModal);
  const closeRecruitModal = useGameStore(s => s.closeRecruitModal);
  const trainUnit = useGameStore(s => s.trainUnit);

  const allHeroes = useMemo(() =>
    gameState ? Object.values(gameState.players).flatMap(p => [...p.heroes]) : [],
    [gameState]
  );

  const allUnits = useMemo(() =>
    gameState ? Object.values(gameState.players).flatMap(p => [...p.units]) : [],
    [gameState]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (showEndTurnConfirm) cancelEndTurn();
        else if (showBuildModal) closeBuildModal();
        else if (showRecruitModal) closeRecruitModal();
        else if (showInventoryPanel) deselectAll();
        else if (actionMode !== 'idle') setActionMode('idle');
        else if (selectedHeroId) deselectAll();
      }
      if (phase !== 'planning') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (showEndTurnConfirm) { confirmEndTurn(); playBlurSound(); }
        else requestEndTurn();
      }
      // Hotkeys for hero actions (only when a hero is selected and not in modal)
      if (selectedHeroId && !showEndTurnConfirm && !showInventoryPanel && !showBuildModal && !showRecruitModal) {
        const key = e.key.toLowerCase();
        if (key === 'm') {
          e.preventDefault();
          setActionMode(actionMode === 'move' ? 'idle' : 'move');
        } else if (key === 't') {
          e.preventDefault();
          setActionMode(actionMode === 'attack' ? 'idle' : 'attack');
        } else if (key === 'g') {
          e.preventDefault();
          setActionMode(actionMode === 'gather' ? 'idle' : 'gather');
        } else if (key === 'b') {
          e.preventDefault();
          toggleBuildModal();
          playSelectSound();
        }
      }
      // I key toggle inventory (works even when inventory is open to close it)
      if (selectedHeroId && !showEndTurnConfirm && !showBuildModal && !showRecruitModal && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleInventory(selectedHeroId);
        playSelectSound();
      }
      // Hotkeys for farmer unit actions (Move and Gather only)
      if (selectedUnitId && !showEndTurnConfirm && !showInventoryPanel && !showBuildModal && !showRecruitModal) {
        const key = e.key.toLowerCase();
        const unitQueued = queuedActions[selectedUnitId];
        if (key === 'm') {
          e.preventDefault();
          setActionMode(actionMode === 'move' ? 'idle' : 'move');
        } else if (key === 'g') {
          e.preventDefault();
          // Don't allow entering gather mode if gather is already queued
          if (unitQueued?.gatherTile && actionMode !== 'gather') return;
          setActionMode(actionMode === 'gather' ? 'idle' : 'gather');
        }
      }
      // R key for TC Recruit Modal when TC is selected
      if (selectedBuildingId && !showEndTurnConfirm && !showInventoryPanel && !showBuildModal && !showRecruitModal) {
        const key = e.key.toLowerCase();
        if (key === 'r') {
          e.preventDefault();
          const building = Object.values(gameState?.players || {}).flatMap(p => p.buildings).find(b => b.id === selectedBuildingId);
          if (building?.type === 'town_center' && building.owner === planningPlayerId) {
            toggleRecruitModal();
          }
        }
      }
      // Tab to cycle through unqueued units
      if (e.code === 'Tab' && !showEndTurnConfirm && !showInventoryPanel && !showBuildModal) {
        e.preventDefault();
        const playerHeroes = allHeroes.filter(h => h.owner === planningPlayerId && h.alive);
        const unqueuedHeroes = playerHeroes.filter(h => {
          const q = queuedActions[h.id];
          return !q?.moveDest && !q?.attackTargetTile && !q?.gatherTile && !q?.depositTile && !q?.builtTC;
        });
        if (unqueuedHeroes.length > 0) {
          // Find current selection in the unqueued list and cycle to next
          const currentIndex = unqueuedHeroes.findIndex(h => h.id === selectedHeroId);
          const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % unqueuedHeroes.length;
          const nextHero = unqueuedHeroes[nextIndex];
          selectHero(nextHero.id);
          focusHero(nextHero.id);
          playBlurSound();
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, showEndTurnConfirm, showInventoryPanel, showBuildModal, showRecruitModal, actionMode, selectedHeroId, selectedUnitId, selectedBuildingId, planningPlayerId, gameState, allHeroes, queuedActions, confirmEndTurn, requestEndTurn, cancelEndTurn, closeBuildModal, closeRecruitModal, setActionMode, deselectAll, toggleInventory, toggleBuildModal, toggleRecruitModal, selectHero, focusHero]);

  if (!gameState) return null;

  const activePlayer = gameState.players[planningPlayerId];
  const selectedHero = allHeroes.find(h => h.id === selectedHeroId);
  const selectedUnit = selectedUnitId ? allUnits.find(u => u.id === selectedUnitId) : null;
  const targetHero = targetHeroId ? allHeroes.find(h => h.id === targetHeroId) : null;

  // Victory check: player is defeated if all heroes dead AND no TC to respawn
  const checkDefeat = (playerId: string) => {
    const player = gameState.players[playerId];
    const allHeroesDead = player.heroes.every(h => !h.alive);
    const hasTC = player.buildings.some(b => b.type === 'town_center');
    return allHeroesDead && !hasTC;
  };
  const player1Defeated = checkDefeat('player1');
  const player2Defeated = checkDefeat('player2');
  const winner = player1Defeated ? 'Player 2' : player2Defeated ? 'Player 1' : null;

  return (
    <div className="absolute inset-0 pointer-events-none font-mono select-none">
      {showInventoryPanel && selectedHero && (
        <InventoryPanel hero={selectedHero} />
      )}
      {showBuildModal && selectedHero && (
        <BuildModal hero={selectedHero} />
      )}
      {showRecruitModal && (
        <RecruitModal />
      )}
      {/* Victory Modal */}
      {winner && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto z-50">
          <div className="bg-gradient-to-b from-gray-900 to-black border-2 border-yellow-500 rounded-xl p-8 text-center shadow-2xl">
            <div className="text-6xl mb-4">🏆</div>
            <div className="text-4xl font-bold text-yellow-400 mb-2">{winner} Wins!</div>
            <div className="text-gray-400 mb-6">The enemy has been defeated.</div>
            <button
              onClick={() => window.location.reload()}
              className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-8 rounded-lg uppercase tracking-wider"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-start gap-3">
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-3 py-2 text-xs shrink-0">
          <div className="text-cyan-400 font-bold">ROUND {round}</div>
          <div className="text-gray-500 text-[10px]">
            {phase === 'planning' ? `${activePlayer.name} — PLANNING` : '⚔ RESOLUTION'}
          </div>
        </div>

        {/* Hero roster */}
        <div className="pointer-events-auto bg-black/80 border border-gray-700 rounded px-3 py-2 flex gap-1.5 overflow-x-auto">
          {allHeroes
            .filter(h => h.alive)
            .sort((a, b) => b.stats.spd - a.stats.spd)
            .map(hero => {
              const q = queuedActions[hero.id];
              const isSelected = selectedHeroId === hero.id;
              const hasQueue = !!(q?.moveDest || q?.attackTargetTile || q?.gatherTile || q?.builtTC);
              const isCurrentResolutionActor = phase === 'resolution' && hero.id === resolutionOrder[resolutionIndex];
              const ownerColor = hero.owner === 'player1' ? 'cyan' : 'red';

              return (
                <div
                  key={hero.id}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase cursor-pointer transition-all whitespace-nowrap border ${isCurrentResolutionActor ? `border-yellow-400 bg-yellow-900/40 text-yellow-300 animate-pulse` : isSelected ? `border-${ownerColor}-400 bg-${ownerColor}-900/40 text-${ownerColor}-300` : hasQueue ? 'border-green-700 bg-green-900/20 text-green-400' : 'border-gray-700 bg-gray-800/30 text-gray-500 hover:border-gray-500'}
                  ${!hero.alive ? 'opacity-30 cursor-not-allowed' : ''}`}
                  onClick={() => {
                    if (hero.alive) {
                      if (actionMode !== 'idle') cancelAction();
                      selectHero(hero.id);
                    }
                  }}
                  onDoubleClick={() => focusHero(hero.id)}
                  style={isCurrentResolutionActor ? {borderColor: '#ffea00'} : {}}
                >
                  {hero.name} <span className="text-gray-600">({hero.stats.spd})</span>
                  {hasQueue && <span className="ml-1 text-green-500">✓</span>}
                  {!hero.alive && <span className="ml-1 text-red-500">☠</span>}
                </div>
              );
            })}
        </div>
        
        {/* TOD Dial - top center, half out of viewport */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-auto">
          <TODDial timeOfDay={timeOfDay} timeOfDayIndex={timeOfDayIndex} day={day} roundInDay={roundInDay} />
        </div>

        {/* Resources */}
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-3 py-2 text-xs flex gap-4 ml-auto shrink-0">
          {Object.entries(activePlayer.resources).map(([k, v]) => {
            const icons: Record<string, string> = {
              wood: '🪵', stone: '🪨', iron: '⚙️', food: '🍖', water: '💧'
            };
            return (
              <div key={k} className="flex items-center gap-1" title={k.charAt(0).toUpperCase() + k.slice(1)}>
                <span className="text-sm">{icons[k] || '📦'}</span>
                <span className="text-white font-bold">{v}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Left: Hero info panel or Building info panel ── */}
      {selectedBuildingId && (() => {
        const building = Object.values(gameState.players).flatMap(p => p.buildings).find(b => b.id === selectedBuildingId);
        if (!building) return null;
        const isOwnBuilding = building.owner === planningPlayerId;
        return (
          <div className="absolute bottom-4 left-4 pointer-events-auto z-20">
            <BuildingInfoPanel
              building={building}
              onRecruit={toggleRecruitModal}
              isOwnBuilding={isOwnBuilding}
            />
          </div>
        );
      })()}
      {!showInventoryPanel && !selectedBuildingId && ((phase === 'planning' && selectedHero && selectedHero.owner === planningPlayerId) || (phase === 'resolution' && selectedHeroId)) ? (
        <div className="absolute bottom-4 left-4 pointer-events-auto z-20">
          <HeroInfoPanel
            hero={selectedHero || allHeroes.find(h => h.id === selectedHeroId)!}
            queued={queuedActions[selectedHeroId!]}
            isPlanning={phase === 'planning' && selectedHero?.owner === planningPlayerId}
            actionMode={actionMode}
            setActionMode={setActionMode}
            isAnimating={!!moveAnimation}
            toggleInventory={toggleInventory}
            toggleBuildModal={toggleBuildModal}
          />
        </div>
      ) : null}
      {/* Unit Info Panel for selected Farmer */}
      {!showInventoryPanel && !selectedBuildingId && !selectedHeroId && selectedUnit && selectedUnit.owner === planningPlayerId && phase === 'planning' ? (
        <div className="absolute bottom-4 left-4 pointer-events-auto z-20">
          <UnitInfoPanel
            unit={selectedUnit}
            queued={queuedActions[selectedUnit.id]}
            actionMode={actionMode}
            setActionMode={setActionMode}
            isAnimating={!!moveAnimation}
          />
        </div>
      ) : null}

      {/* ── Bottom Right: Target panel or Status panel ── */}
      <div className="absolute bottom-4 right-4 pointer-events-auto z-20">
        {targetHero && selectedHero && (actionMode === 'attack' || phase === 'resolution') ? (
          <TargetPanel hero={targetHero} attacker={selectedHero} isPending={!!pendingTarget} />
        ) : (
          <StatusPanel />
        )}
      </div>

      {/* Minimap + End Planning Drawer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto z-20 flex flex-col items-center">
        <EndPlanningDrawer
          phase={phase}
          allHeroes={allHeroes}
          queuedActions={queuedActions}
          planningPlayerId={planningPlayerId}
          onEndTurn={requestEndTurn}
        />
        <Minimap />
      </div>

      {/* Action mode indicator */}
      {!showInventoryPanel && actionMode !== 'idle' && phase === 'planning' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2">
          <div className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
            actionMode === 'move' ? 'bg-green-900/60 border border-green-500/50 text-green-400' :
            actionMode === 'attack' ? 'bg-red-900/60 border border-red-500/50 text-red-400' :
            actionMode === 'place_tc' ? 'bg-amber-900/60 border border-amber-500/50 text-amber-400' :
            'bg-yellow-900/60 border border-yellow-500/50 text-yellow-400'
          }`}>
            {actionMode === 'move' ? '⬡ SELECT MOVE TARGET' :
            actionMode === 'attack' ? '⚔ SELECT ATTACK TARGET' :
            actionMode === 'place_tc' ? '🏰 SELECT TC LOCATION' :
            '⛏ SELECT GATHER TILE'}
            {pendingTarget && <span className="ml-2 text-white animate-pulse">— Double-click to confirm</span>}
          </div>
        </div>
      )}

      {/* End Turn Confirmation */}
      {showEndTurnConfirm && (() => {
        const playerHeroes = allHeroes.filter(h => h.owner === planningPlayerId && h.alive);
        const hasAction = (h: Hero) => {
          const q = queuedActions[h.id];
          return q?.moveDest || q?.attackTargetTile || q?.gatherTile || q?.depositTile || q?.builtTC;
        };
        const heroesWithActions = playerHeroes.filter(hasAction);
        const heroesWithoutActions = playerHeroes.filter(h => !hasAction(h));

        return (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-auto z-50">
            <div className="bg-black/90 border border-cyan-500/50 rounded-lg px-8 py-6 text-center shadow-[0_0_30px_rgba(0,255,255,0.15)]">
              <div className="text-cyan-400 text-lg font-bold mb-2">END PLANNING?</div>
              <div className="text-gray-400 text-xs mb-1">
                {planningPlayerId === 'player1' ? 'Player 2 will plan next.' : 'All actions resolve by speed.'}
              </div>
              <div className="text-gray-500 text-[10px] mb-2">
                {heroesWithActions.length} of {playerHeroes.length} hero(es) have actions queued
              </div>
              {heroesWithoutActions.length > 0 && (
                <div className="text-yellow-400 text-xs mb-3 bg-yellow-900/30 border border-yellow-700/50 rounded px-3 py-2">
                  <div className="font-bold mb-1">Heroes without actions:</div>
                  {heroesWithoutActions.map(h => (
                    <div key={h.id} className="text-yellow-300">{h.name}</div>
                  ))}
                </div>
              )}
              <div className="flex gap-4 justify-center">
                <button onClick={confirmEndTurn} className="bg-cyan-900/50 hover:bg-cyan-700/50 border border-cyan-500 rounded px-6 py-2 text-cyan-400 text-sm uppercase tracking-wider">Confirm [SPACE]</button>
                <button onClick={cancelEndTurn} className="bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 rounded px-6 py-2 text-gray-400 text-sm uppercase tracking-wider">Cancel [ESC]</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function HeroInfoPanel({
  hero, queued, isPlanning, actionMode, setActionMode, isAnimating, toggleInventory, toggleBuildModal
}: {
  hero: Hero; queued?: QueuedAction; isPlanning: boolean; actionMode: ActionMode; setActionMode: (m: ActionMode) => void; isAnimating: boolean; toggleInventory: (heroId: string) => void; toggleBuildModal: () => void;
}) {
  const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';
  const hasQueuedMove = !!queued?.moveDest;
  const hasQueuedAttack = !!queued?.attackTargetTile;
  const hasQueuedGather = !!queued?.gatherTile;
  const hasQueuedDeposit = !!queued?.depositTile;
  const hasBuiltTC = !!queued?.builtTC;
  const gameState = useGameStore(s => s.gameState);
  // Check gather at current position OR move destination
  const gatherPos = queued?.moveDest || hero.position;
  const tile = gameState ? gameState.grid[gatherPos.r]?.[gatherPos.q] : null;
  const pouch = hero.inventory.resourcePouch;
  // Calculate total resources in pouch (support both multi-resource and legacy formats)
  const pouchResources = pouch?.resources || {};
  const legacyAmount = (pouch?.resourceType && pouch?.resourceAmount) ? pouch.resourceAmount : 0;
  const multiResourceTotal = Object.values(pouchResources).reduce((sum, n) => sum + (n || 0), 0);
  const pouchAmount = multiResourceTotal > 0 ? multiResourceTotal : legacyAmount;
  const pouchMax = pouch?.maxResourceAmount || 8;
  const hasSpace = pouchAmount < pouchMax;
  const canGather = !!(tile?.resourceType && (tile.resourceAmount ?? 0) > 0) && hasSpace;

  // Deposit locks out all actions, Gather disables move/attack, move/attack disable gather, building TC locks out all
  const depositLocksAll = hasQueuedDeposit || hasBuiltTC;
  const gatherLocksActions = hasQueuedGather || depositLocksAll;
  const actionsLockGather = hasQueuedMove || hasQueuedAttack || depositLocksAll;

  return (
    <div className="bg-black/85 border rounded-lg px-4 py-3 min-w-[300px] max-w-[320px]" style={{ borderColor: color + '66' }}>
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="font-bold uppercase" style={{ color }}>{hero.name}</div>
          <div className="text-gray-500 text-[10px] italic">{hero.lore}</div>
        </div>
        <div className="text-[10px] text-gray-500 uppercase">{hero.archetype}</div>
      </div>

      {/* Terrain info line */}
      {tile && (
        <div className="text-[10px] text-gray-400 mb-2 capitalize">
          {tile.terrain} | elev: {tile.elevation}
        </div>
      )}

      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{hero.stats.hp}/{hero.stats.maxHp}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: `${(hero.stats.hp / hero.stats.maxHp) * 100}%`,
            backgroundColor: hero.stats.hp > hero.stats.maxHp * 0.5 ? '#00ccaa' : hero.stats.hp > hero.stats.maxHp * 0.25 ? '#ccaa00' : '#cc3333',
          }} />
        </div>
      </div>

      <div className="flex gap-3 text-[10px] mb-2">
        <Stat label="ATK" value={hero.stats.atk} />
        <Stat label="DEF" value={hero.stats.def} />
        <Stat label="MOV" value={hero.stats.mov} />
        <Stat label="RNG" value={hero.stats.rng} />
        <Stat label="SPD" value={hero.stats.spd} />
      </div>

      {/* Deposit status - show checkmark when deposit is queued */}
      {hasQueuedDeposit && (
        <div className="text-[10px] text-purple-400 mt-2 bg-purple-900/30 border border-purple-700/50 rounded px-2 py-1">
          ✓ Depositing resources this turn
        </div>
      )}

      {isPlanning && !isAnimating && !hasQueuedDeposit && (
        <div className="flex gap-2 border-t border-gray-800 pt-2 mt-2">
          <button
            disabled={hasQueuedMove || gatherLocksActions}
            onClick={() => setActionMode(actionMode === 'move' ? 'idle' : 'move')}
            className={`flex-1 py-1 rounded text-xs font-bold uppercase transition-all ${
              actionMode === 'move' ? 'bg-green-700 text-white border border-green-400'
              : (hasQueuedMove || gatherLocksActions) ? 'bg-green-900/30 text-green-600 border border-green-800 cursor-not-allowed'
              : 'bg-green-900/40 text-green-400 border border-green-700 hover:bg-green-800/50'
            }`}
          >
            {hasQueuedMove ? '✓' : '⬡'} Move <span className="text-gray-500">(M)</span>
          </button>
          <button
            disabled={hasQueuedAttack || gatherLocksActions}
            onClick={() => setActionMode(actionMode === 'attack' ? 'idle' : 'attack')}
            className={`flex-1 py-1 rounded text-xs font-bold uppercase transition-all ${
              actionMode === 'attack' ? 'bg-red-700 text-white border border-red-400'
              : (hasQueuedAttack || gatherLocksActions) ? 'bg-red-900/30 text-red-600 border border-red-800 cursor-not-allowed'
              : 'bg-red-900/40 text-red-400 border border-red-700 hover:bg-red-800/50'
            }`}
          >
            {hasQueuedAttack ? '✓' : '⚔'} Atk <span className="text-gray-500">(T)</span>
          </button>
          {canGather && (
            <button
              disabled={hasQueuedGather || actionsLockGather}
              onClick={() => setActionMode(actionMode === 'gather' ? 'idle' : 'gather')}
              className={`flex-1 py-1 rounded text-xs font-bold uppercase transition-all ${
                actionMode === 'gather' ? 'bg-yellow-700 text-white border border-yellow-400'
                : (hasQueuedGather || actionsLockGather) ? 'bg-yellow-900/30 text-yellow-600 border border-yellow-800 cursor-not-allowed'
                : 'bg-yellow-900/40 text-yellow-400 border border-yellow-700 hover:bg-yellow-800/50'
              }`}
            >
              {hasQueuedGather ? '✓' : '⛏'} <span className="text-gray-500">(G)</span>
            </button>
          )}
        </div>
      )}

      {/* Inventory & Build Buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => toggleInventory(hero.id)}
          className="flex-1 py-1.5 rounded text-xs font-bold uppercase bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 flex items-center justify-center gap-1"
        >
          <span>🎒</span> <span className="text-gray-500">(I)</span> {pouchAmount > 0 && <span className="text-cyan-400">{pouchAmount}/{pouchMax}</span>}
        </button>
        {isPlanning && (() => {
          const hasAnyAction = hasQueuedMove || hasQueuedAttack || hasQueuedGather || hasQueuedDeposit || hasBuiltTC;
          return (
            <button
              onClick={hasAnyAction ? undefined : toggleBuildModal}
              disabled={hasAnyAction}
              className={`flex-1 py-1.5 rounded text-xs font-bold uppercase border flex items-center justify-center gap-1 ${
                hasAnyAction
                  ? 'bg-amber-900/20 text-amber-700 border-amber-900 cursor-not-allowed'
                  : 'bg-amber-900/40 hover:bg-amber-800/50 border-amber-700 text-amber-400'
              }`}
            >
              <span>🏗️</span> Build <span className="text-gray-500">(B)</span>
            </button>
          );
        })()}
      </div>
    </div>
  );
}

function TargetPanel({ hero, attacker, isPending }: { hero: Hero; attacker: Hero; isPending: boolean }) {
  const damage = Math.max(1, attacker.stats.atk - hero.stats.def);
  const hpAfter = Math.max(0, hero.stats.hp - damage);

  return (
    <div className="bg-black/85 border border-red-900/50 rounded-lg px-4 py-3 min-w-[220px]">
      <div className="text-red-400 font-bold uppercase mb-2">{hero.name} <span className="text-gray-500 text-[10px] normal-case">({hero.owner})</span></div>
      <div className="mb-2">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{hero.stats.hp} → <span className={hpAfter === 0 ? 'text-red-500 font-bold' : 'text-yellow-400'}>{hpAfter}</span></span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden relative">
          <div className="h-full rounded-full absolute top-0 left-0" style={{ width: `${(hero.stats.hp / hero.stats.maxHp) * 100}%`, backgroundColor: '#cc3333' }} />
          <div className="h-full rounded-full absolute top-0 left-0 transition-all duration-500" style={{
            width: `${(hpAfter / hero.stats.maxHp) * 100}%`,
            backgroundColor: hpAfter > hero.stats.maxHp * 0.5 ? '#00ccaa' : hpAfter > hero.stats.maxHp * 0.25 ? '#ccaa00' : '#cc3333',
          }} />
        </div>
      </div>
      <div className="flex gap-3 text-[10px] mb-2">
        <Stat label="ATK" value={hero.stats.atk} />
        <Stat label="DEF" value={hero.stats.def} />
        <Stat label="SPD" value={hero.stats.spd} />
      </div>
      <div className="text-[10px] text-orange-400 font-bold">
        ⚔ {damage} damage {hpAfter === 0 && <span className="text-red-500">— LETHAL</span>}
      </div>
      {isPending && <div className="mt-2 text-[10px] text-white animate-pulse">Double-click to confirm attack</div>}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div><span className="text-gray-500">{label} </span><span className="text-white">{value}</span></div>
);

function BuildModal({ hero }: { hero: Hero }) {
  const closeBuildModal = useGameStore(s => s.closeBuildModal);
  const startTCPlacement = useGameStore(s => s.startTCPlacement);
  const gameState = useGameStore(s => s.gameState);

  const player = gameState?.players[hero.owner];
  const hasTC = player?.buildings.some(b => b.type === 'town_center');

  const pouch = hero.inventory.resourcePouch;
  const wood = pouch?.resources?.wood || 0;
  const stone = pouch?.resources?.stone || 0;
  const food = pouch?.resources?.food || 0;
  const water = pouch?.resources?.water || 0;
  const canBuildTC = wood >= 1 && stone >= 1 && food >= 1 && water >= 1 && !hasTC;

  const handleBuildTC = () => {
    if (canBuildTC) {
      startTCPlacement(hero.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 pointer-events-auto" onClick={closeBuildModal}>
      <div className="bg-gray-900 border border-amber-900/50 rounded-lg p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-amber-400 mb-4 uppercase tracking-wider">Build Structure</h2>

        {/* Town Center Option */}
        <div className={`mb-4 p-3 bg-gray-800 rounded border ${canBuildTC ? 'border-amber-700 hover:border-amber-500 cursor-pointer' : 'border-gray-700 opacity-60'}`}
             onClick={handleBuildTC}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-amber-400">🏰 Town Center</div>
            {hasTC && <span className="text-xs text-red-400">(Limit 1)</span>}
          </div>
          <div className="text-xs text-gray-400 mb-3">
            Your base of operations. Required for respawning heroes and depositing resources. Grants +1 food +1 water on placement.
          </div>
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <div className={`flex items-center gap-1 ${wood >= 1 ? 'text-green-400' : 'text-red-400'}`}>
              <span>🪵</span> {wood}/1
            </div>
            <div className={`flex items-center gap-1 ${stone >= 1 ? 'text-green-400' : 'text-red-400'}`}>
              <span>🪨</span> {stone}/1
            </div>
            <div className={`flex items-center gap-1 ${food >= 1 ? 'text-green-400' : 'text-red-400'}`}>
              <span>🍖</span> {food}/1
            </div>
            <div className={`flex items-center gap-1 ${water >= 1 ? 'text-green-400' : 'text-red-400'}`}>
              <span>💧</span> {water}/1
            </div>
          </div>
          {canBuildTC && (
            <div className="mt-3 text-center text-xs text-amber-400 animate-pulse">Click to select location</div>
          )}
        </div>

        {/* Future buildings placeholder */}
        <div className="space-y-2 opacity-40">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">More Structures (Coming Soon)</div>
          {['Watchtower', 'Wall', 'Forge', 'Farm', 'Well'].map(name => (
            <div key={name} className="py-1 px-2 bg-gray-800/50 rounded text-sm text-gray-600">
              {name}
            </div>
          ))}
        </div>

        <button
          onClick={closeBuildModal}
          className="mt-4 w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold py-2 px-4 rounded uppercase text-sm tracking-wider"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function BuildingInfoPanel({ building, onRecruit, isOwnBuilding }: { building: import('@/lib/types').Building; onRecruit: () => void; isOwnBuilding: boolean }) {
  const queuedActions = useGameStore(s => s.queuedActions);
  const tcKey = `tc-${building.id}`;
  const trainingUnit = queuedActions[tcKey]?.trainUnit;

  return (
    <div className="bg-black/85 border border-amber-900/50 rounded-lg px-4 py-3 min-w-[280px]">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold uppercase text-amber-400">🏰 Town Center</div>
        <div className="text-[10px] text-gray-500">{building.owner}</div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{building.hp}/{building.maxHp}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${(building.hp / building.maxHp) * 100}%` }} />
        </div>
      </div>

      <div className="text-[10px] text-gray-400 mb-2">
        Respawn point for fallen heroes. Deposit resources here.
      </div>

      {/* Training status */}
      {trainingUnit && (
        <div className="text-[10px] text-cyan-400 mb-2 bg-cyan-900/30 border border-cyan-700/50 rounded px-2 py-1">
          Training: <span className="font-bold capitalize">{trainingUnit}</span> (spawns next round)
        </div>
      )}

      <div className="flex gap-2 border-t border-gray-800 pt-2">
        <button disabled className="flex-1 py-1 rounded text-xs font-bold uppercase bg-gray-800/50 text-gray-600 border border-gray-700 cursor-not-allowed">
          Construct
        </button>
        <button
          onClick={isOwnBuilding && !trainingUnit ? onRecruit : undefined}
          disabled={!isOwnBuilding || !!trainingUnit}
          title={trainingUnit ? `Already training ${trainingUnit}` : isOwnBuilding ? 'Recruit a unit (R)' : 'Not your building'}
          className={`flex-1 py-1 rounded text-xs font-bold uppercase border ${
            isOwnBuilding && !trainingUnit
              ? 'bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-400 border-cyan-700 cursor-pointer'
              : 'bg-gray-800/50 text-gray-600 border-gray-700 cursor-not-allowed'
          }`}
        >
          {trainingUnit ? '✓' : ''} Recruit <span className="text-gray-500">(R)</span>
        </button>
      </div>
    </div>
  );
}

function StatusPanel() {
  const gameState = useGameStore(s => s.gameState);
  const hoveredTile = useGameStore(s => s.hoveredTile);
  const hoveredHeroId = useGameStore(s => s.hoveredHeroId);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);

  if (!gameState) return null;

  const tile = hoveredTile ? gameState.grid[hoveredTile.r]?.[hoveredTile.q] : null;
  const hoveredHero = hoveredHeroId ? Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === hoveredHeroId) : null;

  // Check for units (scouts/farmers) on hovered tile
  const hoveredUnit = hoveredTile && !hoveredHero
    ? Object.values(gameState.players).flatMap(p => p.units).find(u => u.alive && u.position.q === hoveredTile.q && u.position.r === hoveredTile.r)
    : null;

  const isEnemy = (hoveredHero && hoveredHero.owner !== planningPlayerId) || (hoveredUnit && hoveredUnit.owner !== planningPlayerId);
  const isFriendly = (hoveredHero && hoveredHero.owner === planningPlayerId) || (hoveredUnit && hoveredUnit.owner === planningPlayerId);

  if (!tile && !hoveredHero && !hoveredUnit) return null;

  return (
    <div className="bg-black/85 border border-gray-700 rounded-lg px-3 py-2 min-w-[180px] text-xs">
      <div className="text-gray-400 font-bold mb-1 uppercase text-[10px]">Status</div>
      {tile && !hoveredHero && !hoveredUnit && (
        <div className="mb-2">
          <div className="capitalize text-gray-300">{tile.terrain} | elev: {tile.elevation.toFixed(1)}</div>
          {tile.resourceType && (
            <div className="text-yellow-400">{tile.resourceType}: {tile.resourceAmount || 0}</div>
          )}
        </div>
      )}
      {/* Unit info (Scout/Farmer) */}
      {hoveredUnit && (
        <div>
          <div className={`font-bold uppercase ${isEnemy ? 'text-red-400' : 'text-cyan-400'}`}>
            {hoveredUnit.unitType === 'scout' ? '⚔️ Scout' : '🌾 Farmer'}
          </div>
          <div className="text-gray-500 text-[10px]">{hoveredUnit.owner} {isFriendly ? '(Friendly)' : isEnemy ? '(Enemy)' : ''}</div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-500">HP</span>
            <span className="text-white">{hoveredUnit.stats.hp}/{hoveredUnit.stats.maxHp}</span>
          </div>
          <div className="w-full h-1 bg-gray-800 rounded mt-0.5">
            <div className={`h-full rounded ${isEnemy ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${(hoveredUnit.stats.hp / hoveredUnit.stats.maxHp) * 100}%` }} />
          </div>
          <div className="flex gap-2 mt-1 text-[10px]">
            {hoveredUnit.unitType === 'scout' && <Stat label="ATK" value={hoveredUnit.stats.atk} />}
            <Stat label="DEF" value={hoveredUnit.stats.def} />
            <Stat label="MOV" value={hoveredUnit.stats.mov} />
            <Stat label="SPD" value={hoveredUnit.stats.spd} />
          </div>
          {/* Pouch contents for farmers */}
          {hoveredUnit.unitType === 'farmer' && hoveredUnit.resourcePouch && Object.values(hoveredUnit.resourcePouch).some(v => v && v > 0) && (
            <div className="text-[10px] text-yellow-400 mt-1">
              Carrying: {Object.entries(hoveredUnit.resourcePouch).filter(([, v]) => v && v > 0).map(([k, v]) => `${k}: ${v}`).join(', ')}
            </div>
          )}
          {/* Show tile info below unit info */}
          {tile && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="capitalize text-gray-400 text-[10px]">{tile.terrain} | elev: {tile.elevation.toFixed(1)}</div>
              {tile.resourceType && (
                <div className="text-yellow-400 text-[10px]">{tile.resourceType}: {tile.resourceAmount || 0}</div>
              )}
            </div>
          )}
        </div>
      )}
      {hoveredHero && (
        <div className={hoveredHero ? '' : 'border-t border-gray-700 pt-2'}>
          <div className={`font-bold uppercase ${isEnemy ? 'text-red-400' : 'text-cyan-400'}`}>{hoveredHero.name}</div>
          <div className="text-gray-500 text-[10px]">{hoveredHero.owner} {isFriendly ? '(Friendly)' : isEnemy ? '(Enemy)' : ''}</div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-500">HP</span>
            <span className="text-white">{hoveredHero.stats.hp}/{hoveredHero.stats.maxHp}</span>
          </div>
          <div className="w-full h-1 bg-gray-800 rounded mt-0.5">
            <div className={`h-full rounded ${isEnemy ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${(hoveredHero.stats.hp / hoveredHero.stats.maxHp) * 100}%` }} />
          </div>
          <div className="flex gap-2 mt-1 text-[10px]">
            <Stat label="ATK" value={hoveredHero.stats.atk} />
            <Stat label="DEF" value={hoveredHero.stats.def} />
            <Stat label="SPD" value={hoveredHero.stats.spd} />
          </div>
          {/* Show tile info below hero info */}
          {tile && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="capitalize text-gray-400 text-[10px]">{tile.terrain} | elev: {tile.elevation.toFixed(1)}</div>
              {tile.resourceType && (
                <div className="text-yellow-400 text-[10px]">{tile.resourceType}: {tile.resourceAmount || 0}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TODDial({ timeOfDay, timeOfDayIndex, day, roundInDay }: { timeOfDay: TimeOfDay; timeOfDayIndex: number; day: number; roundInDay: number }) {
  const phases: { name: string; color: string; bgColor: string }[] = [
    { name: 'MORN', color: '#ffcc44', bgColor: '#443311' },
    { name: 'NOON', color: '#ffff66', bgColor: '#444422' },
    { name: 'DUSK', color: '#ff8844', bgColor: '#442211' },
    { name: 'NIGHT', color: '#6688cc', bgColor: '#112244' },
  ];

  const currentPhase = phases[timeOfDayIndex];
  // Dial rotates so current TOD is at TOP (where pointer points DOWN into dial)
  // We want current phase at TOP, so offset rotation
  const roundProgress = ((roundInDay - 1) % 3) * 30 + 15;
  const dialRotation = -(timeOfDayIndex * 90) - roundProgress + 180;

  return (
    <div className="flex flex-col items-center">
      {/* Day counter box - fixed at top */}
      <div className="z-20 text-xs text-gray-300 uppercase tracking-wider bg-black/95 px-4 py-1.5 rounded border border-gray-500 shadow-lg">
        Day <span className="text-white font-bold">{day}</span>
        <span className="text-gray-500 mx-1">|</span>
        <span style={{ color: currentPhase.color }} className="font-bold">{currentPhase.name}</span>
        <span className="text-gray-500 text-[10px] ml-1">({roundInDay}/12)</span>
      </div>

      {/* Pointer pointing DOWN at dial */}
      <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent z-20"
        style={{ borderTopColor: currentPhase.color, filter: `drop-shadow(0 0 4px ${currentPhase.color})` }}
      />

      {/* Dial - partially visible below pointer */}
      <div className="relative w-32 h-16 overflow-hidden -mt-1">
        <svg
          viewBox="0 0 100 100"
          className="w-32 h-32 absolute -top-16 left-0 transition-transform duration-700"
          style={{ transform: `rotate(${dialRotation}deg)` }}
        >
          {phases.map((phase, i) => {
            const startAngle = -90 + i * 90;
            const endAngle = startAngle + 90;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const x1 = 50 + 48 * Math.cos(startRad);
            const y1 = 50 + 48 * Math.sin(startRad);
            const x2 = 50 + 48 * Math.cos(endRad);
            const y2 = 50 + 48 * Math.sin(endRad);

            return (
              <path
                key={phase.name}
                d={`M 50 50 L ${x1} ${y1} A 48 48 0 0 1 ${x2} ${y2} Z`}
                fill={phase.bgColor}
                stroke="#333"
                strokeWidth="1"
              />
            );
          })}
          {/* Phase labels */}
          {phases.map((phase, i) => {
            const labelAngle = -90 + i * 90 + 45;
            const labelRad = (labelAngle * Math.PI) / 180;
            const labelRadius = 36;
            const x = 50 + labelRadius * Math.cos(labelRad);
            const y = 50 + labelRadius * Math.sin(labelRad);
            const textRotation = labelAngle + 90;
            return (
              <text
                key={phase.name}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={phase.color}
                fontSize="7"
                fontWeight="bold"
                transform={`rotate(${textRotation}, ${x}, ${y})`}
              >
                {phase.name}
              </text>
            );
          })}
          {/* Center */}
          <circle cx="50" cy="50" r="10" fill="#0a0a0a" stroke="#333" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

function EndPlanningDrawer({ phase, allHeroes, queuedActions, planningPlayerId, onEndTurn }: {
  phase: string; allHeroes: Hero[]; queuedActions: Record<string, QueuedAction>; planningPlayerId: string; onEndTurn: () => void;
}) {
  const playerHeroes = allHeroes.filter(h => h.owner === planningPlayerId && h.alive);
  const allQueued = playerHeroes.every(h => {
    const q = queuedActions[h.id];
    return q?.moveDest || q?.attackTargetTile || q?.gatherTile || q?.depositTile || q?.builtTC;
  });

  if (phase !== 'planning') return null;

  return (
    <div className={`mb-2 transition-all duration-300 ${allQueued ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
      <button
        onClick={onEndTurn}
        className="bg-cyan-900/60 hover:bg-cyan-800/70 border border-cyan-500/50 rounded px-5 py-2 text-sm text-cyan-400 font-bold uppercase tracking-wider transition-all hover:shadow-[0_0_15px_rgba(0,255,255,0.3)]"
      >
        End Planning <span className="text-gray-500 text-[10px]">[SPACE]</span>
      </button>
    </div>
  );
}

function RecruitModal() {
  const gameState = useGameStore(s => s.gameState);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const queuedActions = useGameStore(s => s.queuedActions);
  const closeRecruitModal = useGameStore(s => s.closeRecruitModal);
  const trainUnit = useGameStore(s => s.trainUnit);

  if (!gameState) return null;

  const player = gameState.players[planningPlayerId];
  const tc = player.buildings.find(b => b.type === 'town_center');
  if (!tc) return null;

  const tcKey = `tc-${tc.id}`;
  const alreadyTraining = queuedActions[tcKey]?.trainUnit;

  const units: { type: UnitType; name: string; icon: string; desc: string }[] = [
    { type: 'scout', name: 'Scout', icon: '⚔️', desc: 'Autonomous aggro unit. Attacks visible enemies, tracks last known position.' },
    { type: 'farmer', name: 'Farmer', icon: '🌾', desc: 'Controllable gatherer. Large pouch (10), efficient gathering (2-3 per action).' },
  ];

  const handleRecruit = (unitType: UnitType) => {
    if (trainUnit(unitType)) {
      playBlurSound();
      closeRecruitModal();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 pointer-events-auto" onClick={closeRecruitModal}>
      <div className="bg-gray-900 border border-cyan-900/50 rounded-lg p-5 w-96" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-cyan-400 mb-4 uppercase tracking-wider">Recruit Unit</h2>

        {alreadyTraining && (
          <div className="mb-4 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-400">
            Already training a {alreadyTraining} this turn
          </div>
        )}

        <div className="space-y-3">
          {units.map(({ type, name, icon, desc }) => {
            const stats = UNIT_STATS[type];
            const cost = UNIT_COSTS[type];
            const upkeep = UNIT_UPKEEP[type];
            const cap = UNIT_CAPS[type];
            const currentCount = player.units.filter(u => u.unitType === type && u.alive).length;

            const hasFood = player.resources.food >= cost.food;
            const hasWater = player.resources.water >= cost.water;
            const hasWood = player.resources.wood >= cost.wood;
            const hasStone = player.resources.stone >= cost.stone;
            const canAfford = hasFood && hasWater && hasWood && hasStone;
            const atCap = currentCount >= cap;
            const canRecruit = canAfford && !atCap && !alreadyTraining;

            return (
              <div
                key={type}
                className={`p-3 bg-gray-800 rounded border transition-all ${
                  canRecruit
                    ? 'border-cyan-700 hover:border-cyan-500 cursor-pointer'
                    : 'border-gray-700 opacity-60 cursor-not-allowed'
                }`}
                onClick={() => canRecruit && handleRecruit(type)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-bold text-cyan-400">{icon} {name}</div>
                  <div className="text-xs text-gray-500">{currentCount}/{cap}</div>
                </div>

                <div className="text-[10px] text-gray-400 mb-2">{desc}</div>

                {/* Stats */}
                <div className="flex gap-2 text-[10px] mb-2 flex-wrap">
                  <span><span className="text-gray-500">HP</span> <span className="text-white">{stats.hp}</span></span>
                  <span><span className="text-gray-500">ATK</span> <span className="text-white">{stats.atk}</span></span>
                  <span><span className="text-gray-500">DEF</span> <span className="text-white">{stats.def}</span></span>
                  <span><span className="text-gray-500">MOV</span> <span className="text-white">{stats.mov}</span></span>
                  <span><span className="text-gray-500">SPD</span> <span className="text-white">{stats.spd}</span></span>
                  {stats.pouchCapacity > 0 && (
                    <span><span className="text-gray-500">POUCH</span> <span className="text-white">{stats.pouchCapacity}</span></span>
                  )}
                </div>

                {/* Cost */}
                <div className="flex items-center gap-3 text-xs border-t border-gray-700 pt-2">
                  <span className="text-gray-500">Cost:</span>
                  {cost.food > 0 && (
                    <span className={hasFood ? 'text-green-400' : 'text-red-400'}>
                      🍖 {player.resources.food}/{cost.food}
                    </span>
                  )}
                  {cost.water > 0 && (
                    <span className={hasWater ? 'text-green-400' : 'text-red-400'}>
                      💧 {player.resources.water}/{cost.water}
                    </span>
                  )}
                  {cost.wood > 0 && (
                    <span className={hasWood ? 'text-green-400' : 'text-red-400'}>
                      🪵 {player.resources.wood}/{cost.wood}
                    </span>
                  )}
                  {cost.stone > 0 && (
                    <span className={hasStone ? 'text-green-400' : 'text-red-400'}>
                      🪨 {player.resources.stone}/{cost.stone}
                    </span>
                  )}
                </div>

                {/* Upkeep */}
                <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1">
                  <span>Upkeep:</span>
                  {upkeep.food > 0 && <span>🍖 {upkeep.food}/day</span>}
                  {upkeep.water > 0 && <span>💧 {upkeep.water}/day</span>}
                </div>

                {/* Status indicators */}
                {atCap && (
                  <div className="mt-2 text-xs text-red-400">At unit cap ({cap})</div>
                )}
                {canRecruit && (
                  <div className="mt-2 text-center text-xs text-cyan-400 animate-pulse">Click to recruit</div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={closeRecruitModal}
          className="mt-4 w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold py-2 px-4 rounded uppercase text-sm tracking-wider"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function UnitInfoPanel({
  unit, queued, actionMode, setActionMode, isAnimating
}: {
  unit: import('@/lib/types').Unit;
  queued?: QueuedAction;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  isAnimating: boolean;
}) {
  const gameState = useGameStore(s => s.gameState);
  const queuedActions = useGameStore(s => s.queuedActions);
  const color = unit.owner === 'player1' ? '#00ccff' : '#ff4444';
  const hasQueuedMove = !!queued?.moveDest;
  const hasQueuedGather = !!queued?.gatherTile;
  const hasQueuedDeposit = !!queued?.depositTile;

  // Check gather at current position OR move destination
  const gatherPos = queued?.moveDest || unit.position;
  const tile = gameState ? gameState.grid[gatherPos.r]?.[gatherPos.q] : null;
  const pouchResources = unit.resourcePouch || {};
  const pouchAmount = Object.values(pouchResources).reduce((sum, n) => sum + (n || 0), 0);
  const pouchMax = unit.stats.pouchCapacity || 16;
  const hasSpace = pouchAmount < pouchMax;
  // canGather checks if gathering is POSSIBLE (resource tile + space), not if already queued
  const canGatherTile = !!(tile?.resourceType && (tile.resourceAmount ?? 0) > 0) && hasSpace;
  // Show gather button if tile is gatherable OR if gather is already queued (to show checkmark)
  const showGatherButton = canGatherTile || hasQueuedGather;

  // Check if adjacent to own TC for deposit
  const ownTC = gameState ? Object.values(gameState.players).flatMap(p => p.buildings).find(b => b.type === 'town_center' && b.owner === unit.owner) : null;
  const isAdjacentToTC = ownTC && Math.abs(unit.position.q - ownTC.position.q) <= 1 && Math.abs(unit.position.r - ownTC.position.r) <= 1;
  const canDeposit = isAdjacentToTC && pouchAmount > 0 && !hasQueuedDeposit && !hasQueuedMove && !hasQueuedGather;

  const depositLocksAll = hasQueuedDeposit;
  // Gather doesn't lock move for farmers (to allow gather-then-move combo)
  const moveLockedByDeposit = depositLocksAll;

  const handleDeposit = () => {
    if (!canDeposit || !ownTC) return;
    const newQueued = { ...queuedActions };
    newQueued[unit.id] = { ...newQueued[unit.id], depositTile: { q: ownTC.position.q, r: ownTC.position.r } };
    useGameStore.setState({ queuedActions: newQueued });
  };

  return (
    <div className="bg-black/85 border rounded-lg px-4 py-3 min-w-[280px] max-w-[300px]" style={{ borderColor: color + '66' }}>
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="font-bold uppercase" style={{ color }}>
            {unit.unitType === 'farmer' ? '🌾 Farmer' : '⚔️ Scout'}
          </div>
          <div className="text-gray-500 text-[10px]">{unit.owner}</div>
        </div>
        <div className="text-[10px] text-gray-500 uppercase">{unit.unitType}</div>
      </div>

      {tile && (
        <div className="text-[10px] text-gray-400 mb-2 capitalize">
          {tile.terrain} | elev: {tile.elevation}
        </div>
      )}

      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{unit.stats.hp}/{unit.stats.maxHp}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: `${(unit.stats.hp / unit.stats.maxHp) * 100}%`,
            backgroundColor: unit.stats.hp > unit.stats.maxHp * 0.5 ? '#00ccaa' : unit.stats.hp > unit.stats.maxHp * 0.25 ? '#ccaa00' : '#cc3333',
          }} />
        </div>
      </div>

      <div className="flex gap-3 text-[10px] mb-2">
        <Stat label="MOV" value={unit.stats.mov} />
        <Stat label="DEF" value={unit.stats.def} />
        <Stat label="SPD" value={unit.stats.spd} />
        {unit.unitType === 'farmer' && <Stat label="POUCH" value={`${pouchAmount}/${pouchMax}`} />}
      </div>

      {/* Pouch contents */}
      {pouchAmount > 0 && (
        <div className="text-[10px] text-gray-400 mb-2 bg-gray-800/50 rounded px-2 py-1">
          Carrying: {Object.entries(pouchResources).filter(([, v]) => v && v > 0).map(([k, v]) => `${k}: ${v}`).join(', ')}
        </div>
      )}

      {/* Deposit status */}
      {hasQueuedDeposit && (
        <div className="text-[10px] text-purple-400 mt-2 bg-purple-900/30 border border-purple-700/50 rounded px-2 py-1">
          ✓ Depositing resources this turn
        </div>
      )}

      {/* Action buttons for Farmer - hidden when depositing */}
      {unit.unitType === 'farmer' && !isAnimating && !hasQueuedDeposit && (
        <div className="flex gap-2 border-t border-gray-800 pt-2 mt-2">
          <button
            disabled={hasQueuedMove || moveLockedByDeposit}
            onClick={() => setActionMode(actionMode === 'move' ? 'idle' : 'move')}
            className={`flex-1 py-1 rounded text-xs font-bold uppercase transition-all ${
              actionMode === 'move' ? 'bg-green-700 text-white border border-green-400'
              : (hasQueuedMove || moveLockedByDeposit) ? 'bg-green-900/30 text-green-600 border border-green-800 cursor-not-allowed'
              : 'bg-green-900/40 text-green-400 border border-green-700 hover:bg-green-800/50'
            }`}
          >
            {hasQueuedMove ? '✓' : '⬡'} Move <span className="text-gray-500">(M)</span>
          </button>
          {showGatherButton && (
            <button
              disabled={hasQueuedGather || depositLocksAll}
              onClick={() => !hasQueuedGather && setActionMode(actionMode === 'gather' ? 'idle' : 'gather')}
              className={`flex-1 py-1 rounded text-xs font-bold uppercase transition-all ${
                actionMode === 'gather' ? 'bg-yellow-700 text-white border border-yellow-400'
                : hasQueuedGather ? 'bg-yellow-900/30 text-yellow-600 border border-yellow-800 cursor-not-allowed'
                : depositLocksAll ? 'bg-yellow-900/30 text-yellow-600 border border-yellow-800 cursor-not-allowed'
                : 'bg-yellow-900/40 text-yellow-400 border border-yellow-700 hover:bg-yellow-800/50'
              }`}
            >
              {hasQueuedGather ? '✓' : '⛏'} <span className="text-gray-500">(G)</span>
            </button>
          )}
          {canDeposit && (
            <button
              onClick={handleDeposit}
              className="flex-1 py-1 rounded text-xs font-bold uppercase transition-all bg-purple-900/40 text-purple-400 border border-purple-700 hover:bg-purple-800/50"
            >
              📦 Deposit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
