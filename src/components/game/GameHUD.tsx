'use client';

import { useEffect, useMemo } from 'react';
import { useGameStore, QueuedAction } from '@/lib/game-store';
import { Hero } from '@/lib/types';

export default function GameHUD() {
  const gameState = useGameStore(s => s.gameState);
  const phase = useGameStore(s => s.phase);
  const round = useGameStore(s => s.round);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const selectedHeroId = useGameStore(s => s.selectedHeroId);
  const actionMode = useGameStore(s => s.actionMode);
  const queuedActions = useGameStore(s => s.queuedActions);
  const targetHeroId = useGameStore(s => s.targetHeroId);
  const pendingTarget = useGameStore(s => s.pendingTarget);
  const showEndTurnConfirm = useGameStore(s => s.showEndTurnConfirm);
  const resolutionOrder = useGameStore(s => s.resolutionOrder);
  const resolutionIndex = useGameStore(s => s.resolutionIndex);

  const selectHero = useGameStore(s => s.selectHero);
  const setActionMode = useGameStore(s => s.setActionMode);
  const requestEndTurn = useGameStore(s => s.requestEndTurn);
  const confirmEndTurn = useGameStore(s => s.confirmEndTurn);
  const cancelEndTurn = useGameStore(s => s.cancelEndTurn);
  const focusHero = useGameStore(s => s.focusHero);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (phase !== 'planning') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (showEndTurnConfirm) confirmEndTurn();
        else requestEndTurn();
      }
      if (e.code === 'Escape') {
        if (showEndTurnConfirm) cancelEndTurn();
        else if (actionMode !== 'idle') setActionMode('idle');
        else selectHero(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, showEndTurnConfirm, actionMode, confirmEndTurn, requestEndTurn, cancelEndTurn, setActionMode, selectHero]);

  const allHeroes = useMemo(() =>
    gameState ? Object.values(gameState.players).flatMap(p => [...p.heroes]) : [],
    [gameState]
  );

  if (!gameState) return null;

  const activePlayer = gameState.players[planningPlayerId];
  const selectedHero = allHeroes.find(h => h.id === selectedHeroId);
  const targetHero = targetHeroId ? allHeroes.find(h => h.id === targetHeroId) : null;

  return (
    <div className="absolute inset-0 pointer-events-none font-mono select-none">
      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-start gap-3">
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-3 py-2 text-xs shrink-0">
          <div className="text-cyan-400 font-bold">ROUND {round}</div>
          <div className="text-gray-500 text-[10px]">
            {phase === 'planning' ? `${activePlayer.name} — PLANNING` : '⚔ RESOLUTION'}
          </div>
        </div>

        {/* Hero roster */}
        {phase === 'planning' && (
          <div className="pointer-events-auto bg-black/80 border border-gray-700 rounded px-3 py-2 flex gap-1.5">
            {activePlayer.heroes.map(hero => {
              const q = queuedActions[hero.id];
              const isSelected = selectedHeroId === hero.id;
              const hasQueue = !!(q?.moveDest || q?.attackTargetId);
              return (
                <div
                  key={hero.id}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase cursor-pointer transition-all whitespace-nowrap border ${
                    isSelected ? 'border-cyan-400 bg-cyan-900/40 text-cyan-300'
                    : hasQueue ? 'border-green-700 bg-green-900/20 text-green-400'
                    : 'border-gray-700 bg-gray-800/30 text-gray-500 hover:border-gray-500'
                  } ${!hero.alive ? 'opacity-30 cursor-not-allowed' : ''}`}
                  onClick={() => { if (hero.alive) selectHero(hero.id); }}
                  onDoubleClick={() => focusHero(hero.id)}
                >
                  {hero.name}
                  {hasQueue && <span className="ml-1 text-green-500">✓</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Resolution tracker */}
        {phase === 'resolution' && (
          <div className="bg-black/80 border border-yellow-900/50 rounded px-3 py-2 flex gap-1.5">
            {resolutionOrder.map((heroId, idx) => {
              const hero = allHeroes.find(h => h.id === heroId);
              if (!hero) return null;
              const isCurrent = idx === resolutionIndex;
              const isDone = idx < resolutionIndex;
              const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';
              return (
                <div key={heroId} className={`px-2 py-1 rounded text-[10px] font-bold uppercase whitespace-nowrap border ${
                  isCurrent ? 'border-yellow-400 bg-yellow-900/40 text-yellow-300 animate-pulse'
                  : isDone ? 'bg-gray-800/50 text-gray-600 line-through border-transparent' : 'bg-gray-800/30 text-gray-500 border-transparent'
                }`}>
                  <span style={{ color: isCurrent ? undefined : isDone ? undefined : color }}>{hero.name}</span> ({hero.stats.spd})
                </div>
              );
            })}
          </div>
        )}

        {/* Resources */}
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-3 py-2 text-xs flex gap-3 ml-auto shrink-0">
          {Object.entries(activePlayer.resources).map(([k, v]) => (
            <div key={k} className="flex gap-1"><span className="text-gray-500">{k.slice(0, 2).toUpperCase()}</span><span className="text-white font-bold">{v}</span></div>
          ))}
        </div>
      </div>

      {/* ── Bottom Left: Selected hero panel ── */}
      {selectedHero && (
        <div className="absolute bottom-4 left-4 pointer-events-auto">
          <HeroInfoPanel hero={selectedHero} queued={queuedActions[selectedHero.id]} isPlanning={phase === 'planning' && selectedHero.owner === planningPlayerId} />
        </div>
      )}

      {/* ── Bottom Right: Target panel (during attack) ── */}
      {targetHero && selectedHero && (
        <div className="absolute bottom-4 right-4 pointer-events-auto">
          <TargetPanel hero={targetHero} attacker={selectedHero} isPending={!!pendingTarget} />
        </div>
      )}

      {/* ── Bottom Center: End Turn ── */}
      {phase === 'planning' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={requestEndTurn}
            className="bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-500/40 rounded px-6 py-2.5 text-sm text-cyan-400 font-bold uppercase tracking-wider transition-colors"
          >
            End Planning <span className="text-gray-500 text-[10px]">[SPACE]</span>
          </button>
        </div>
      )}

      {/* Resolution overlay */}
      {phase === 'resolution' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="bg-yellow-900/30 border border-yellow-500/30 rounded px-6 py-2 text-yellow-400 text-sm font-bold uppercase tracking-wider animate-pulse">
            ⚔ Resolving Actions...
          </div>
        </div>
      )}

      {/* Action mode indicator */}
      {actionMode !== 'idle' && phase === 'planning' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2">
          <div className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
            actionMode === 'move' ? 'bg-green-900/60 border border-green-500/50 text-green-400' : 'bg-red-900/60 border border-red-500/50 text-red-400'
          }`}>
            {actionMode === 'move' ? '⬡ SELECT MOVE TARGET' : '⚔ SELECT ATTACK TARGET'}
            {pendingTarget && <span className="ml-2 text-white animate-pulse">— Double-click to confirm</span>}
          </div>
        </div>
      )}

      {/* End Turn Confirmation */}
      {showEndTurnConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-auto">
          <div className="bg-black/90 border border-cyan-500/50 rounded-lg px-8 py-6 text-center shadow-[0_0_30px_rgba(0,255,255,0.15)]">
            <div className="text-cyan-400 text-lg font-bold mb-2">END PLANNING?</div>
            <div className="text-gray-400 text-xs mb-1">
              {planningPlayerId === 'player1' ? 'Player 2 will plan next.' : 'All actions resolve by speed.'}
            </div>
            <div className="text-gray-500 text-[10px] mb-4">
              {Object.keys(queuedActions).filter(id => allHeroes.find(h => h.id === id)?.owner === planningPlayerId).length} hero action(s) queued
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={confirmEndTurn} className="bg-cyan-900/50 hover:bg-cyan-700/50 border border-cyan-500 rounded px-6 py-2 text-cyan-400 text-sm uppercase tracking-wider">Confirm [SPACE]</button>
              <button onClick={cancelEndTurn} className="bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 rounded px-6 py-2 text-gray-400 text-sm uppercase tracking-wider">Cancel [ESC]</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Hero Info Panel (Bottom Left) ===

function HeroInfoPanel({ hero, queued, isPlanning }: { hero: Hero; queued?: QueuedAction; isPlanning: boolean }) {
  const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';

  return (
    <div className="bg-black/85 border rounded-lg px-4 py-3 min-w-[240px] max-w-[270px]" style={{ borderColor: color + '66' }}>
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="font-bold uppercase" style={{ color }}>{hero.name}</div>
          <div className="text-gray-500 text-[10px] italic">{hero.lore}</div>
        </div>
        <div className="text-[10px] text-gray-500 uppercase">{hero.archetype}</div>
      </div>

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

      {/* Queued actions display */}
      {isPlanning && queued && (
        <div className="border-t border-gray-800 pt-2 mt-1 text-[10px]">
          {queued.moveDest && <div className="text-green-400">⬡ Move queued → ({queued.moveDest.q}, {queued.moveDest.r})</div>}
          {queued.attackTargetId && <div className="text-red-400">⚔ Attack queued</div>}
        </div>
      )}

      {isPlanning && !queued && (
        <div className="text-[10px] text-gray-600 italic">Click hero to show actions</div>
      )}
    </div>
  );
}

// === Target Panel (Bottom Right) ===

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

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div><span className="text-gray-500">{label} </span><span className="text-white">{value}</span></div>
);
