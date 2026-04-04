'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import OctileTileMesh from './OctileTile';
import { useGameStore } from '@/lib/game-store';

function GameScene() {
  const gameState = useGameStore(s => s.gameState);
  const selectedHero = useGameStore(s => s.selectedHero);
  const hoveredTile = useGameStore(s => s.hoveredTile);
  const currentPath = useGameStore(s => s.currentPath);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const selectHero = useGameStore(s => s.selectHero);
  const setHoveredTile = useGameStore(s => s.setHoveredTile);
  const clearHover = useGameStore(s => s.clearHover);
  const moveHero = useGameStore(s => s.moveHero);

  const pathSet = useMemo(() => {
    if (!currentPath) return new Set<string>();
    return new Set(currentPath.map(p => `${p.q},${p.r}`));
  }, [currentPath]);

  // Collect all hero positions
  const heroPositions = useMemo(() => {
    if (!gameState) return new Map<string, { heroId: string; color: string; owner: string }>();
    const map = new Map<string, { heroId: string; color: string; owner: string }>();
    for (const player of Object.values(gameState.players)) {
      for (const hero of player.heroes) {
        if (!hero.alive) continue;
        const key = `${hero.position.q},${hero.position.r}`;
        const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';
        map.set(key, { heroId: hero.id, color, owner: hero.owner });
      }
    }
    return map;
  }, [gameState]);

  if (!gameState) return null;

  const { grid, mapWidth, mapHeight } = gameState;
  const centerX = mapWidth / 2;
  const centerZ = mapHeight / 2;

  return (
    <>
      <OrthographicCamera
        makeDefault
        zoom={40}
        position={[centerX + 15, 20, centerZ + 15]}
        near={0.1}
        far={200}
      />
      <OrbitControls
        target={[centerX, 0, centerZ]}
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        minZoom={15}
        maxZoom={80}
        maxPolarAngle={Math.PI / 2.5}
        minPolarAngle={Math.PI / 6}
      />
      
      {/* Ambient light — noir style, low */}
      <ambientLight intensity={0.15} />
      {/* Directional — sharp shadows */}
      <directionalLight position={[10, 20, 10]} intensity={0.6} color="#aabbcc" />
      {/* Rim light */}
      <directionalLight position={[-10, 10, -10]} intensity={0.2} color="#223344" />
      
      {/* Grid */}
      {grid.map((row, r) =>
        row.map((tile, q) => {
          const tileKey = `${q},${r}`;
          const heroData = heroPositions.get(tileKey);
          const isHovered = hoveredTile?.q === q && hoveredTile?.r === r;
          const isPath = pathSet.has(tileKey);
          const isSelected = heroData?.heroId === selectedHero;
          
          return (
            <OctileTileMesh
              key={tileKey}
              tile={tile}
              isHighlighted={isHovered}
              isPath={isPath}
              isSelected={isSelected}
              hasHero={!!heroData && tile.visible === 'visible'}
              heroColor={heroData?.color}
              onClick={() => {
                if (heroData && heroData.owner === localPlayerId) {
                  selectHero(heroData.heroId);
                } else if (selectedHero) {
                  moveHero(selectedHero, q, r);
                }
              }}
              onPointerEnter={() => setHoveredTile(q, r)}
              onPointerLeave={clearHover}
            />
          );
        })
      )}
    </>
  );
}

export default function GameBoard() {
  return (
    <div className="w-full h-full bg-black">
      <Canvas>
        <GameScene />
      </Canvas>
    </div>
  );
}
