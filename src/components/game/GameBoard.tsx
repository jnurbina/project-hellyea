'use client';

import { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import OctileTileMesh from './OctileTile';
import { useGameStore } from '@/lib/game-store';

// WASD + QE Camera Controller
function WASDCameraControls({ center }: { center: [number, number, number] }) {
  const { camera } = useThree();
  const keysRef = useRef<Set<string>>(new Set());
  const targetRef = useRef(new THREE.Vector3(...center));
  const angleRef = useRef(Math.PI / 4); // 45 degrees initial
  const distanceRef = useRef(20);
  const PAN_SPEED = 0.3;
  const ROTATE_SPEED = 0.02;
  const ZOOM_SPEED = 2;
  const ELEVATION = 20;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.max(15, Math.min(80, ortho.zoom - e.deltaY * 0.05));
      ortho.updateProjectionMatrix();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [camera]);

  useFrame(() => {
    const keys = keysRef.current;
    const angle = angleRef.current;
    
    // Forward direction based on camera angle
    const forwardX = -Math.sin(angle);
    const forwardZ = -Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);
    
    // WASD panning
    if (keys.has('w')) { targetRef.current.x += forwardX * PAN_SPEED; targetRef.current.z += forwardZ * PAN_SPEED; }
    if (keys.has('s')) { targetRef.current.x -= forwardX * PAN_SPEED; targetRef.current.z -= forwardZ * PAN_SPEED; }
    if (keys.has('a')) { targetRef.current.x -= rightX * PAN_SPEED; targetRef.current.z -= rightZ * PAN_SPEED; }
    if (keys.has('d')) { targetRef.current.x += rightX * PAN_SPEED; targetRef.current.z += rightZ * PAN_SPEED; }
    
    // QE rotation
    if (keys.has('q')) { angleRef.current -= ROTATE_SPEED; }
    if (keys.has('e')) { angleRef.current += ROTATE_SPEED; }
    
    // Update camera position
    const dist = distanceRef.current;
    camera.position.set(
      targetRef.current.x + Math.sin(angleRef.current) * dist,
      ELEVATION,
      targetRef.current.z + Math.cos(angleRef.current) * dist
    );
    camera.lookAt(targetRef.current);
  });

  return null;
}

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
      <WASDCameraControls center={[centerX, 0, centerZ]} />
      
      {/* Lighting — noir style */}
      <ambientLight intensity={0.2} color="#334455" />
      <directionalLight position={[15, 25, 10]} intensity={0.7} color="#99aacc" />
      <directionalLight position={[-10, 15, -10]} intensity={0.25} color="#223344" />
      {/* Subtle ground bounce */}
      <pointLight position={[centerX, -2, centerZ]} intensity={0.1} color="#224466" distance={40} />
      
      {/* Ground plane — dark void beneath the grid */}
      <mesh position={[centerX - 0.5, -0.5, centerZ - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[mapWidth + 10, mapHeight + 10]} />
        <meshStandardMaterial color="#08080c" roughness={0.95} metalness={0.1} />
      </mesh>
      
      {/* Subtle grid-boundary glow ring */}
      <mesh position={[centerX - 0.5, -0.05, centerZ - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(mapWidth, mapHeight) * 0.52, Math.max(mapWidth, mapHeight) * 0.55, 64]} />
        <meshBasicMaterial color="#1a3040" transparent opacity={0.3} />
      </mesh>
      
      {/* Fog/atmosphere — dark edges */}
      <fog attach="fog" args={['#060810', 30, 60]} />
      
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
