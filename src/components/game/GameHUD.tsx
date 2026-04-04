'use client';

import { useEffect, useMemo } from 'react';
import { useGameStore, ActionMode } from '@/lib/game-store';
import { Hero } from '@/lib/types';

export default function GameHUD() {
  const gameState = useGameStore(s => s.gameState);
  const activeHeroId = useGameStore(s => s.activeHeroId);
  const actionMode = useGameStore(s => s.actionMode);
  const round = useGameStore(s => s.round);
  const initiativeOrder = useGameStore(s => s.initiativeOrder);
  const initiativeIndex = useGameStore(s => s.initiativeIndex);
  const targetHeroId = useGameStore(s => s.targetHeroId);
  const pendingTarget = useGameStore(s => s.pendingTarget);
  const moveAnimation = useGameStore(s => s.moveAnimation);
  const setActionMode = useGameStore(s => s.setActionMode);
  const advanceTurn = useGameStore(s => s.advanceTurn);
  const focusHero = useGameStore(s => s.focusHero);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') setActionMode('move');
      if (e.code === 'KeyA') setActionMode('attack');
      if (e.code === 'Space') { e.preventDefault(); advanceTurn(); }
      if (e.code === 'Escape') setActionMode('idle');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setActionMode, advanceTurn]);

  const allHeroes = useMemo(() =>
    gameState ? Object.values(gameState.players).flatMap(p => [...p.heroes]) : [],
    [gameState]
  );

  if (!gameState || !activeHeroId) return null;

  const activeHero = allHeroes.find(h => h.id === activeHeroId);
  const targetHero = targetHeroId ? allHeroes.find(h => h.id === targetHeroId) : null;
  if (!activeHero) return null;

  const activePlayer = gameState.players[activeHero.owner];

  return (
    <div className="absolute inset-0 pointer-events-none font-mono select-none">
      {/* ── Top bar: Round + Initiative tracker ── */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-start gap-3">
        {/* Round info */}
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-3 py-2 text-xs shrink-0">
          <div className="text-cyan-400 font-bold">ROUND {round}</div>
          <div className="text-gray-500 text-[10px]">{activePlayer.name}</div>
        </div>

        {/* Initiative bar */}
        <div className="pointer-events-auto bg-black/80 border border-gray-700 rounded px-3 py-2 flex gap-1.5 items-center overflow-x-auto">
          {initiativeOrder.map((heroId, idx) => {
            const hero = allHeroes.find(h => h.id === heroId);
            if (!hero) return null;
            const isCurrent = idx === initiativeIndex;
            const isPast = idx < initiativeIndex;
            const color = hero.owner === 'player1' ? 'cyan' : 'red';
            return (
              <div
                key={heroId}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase cursor-pointer transition-all whitespace-nowrap ${
                  isCurrent ? `bg-${color}-900/50 border border-${color}-400 text-${color}-300 shadow-[0_0_8px_rgba(0,255,255,0.2)]`
                  : isPast ? 'bg-gray-800/50 text-gray-600 line-through'
                  : 'bg-gray-800/30 text-gray-500'
                }`}
                style={isCurrent ? { borderColor: hero.owner === 'player1' ? '#00ccff' : '#ff4444', color: hero.owner === 'player1' ? '#88ddff' : '#ff8888' } : {}}
                onClick={() => focusHero(heroId)}
              >
                {hero.name} <span className="text-gray-600">({hero.stats.spd})</span>
              </div>
            );
          })}
        </div>

        {/* Resources */}
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-3 py-2 text-xs flex gap-3 ml-auto shrink-0">
          {Object.entries(activePlayer.resources).map(([k, v]) => (
            <div key={k} className="flex gap-1"><span className="text-gray-500">{k.slice(0, 2).toUpperCase()}</span><span className="text-white font-bold">{v}</span></div>
          ))}
        </div>
      </div>

      {/* ── Bottom Left: Active Hero panel ── */}
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <ActiveHeroPanel hero={activeHero} actionMode={actionMode} setActionMode={setActionMode} advanceTurn={advanceTurn} animating={!!moveAnimation} />
      </div>

      {/* ── Bottom Right: Target panel (during attack) ── */}
      {targetHero && actionMode === 'attack' && (
        <div className="absolute bottom-4 right-4 pointer-events-auto">
          <TargetPanel hero={targetHero} attacker={activeHero} isPending={!!pendingTarget} />
        </div>
      )}

      {/* Action mode indicator */}
      {actionMode !== 'idle' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2">
          <div className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
            actionMode === 'move' ? 'bg-green-900/60 border border-green-500/50 text-green-400' : 'bg-red-900/60 border border-red-500/50 text-red-400'
          }`}>
            {actionMode === 'move' ? '⬡ SELECT MOVE TARGET' : '⚔ SELECT ATTACK TARGET'}
            {pendingTarget && <span className="ml-2 text-white animate-pulse">— Double-click to confirm</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveHeroPanel({ hero, actionMode, setActionMode, advanceTurn, animating }: {
  hero: Hero; actionMode: ActionMode; setActionMode: (m: ActionMode) => void; advanceTurn: () => void; animating: boolean;
}) {
  const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';

  return (
    <div className="bg-black/85 border rounded-lg px-4 py-3 min-w-[260px] max-w-[280px]" style={{ borderColor: color + '66' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="font-bold uppercase" style={{ color }}>{hero.name}</div>
          <div className="text-gray-500 text-[10px] italic">{hero.lore}</div>
        </div>
        <div className="text-[10px] text-gray-500 uppercase">{hero.archetype}</div>
      </div>

      {/* HP bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{hero.stats.hp}/{hero.stats.maxHp}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{
            width: `${(hero.stats.hp / hero.stats.maxHp) * 100}%`,
            backgroundColor: hero.stats.hp > hero.stats.maxHp * 0.5 ? '#00ccaa' : hero.stats.hp > hero.stats.maxHp * 0.25 ? '#ccaa00' : '#cc3333',
          }} />
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-[10px] mb-3">
        <Stat label="ATK" value={hero.stats.atk} />
        <Stat label="DEF" value={hero.stats.def} />
        <Stat label="MOV" value={hero.stats.mov} />
        <Stat label="RNG" value={hero.stats.rng} />
        <Stat label="SPD" value={hero.stats.spd} />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          disabled={hero.hasMoved || animating}
          onClick={() => setActionMode(actionMode === 'move' ? 'idle' : 'move')}
          className={`flex-1 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
            actionMode === 'move' ? 'bg-green-700 text-white border border-green-400' :
            hero.hasMoved ? 'bg-gray-800 text-gray-600 cursor-not-allowed' :
            'bg-green-900/40 text-green-400 border border-green-700 hover:bg-green-800/50'
          }`}
        >
          {hero.hasMoved ? '✓ Moved' : '⬡ Move'} <span className="text-gray-500 text-[9px]">[M]</span>
        </button>
        <button
          disabled={hero.hasAttacked || animating}
          onClick={() => setActionMode(actionMode === 'attack' ? 'idle' : 'attack')}
          className={`flex-1 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
            actionMode === 'attack' ? 'bg-red-700 text-white border border-red-400' :
            hero.hasAttacked ? 'bg-gray-800 text-gray-600 cursor-not-allowed' :
            'bg-red-900/40 text-red-400 border border-red-700 hover:bg-red-800/50'
          }`}
        >
          {hero.hasAttacked ? '✓ Attacked' : '⚔ Attack'} <span className="text-gray-500 text-[9px]">[A]</span>
        </button>
      </div>

      {/* End turn */}
      <button
        onClick={advanceTurn}
        disabled={animating}
        className="w-full mt-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700/50 transition-all"
      >
        End Hero Turn <span className="text-gray-600">[SPACE]</span>
      </button>
    </div>
  );
}

function TargetPanel({ hero, attacker, isPending }: { hero: Hero; attacker: Hero; isPending: boolean }) {
  const damage = Math.max(1, attacker.stats.atk - hero.stats.def);
  const hpAfter = Math.max(0, hero.stats.hp - damage);

  return (
    <div className="bg-black/85 border border-red-900/50 rounded-lg px-4 py-3 min-w-[220px]">
      <div className="text-red-400 font-bold uppercase mb-2">{hero.name} <span className="text-gray-500 text-[10px] normal-case">({hero.owner})</span></div>

      {/* HP bar with damage preview */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{hero.stats.hp} → <span className={hpAfter === 0 ? 'text-red-500 font-bold' : 'text-yellow-400'}>{hpAfter}</span></span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden relative">
          {/* Current HP */}
          <div className="h-full rounded-full absolute top-0 left-0 transition-all" style={{
            width: `${(hero.stats.hp / hero.stats.maxHp) * 100}%`,
            backgroundColor: '#cc3333',
          }} />
          {/* HP after damage */}
          <div className="h-full rounded-full absolute top-0 left-0 transition-all" style={{
            width: `${(hpAfter / hero.stats.maxHp) * 100}%`,
            backgroundColor: hpAfter > hero.stats.maxHp * 0.5 ? '#00ccaa' : hpAfter > hero.stats.maxHp * 0.25 ? '#ccaa00' : '#cc3333',
          }} />
        </div>
      </div>

      <div className="flex gap-3 text-[10px] mb-2">
        <Stat label="DEF" value={hero.stats.def} />
        <Stat label="SPD" value={hero.stats.spd} />
      </div>

      <div className="text-[10px] text-orange-400 font-bold">
        ⚔ {damage} damage {hpAfter === 0 && <span className="text-red-500">— LETHAL</span>}
      </div>

      {isPending && (
        <div className="mt-2 text-[10px] text-white animate-pulse">Double-click to confirm attack</div>
      )}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div><span className="text-gray-500">{label} </span><span className="text-white">{value}</span></div>
);
