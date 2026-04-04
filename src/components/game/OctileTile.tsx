'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Line, Text, Html } from '@react-three/drei';
import { Tile, TERRAIN_CONFIG } from '@/lib/types';
import { useGameStore } from '@/lib/game-store';

const TILE_SIZE = 0.46;
const TILE_DEPTH = 0.08;
const WALL_COLOR = '#2a2050'; // blue-purple cliff walls

const octGeo = createOctagonGeometry(TILE_SIZE, TILE_DEPTH);
const octEdgePoints = getOctagonEdgePoints(TILE_SIZE);

// Resource geometries (cached)
const resourceGeometries = {
  wood: new THREE.BoxGeometry(0.18, 0.06, 0.06),
  stone: new THREE.DodecahedronGeometry(0.07, 0),
  iron: new THREE.OctahedronGeometry(0.07, 0),
  food: new THREE.SphereGeometry(0.06, 8, 6),
  water: new THREE.TorusGeometry(0.05, 0.02, 6, 12),
};

interface OctileTileProps {
  tile: Tile;
  isHighlighted: boolean;
  isPath: boolean;
  isSelected: boolean;
  hasHero: boolean;
  heroColor?: string;
  isEnemy: boolean;
  isMoveRange: boolean;
  isAttackRange: boolean;
  isPending: boolean;
  hasQueuedMove: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export default function OctileTileMesh({
  tile, isHighlighted, isPath, isSelected, hasHero, heroColor, isEnemy,
  isMoveRange, isAttackRange, isPending, hasQueuedMove,
  onClick, onPointerEnter, onPointerLeave,
}: OctileTileProps) {
  const gameState = useGameStore(s => s.gameState);
  const allHeroes = useMemo(() => 
    gameState ? Object.values(gameState.players).flatMap(p => [...p.heroes]) : [],
    [gameState]
  );
  const heroOnTileData = useMemo(() => {
    const hero = allHeroes.find(h => h.position.q === tile.q && h.position.r === tile.r);
    return hero;
  }, [allHeroes, tile.q, tile.r]);

  const color = useMemo(() => {
    if (tile.visible === 'unexplored') return '#151618';
    const base = TERRAIN_CONFIG[tile.terrain].color;
    if (tile.visible === 'explored') return darkenColor(base, 0.5);
    if (isPending) return isAttackRange ? '#662222' : '#225533';
    if (isSelected) return '#004855';
    if (isPath) return '#1a4030';
    if (isHighlighted && isMoveRange) return '#1a3828';
    if (isHighlighted && isAttackRange) return '#3a1818';
    if (isHighlighted) return '#2a3540';
    if (hasQueuedMove) return '#1a3322';
    return base;
  }, [tile.visible, tile.terrain, isHighlighted, isPath, isSelected, isMoveRange, isAttackRange, isPending, hasQueuedMove]);

  const edgeColor = useMemo(() => {
    if (tile.visible === 'unexplored') return '#0e0f12';
    if (isPending) return isAttackRange ? '#ff6666' : '#66ff88';
    if (isSelected) return '#00ddff';
    if (isPath) return '#44cc66';
    if (isMoveRange) return '#33aa55';
    if (isAttackRange) return '#cc4444';
    if (isHighlighted) return isEnemy ? '#aa4444' : '#4499bb';
    if (hasQueuedMove) return '#44aa66';
    if (tile.visible === 'explored') return '#22242a';
    return '#4a5868';
  }, [tile.visible, isHighlighted, isPath, isSelected, isEnemy, isMoveRange, isAttackRange, isPending, hasQueuedMove]);

  const edgeOpacity = useMemo(() => {
    if (tile.visible === 'unexplored') return 0.15;
    if (isMoveRange || isAttackRange) return 0.85;
    if (isPending) return 1;
    return 0.6;
  }, [tile.visible, isMoveRange, isAttackRange, isPending]);

  const elevation = tile.visible === 'unexplored' ? 0 : tile.elevation;
  const showWall = elevation > 0.05;

  return (
    <group position={[tile.q, elevation, tile.r]}>
      <mesh
        geometry={octGeo}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onPointerEnter(); }}
        onPointerLeave={onPointerLeave}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.65}
          metalness={0.35}
          transparent={tile.visible === 'unexplored'}
          opacity={tile.visible === 'unexplored' ? 0.3 : 1}
        />
      </mesh>

      <Line
        points={octEdgePoints}
        color={edgeColor}
        lineWidth={isMoveRange || isAttackRange || isPending || hasQueuedMove ? 2 : 1.2}
        transparent
        opacity={edgeOpacity}
      />

      {/* Elevation cliff wall */}
      {showWall && tile.visible !== 'unexplored' && (
        <mesh position={[0, -elevation / 2 - TILE_DEPTH / 2, 0]}>
          <cylinderGeometry args={[TILE_SIZE * 0.92, TILE_SIZE * 0.95, elevation, 8]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.8} metalness={0.2} />
        </mesh>
      )}

      {/* Resource icon */}
      {tile.resourceType && tile.resourceAmount && tile.visible !== 'unexplored' && (
        <ResourceIndicator type={tile.resourceType} amount={tile.resourceAmount} />
      )}

      {/* Hero. Only render if alive, otherwise show skull. */}
      {heroOnTileData && heroOnTileData.alive && <HeroIndicator color={heroColor || '#ffffff'} />}
      {heroOnTileData && !heroOnTileData.alive && tile.visible !== 'unexplored' && <DeadHeroIndicator />}
    </group>
  );
}

