import { useGameStore } from '@/lib/game-store';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';

export default function Minimap() {
  const gameState = useGameStore(s => s.gameState);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const focusHero = useGameStore(s => s.focusHero);
  const minimapRef = useRef<HTMLDivElement>(null);

  const { camera } = useThree();

  if (!gameState) return null;

  const { mapWidth, mapHeight } = gameState;

  const allHeroes = useMemo(() => 
    Object.values(gameState.players).flatMap(p => [...p.heroes]),
    [gameState]
  );

  // Access camera debug data and calculate minimap rectangle
  const cameraRect = useMemo(() => {
    const cameraDebug = (window as any).__cameraDebug;
    if (!cameraDebug) return null;

    const target = cameraDebug.targetRef.current; // World coordinates of camera target
    const zoom = cameraDebug.zoomRef.current;
    const orthoLeft = cameraDebug.orthoLeft;
    const orthoRight = cameraDebug.orthoRight;
    const orthoTop = cameraDebug.orthoTop;
    const orthoBottom = cameraDebug.orthoBottom;

    // Calculate visible width and height in world units at current zoom level
    const visibleWidthWorld = (orthoRight - orthoLeft) / zoom; 
    const visibleHeightWorld = (orthoTop - orthoBottom) / zoom; 

    const rectWidth = visibleWidthWorld;
    const rectHeight = visibleHeightWorld;

    const rectLeft = target.x - rectWidth / 2;
    const rectTop = target.z - rectHeight / 2;

    return {
      left: (rectLeft / mapWidth) * 100,
      top: (rectTop / mapHeight) * 100,
      width: (rectWidth / mapWidth) * 100,
      height: (rectHeight / mapHeight) * 100,
    };
  }, [mapWidth, mapHeight, useGameStore(s => s.cameraConfigVersion)]); // Re-calculate when camera config changes

  // Handle minimap clicks to move the main camera
  const handleMinimapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!minimapRef.current || !gameState) return;

    const rect = minimapRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const targetMapX = (clickX / rect.width) * mapWidth;
    const targetMapZ = (clickY / rect.height) * mapHeight;

    // Request the game store to focus the camera on this map position
    useGameStore.getState().focusHero(new THREE.Vector3(targetMapX, 0, targetMapZ)); 
  };

  return (
    <div
      ref={minimapRef}
      className='w-48 h-48 bg-gray-800/50 border border-gray-600 rounded-lg overflow-hidden relative cursor-pointer'
      onClick={handleMinimapClick}
    >
      {/* Grid background for minimap (simplified) */}
      <div
        className='absolute inset-0 grid opacity-20'
        style={{
          gridTemplateColumns: `repeat(${mapWidth}, 1fr)`,
          gridTemplateRows: `repeat(${mapHeight}, 1fr)`,
        }}
      >
        {Array.from({ length: mapWidth * mapHeight }).map((_, i) => (
          <div key={i} className='border border-gray-700/50' />
        ))}
      </div>

      {/* Heroes on minimap */}
      {allHeroes.map(hero => {
        if (!hero.alive) return null;
        const color = hero.owner === planningPlayerId ? 'white' : 'red';
        return (
          <div
            key={hero.id}
            className='absolute w-1 h-1 rounded-full' // Smaller dots for minimap
            style={{
              left: `${(hero.position.q / mapWidth) * 100}%`,
              top: `${(hero.position.r / mapHeight) * 100}%`,
              backgroundColor: color,
              transform: 'translate(-50%, -50%)', // Center the dot
            }}
            onClick={(e) => { e.stopPropagation(); focusHero(hero.id); }}
          />
        );
      })}

      {/* Camera view rectangle */}
      {cameraRect && (
        <div
          className='absolute border-2 border-cyan-400 pointer-events-none opacity-80'
          style={{
            left: `${cameraRect.left}%`,
            top: `${cameraRect.top}%`,
            width: `${cameraRect.width}%`,
            height: `${cameraRect.height}%`,
          }}
        />
      )}
    </div>
  );
}
