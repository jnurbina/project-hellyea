'use client';

import { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, CameraConfig } from '@/lib/game-store';
import { octileDistance } from '@/lib/grid';
import OctileTileMesh from './OctileTile';

// Helper to smoothly animate camera properties
function useSmoothCamera(config: CameraConfig | null) {
  const { camera } = useThree();
  
  useFrame((_, delta) => {
    if (!config) return;
    const ortho = camera as THREE.OrthographicCamera;
    
    // Lerp values for smooth transition
    const lerpFactor = delta * 3;
    camera.position.lerp(
      new THREE.Vector3(
        config.target.x + Math.sin(config.angle) * 15,
        15, // a bit lower for a more personal view
        config.target.z + Math.cos(config.angle) * 15
      ),
      lerpFactor
    );
    ortho.zoom = THREE.MathUtils.lerp(ortho.zoom, config.zoom, lerpFactor);
    
    camera.lookAt(config.target);
    ortho.updateProjectionMatrix();
  });
}

function CameraController() {
  const { gl } = useThree();
  const cameraConfig = useGameStore(s => s.cameraConfig);
  useSmoothCamera(cameraConfig); // Apply smooth transitions

  const isDraggingRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = gl.domElement;
    const handleMouseDown = (e: MouseEvent) => {
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dragStartPos.current.x);
      const dy = Math.abs(e.clientY - dragStartPos.current.y);
      if (dx > 5 || dy > 5) { // Dead zone to distinguish click from drag
        isDraggingRef.current = true;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingRef.current && e.target === canvas) {
        // This was a drag on the canvas background, prevent tile clicks
        e.stopPropagation();
      }
      isDraggingRef.current = false;
    };
    
    // We add the 'capture' option to ensure our logic runs before R3F's
    canvas.addEventListener('pointerdown', handleMouseDown, true);
    canvas.addEventListener('pointermove', handleMouseMove, true);
    canvas.addEventListener('pointerup', handleMouseUp, true);
    return () => {
      canvas.removeEventListener('pointerdown', handleMouseDown, true);
      canvas.removeEventListener('pointermove', handleMouseMove, true);
      canvas.removeEventListener('pointerup', handleMouseUp, true);
    };
  }, [gl]);

  // Expose the isDraggingRef via a global object for tile clicks to check
  useEffect(() => {
    (window as any).isCanvasDragging = isDraggingRef;
  }, []);

  return null;
}

function GameScene() {
  const store = useGameStore();
  const { gameState, selectedHero, hoveredTile, currentPath, activePlayerId } = store;

  const allHeroes = useMemo(() => 
    Object.values(gameState?.players || {}).flatMap(p => p.heroes),
    [gameState?.players]
  );
  const selectedHeroData = allHeroes.find(h => h.id === selectedHero);

  const heroPositions = useMemo(() => {
    const map = new Map<string, { heroId: string; color: string; owner: string }>();
    allHeroes.forEach(hero => {
      if (!hero.alive) return;
      const key = `${hero.position.q},${hero.position.r}`;
      const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';
      map.set(key, { heroId: hero.id, color, owner: hero.owner });
    });
    return map;
  }, [allHeroes]);

  if (!gameState) return null;

  const { grid, mapWidth, mapHeight } = gameState;
  const centerX = mapWidth / 2;
  const centerZ = mapHeight / 2;

  return (
    <>
      <OrthographicCamera makeDefault zoom={40} position={[centerX, 20, centerZ + 20]} />
      <CameraController />
      
      <ambientLight intensity={0.2} color="#334455" />
      <directionalLight position={[15, 25, 10]} intensity={0.7} color="#99aacc" />
      <directionalLight position={[-10, 15, -10]} intensity={0.25} color="#223344" />
      
      <fog attach="fog" args={['#060810', 30, 60]} />
      
      {grid.map((row, r) =>
        row.map((tile, q) => {
          const tileKey = `${q},${r}`;
          const heroOnTile = heroPositions.get(tileKey);
          
          let isAttackable = false;
          if (selectedHeroData && heroOnTile && heroOnTile.owner !== activePlayerId) {
            const dist = octileDistance(selectedHeroData.position.q, selectedHeroData.position.r, q, r);
            if (dist <= selectedHeroData.stats.rng && !selectedHeroData.hasAttacked) {
              isAttackable = true;
            }
          }

          return (
            <OctileTileMesh
              key={tileKey}
              tile={tile}
              isHighlighted={hoveredTile?.q === q && hoveredTile?.r === r}
              isPath={currentPath?.some(p => p.q === q && p.r === r) || false}
              isSelected={heroOnTile?.heroId === selectedHero}
              hasHero={!!heroOnTile && tile.visible === 'visible'}
              heroColor={heroOnTile?.color}
              isEnemy={!!heroOnTile && heroOnTile.owner !== activePlayerId}
              isAttackable={isAttackable}
              onClick={() => {
                if ((window as any).isCanvasDragging?.current) return; // Don't click after a drag
                if (isAttackable) {
                  store.attackHero(selectedHero!, heroOnTile!.heroId);
                } else if (heroOnTile && heroOnTile.owner === activePlayerId) {
                  store.selectHero(heroOnTile.heroId);
                } else if (selectedHero) {
                  store.moveHero(selectedHero, q, r);
                }
              }}
              onPointerEnter={() => store.setHoveredTile(q, r)}
              onPointerLeave={store.clearHover}
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