function ResourceIndicator({ type, amount }: { type: NonNullable<Tile['resourceType']>; amount: number }) {
  const geo = resourceGeometries[type];
  const { color, rotation } = getResourceStyle(type);
  return (
    <group position={[0, TILE_DEPTH + 0.02, 0]}>
      <mesh geometry={geo} rotation={rotation}>
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <Text position={[0.18, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={0.11} color="#cccccc" anchorX="left" anchorY="middle" outlineWidth={0.012} outlineColor="#000000">
        {amount}
      </Text>
    </group>
  );
}

function HeroIndicator({ color }: { color: string }) {
  return (
    <group position={[0, TILE_DEPTH + 0.05, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.22, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function DeadHeroIndicator() {
  return (
    <group position={[0, TILE_DEPTH + 0.05, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
      <Html center style={{ pointerEvents: 'none' }}>
        <div className="text-gray-500 text-2xl animate-pulse select-none" style={{ textShadow: '0 0 8px black' }}>
          ☠
        </div>
      </Html>
    </group>
  );
}

// === Geometry ===

function createOctagonGeometry(size: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (i === 0) shape.moveTo(Math.cos(a) * size, Math.sin(a) * size);
    else shape.lineTo(Math.cos(a) * size, Math.sin(a) * size);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function getOctagonEdgePoints(size: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = ((i % 8) / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * size, TILE_DEPTH + 0.01, Math.sin(a) * size]);
  }
  return pts;
}

function getResourceStyle(type: string) {
  const styles: Record<string, { color: string; rotation: THREE.Euler }> = {
    wood: { color: '#6b4c2a', rotation: new THREE.Euler(0, 0, Math.PI / 2) },
    stone: { color: '#777777', rotation: new THREE.Euler(0, 0, 0) },
    iron: { color: '#9999bb', rotation: new THREE.Euler(0, 0, 0) },
    food: { color: '#559944', rotation: new THREE.Euler(0, 0, 0) },
    water: { color: '#4466cc', rotation: new THREE.Euler(Math.PI / 2, 0, 0) },
  };
  return styles[type] || { color: '#555555', rotation: new THREE.Euler(0, 0, 0) };
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.floor(r * factor).toString(16).padStart(2, '0')}${Math.floor(g * factor).toString(16).padStart(2, '0')}${Math.floor(b * factor).toString(16).padStart(2, '0')}`;
}
