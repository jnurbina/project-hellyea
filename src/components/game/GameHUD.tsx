'use client';

import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '@/lib/game-store';
import { Hero } from '@/lib/types';

export default function GameHUD() {
  const gameState = useGameStore(s => s.gameState);
  const selectedHero = useGameStore(s => s.selectedHero);
  const activePlayerId = useGameStore(s => s.activePlayerId);
  const endTurn = useGameStore(s => s.endTurn);
  const selectHero = useGameStore(s => s.selectHero);
  const focusHero = useGameStore(s => s.focusHero);
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);

  const handleEndTurn = useCallback(() => {
    if (showEndTurnConfirm) {
      endTurn();
      setShowEndTurnConfirm(false);
    } else {
      setShowEndTurnConfirm(true);
    }
  }, [showEndTurnConfirm, endTurn]);

  const handleCancelEndTurn = useCallback(() => {
    setShowEndTurnConfirm(false);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleEndTurn(); }
      if (e.code === 'Escape') {
        if (showEndTurnConfirm) handleCancelEndTurn();
        else selectHero(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleEndTurn, handleCancelEndTurn, showEndTurnConfirm, selectHero]);

  if (!gameState || !activePlayerId) return null;

  const player = gameState.players[activePlayerId];
  if (!player) return null;

  const selectedHeroData = player.heroes.find(h => h.id === selectedHero);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-2 text-xs">
          <div className="text-cyan-400 font-bold mb-1">
            ROUND {gameState.turn} — {player.name}&apos;s Turn
          </div>
          <div className="text-gray-400">{gameState.phase.toUpperCase()}</div>
        </div>

        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-2 text-xs flex gap-4">
          {Object.entries(player.resources).map(([key, value]) => (
            <ResourceBadge key={key} label={key.slice(0, 2).toUpperCase()} value={value} />
          ))}
        </div>
      </div>

      {/* Bottom panel — hero cards + end turn */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-4 justify-center items-end">
        {player.heroes.map(hero => (
          <HeroCard
            key={hero.id}
            hero={hero}
            isSelected={selectedHero === hero.id}
            onSelect={() => selectHero(hero.alive ? hero.id : null)}
            onFocus={() => focusHero(hero.id)}
          />
        ))}

        <button
          onClick={handleEndTurn}
          className="pointer-events-auto bg-cyan-900/50 hover:bg-cyan-800/50 border border-cyan-500/50 rounded px-6 py-3 text-sm text-cyan-400 font-bold uppercase tracking-wider transition-colors"
        >
          End Turn <span className="text-gray-500 text-[10px]">[SPACE]</span>
        </button>
      </div>

      {showEndTurnConfirm && <EndTurnConfirm onConfirm={handleEndTurn} onCancel={handleCancelEndTurn} />}

      {/* Selected hero detail panel */}
      {selectedHeroData && (
        <div className="absolute top-20 left-4 pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-3 text-xs max-w-[220px]">
          <div className="text-cyan-400 font-bold mb-1">{selectedHeroData.name}</div>
          <div className="text-gray-500 text-[10px] italic mb-2">{selectedHeroData.lore}</div>
          {!selectedHeroData.hasMoved && <div className="text-green-400">▸ Click a tile to move</div>}
          {selectedHeroData.hasMoved && <div className="text-gray-600">✓ Moved</div>}
          {!selectedHeroData.hasAttacked && <div className="text-red-400">▸ Click an enemy to attack (rng: {selectedHeroData.stats.rng})</div>}
          {selectedHeroData.hasAttacked && <div className="text-gray-600">✓ Attacked</div>}
        </div>
      )}
    </div>
  );
}

function HeroCard({
  hero, isSelected, onSelect, onFocus,
}: {
  hero: Hero; isSelected: boolean; onSelect: () => void; onFocus: () => void;
}) {
  const fullySpent = hero.hasMoved && hero.hasAttacked;

  return (
    <div
      className={`pointer-events-auto bg-black/80 border rounded px-4 py-3 text-xs min-w-[200px] cursor-pointer transition-all select-none ${
        isSelected ? 'border-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]' : 'border-gray-700 hover:border-gray-500'
      } ${!hero.alive ? 'opacity-30' : fullySpent ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      <div className="flex justify-between items-center mb-2">
        {/* Double-click hero name → focus camera */}
        <span
          className="text-cyan-400 font-bold uppercase cursor-pointer hover:underline"
          onDoubleClick={(e) => { e.stopPropagation(); onFocus(); }}
          title="Double-click to center camera"
        >
          {hero.name}
        </span>
        <div className="flex gap-1.5">
          <ActionPip label="M" done={hero.hasMoved} />
          <ActionPip label="A" done={hero.hasAttacked} />
        </div>
      </div>

      {/* HP bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-gray-500">HP</span>
          <span className="text-white">{hero.stats.hp}/{hero.stats.maxHp}</span>
        </div>
        <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(hero.stats.hp / hero.stats.maxHp) * 100}%`,
              backgroundColor: hero.stats.hp > hero.stats.maxHp * 0.5 ? '#00ccaa' : hero.stats.hp > hero.stats.maxHp * 0.25 ? '#ccaa00' : '#cc3333',
            }}
          />
        </div>
      </div>

      <div className="flex gap-3 text-[10px]">
        <StatBadge label="ATK" value={hero.stats.atk} />
        <StatBadge label="DEF" value={hero.stats.def} />
        <StatBadge label="MOV" value={hero.stats.mov} />
        <StatBadge label="SPD" value={hero.stats.spd} />
        <StatBadge label="RNG" value={hero.stats.rng} />
      </div>

      {!hero.alive && <div className="mt-2 text-red-500 font-bold">☠ DEAD</div>}
      {hero.respawnTimer > 0 && <div className="mt-2 text-yellow-500">RESPAWNING ({hero.respawnTimer})</div>}
    </div>
  );
}

const EndTurnConfirm = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-auto">
    <div className="bg-black/90 border border-cyan-500/50 rounded-lg px-8 py-6 text-center shadow-[0_0_30px_rgba(0,255,255,0.15)]">
      <div className="text-cyan-400 text-lg font-bold mb-4">END TURN?</div>
      <div className="text-gray-400 text-xs mb-6">Pass control to the other player.</div>
      <div className="flex gap-4 justify-center">
        <button onClick={onConfirm} className="bg-cyan-900/50 hover:bg-cyan-700/50 border border-cyan-500 rounded px-6 py-2 text-cyan-400 text-sm uppercase tracking-wider">Confirm [SPACE]</button>
        <button onClick={onCancel} className="bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 rounded px-6 py-2 text-gray-400 text-sm uppercase tracking-wider">Cancel [ESC]</button>
      </div>
    </div>
  </div>
);

const ResourceBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2"><span className="text-gray-400">{label}</span><span className="text-white font-bold">{value}</span></div>
);
const StatBadge = ({ label, value }: { label: string; value: number | string }) => (
  <div><span className="text-gray-500">{label} </span><span className="text-white">{value}</span></div>
);
const ActionPip = ({ label, done }: { label: string; done: boolean }) => (
  <div className={`w-4 h-4 text-center text-[10px] leading-4 rounded-sm ${done ? 'bg-gray-700 text-gray-500 line-through' : 'bg-cyan-800 text-cyan-300'}`}>{label}</div>
);
