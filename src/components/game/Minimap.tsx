import { useGameStore } from '@/lib/game-store';
import { useRef, useState, useEffect, useCallback } from 'react';

export default function Minimap() {
  const gameState = useGameStore(s => s.gameState);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const focusHero = useGameStore(s => s.focusHero);
  const focusPosition = useGameStore(s => s.focusPosition);
  const cameraConfigVersion = useGameStore(s => s.cameraConfigVersion);
  const actionMode = useGameStore(s => s.actionMode);
  const cancelAction = useGameStore(s => s.cancelAction);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraRect, setCameraRect] = useState<{ left: number; top: number; width: number; height: number; angle: number } | null>(null);

  // Update camera rect from debug data
  useEffect(() => {
    const updateRect = () => {
      const cameraDebug = (window as any).__cameraDebug;
      if (!cameraDebug || !gameState) return;

      const target = cameraDebug.targetRef.current;
      const zoom = cameraDebug.zoomRef.current;
      const angle = cameraDebug.angleRef.current;
      const { mapWidth, mapHeight } = gameState;

      // Get actual viewport dimensions for proper aspect ratio calculation
      const canvas = document.querySelector('canvas');
      const viewportWidth = canvas?.clientWidth || window.innerWidth;
      const viewportHeight = canvas?.clientHeight || window.innerHeight;
      const aspectRatio = viewportWidth / viewportHeight;

      // Orthographic camera frustum: left=-10, right=10, top=10, bottom=-10
      // At zoom=1, visible area is 20x20 units. At zoom=120, it's 20/120 = 0.167 units
      const orthoSize = 20; // Total ortho frustum size (left=-10 to right=10)

      // Calculate visible world units based on zoom
      // The orthographic camera scales by zoom, so visible = frustum / zoom
      const baseVisibleHeight = orthoSize / zoom;
      const baseVisibleWidth = baseVisibleHeight * aspectRatio;

      // Scale factor to convert from camera units to world units on ground plane
      // The camera is at elevation 12 looking down at an angle, which affects projection
      // This factor accounts for the oblique view (camera is not directly overhead)
      const projectionScale = 12; // Empirical adjustment for the camera's viewing angle

      const visibleWidth = baseVisibleWidth * projectionScale;
      const visibleHeight = baseVisibleHeight * projectionScale;

      // Center position as percentage
      const centerX = (target.x / mapWidth) * 100;
      const centerZ = (target.z / mapHeight) * 100;

      // Rect dimensions as percentage
      const rectWidth = (visibleWidth / mapWidth) * 100;
      const rectHeight = (visibleHeight / mapHeight) * 100;

      setCameraRect({
        left: centerX,
        top: centerZ,
        width: Math.min(100, rectWidth),
        height: Math.min(100, rectHeight),
        angle: angle + Math.PI / 2, // Rotate 90deg to represent horizontal viewport
      });
    };

    updateRect();
    const interval = setInterval(updateRect, 50); // Faster updates for smoother sync
    return () => clearInterval(interval);
  }, [gameState, cameraConfigVersion]);

  const getMapPosition = useCallback((clientX: number, clientY: number) => {
    if (!minimapRef.current || !gameState) return null;
    const rect = minimapRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * gameState.mapWidth;
    const z = ((clientY - rect.top) / rect.height) * gameState.mapHeight;
    return { x, z };
  }, [gameState]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (actionMode !== 'idle') cancelAction();
    setIsDragging(true);
    const pos = getMapPosition(e.clientX, e.clientY);
    if (pos) focusPosition(pos.x, pos.z);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const pos = getMapPosition(e.clientX, e.clientY);
    if (pos) focusPosition(pos.x, pos.z);
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  if (!gameState) return null;
  const { mapWidth, mapHeight } = gameState;

  const allHeroes = Object.values(gameState.players).flatMap(p => [...p.heroes]);

  return (
    <div
      ref={minimapRef}
      className="w-48 h-48 bg-gray-900/80 border border-gray-600 rounded-lg overflow-hidden relative cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Grid background */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: mapHeight }).map((_, r) => (
          <div key={r} className="flex" style={{ height: `${100 / mapHeight}%` }}>
            {Array.from({ length: mapWidth }).map((_, q) => {
              const tile = gameState.grid[r]?.[q];
              const colors: Record<string, string> = {
                plains: '#3a3c40', forest: '#2a4a2a', mountain: '#5a5c60',
                water: '#1a2540', ruins: '#4a3a4a'
              };
              return (
                <div
                  key={q}
                  style={{
                    width: `${100 / mapWidth}%`,
                    backgroundColor: tile ? colors[tile.terrain] || '#333' : '#333',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Heroes */}
      {allHeroes.map(hero => {
        if (!hero.alive) return null;
        const isOwned = hero.owner === planningPlayerId;
        return (
          <div
            key={hero.id}
            className="absolute w-2 h-2 rounded-full border border-black/50"
            style={{
              left: `${(hero.position.q / mapWidth) * 100}%`,
              top: `${(hero.position.r / mapHeight) * 100}%`,
              backgroundColor: isOwned ? '#00ffff' : '#ff4444',
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => { e.stopPropagation(); focusHero(hero.id); }}
          />
        );
      })}

      {/* Camera FOV rectangle - centered and rotated */}
      {cameraRect && (
        <div
          className="absolute border-2 border-white/80 pointer-events-none"
          style={{
            left: `${cameraRect.left}%`,
            top: `${cameraRect.top}%`,
            width: `${cameraRect.width}%`,
            height: `${cameraRect.height}%`,
            transform: `translate(-50%, -50%) rotate(${cameraRect.angle}rad)`,
            transformOrigin: 'center center',
          }}
        />
      )}
    </div>
  );
}
