'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { Tile, TERRAIN_CONFIG } from '@/lib/types';

const octGeo = createOctagonGeometry();
const octEdgePoints = getOctagonEdgePoints();

// Simple geometries for resources, cached for performance
const resourceGeometries = {
  wood: new THREE.BoxGeometry(0.2, 0.08, 0.08),
  stone: new THREE.DodecahedronGeometry(0.08, 0),
  iron: new THREE.OctahedronGeometry(0.08, 0),
  food: new THREE.SphereGeometry(0.07, 8, 6),
  water: new THREE.TorusGeometry(0.06, 0.02, 6, 12),
};

interface OctileTileProps {
  tile: Tile;
  isHighlighted: boolean;
  isPath: boolean;
  isSelected: boolean;
  hasHero: boolean;
  heroColor?: string;
  isEnemy: boolean;
  isAttackable: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export default function OctileTileMesh({
  tile, isHighlighted, isPath, isSelected, hasHero, heroColor, isEnemy, isAttackable,
  onClick, onPointerEnter, onPointerLeave,
}: OctileTileProps) {
  
  const color = useMemo(() => {
    if (tile.visible === 'unexplored') return '#0c0c0e';
    const baseColor = TERRAIN_CONFIG[tile.terrain].color || '#2a2c30';
    if (tile.visible === 'explored') return darkenColor(baseColor, 0.35);
    if (isAttackable) return '#441111';
    if (isSelected) return '#003844';
    if (isPath) return '#002a33';
    if (isHighlighted) return isEnemy ? '#331818' : '#1e2830';
    return baseColor;
  }, [tile.visible, tile.terrain, isHighlighted, isPath, isSelected, isEnemy, isAttackable]);
  
  const edgeColor = useMemo(() => {
    if (tile.visible === 'unexplored') return '#0a0a10';
    if (isAttackable) return '#ff4444';
    if (isSelected) return '#00ddff';
    if (isPath) return '#0088aa';
    if (isHighlighted) return isEnemy ? '#aa4444' : '#3388aa';
    if (tile.visible === 'explored') return '#1a1c22';
    return '#3a5060';
  }, [tile.visible, isHighlighted, isPath, isSelected, isEnemy, isAttackable]);
  
  const elevation = tile.visible === 'unexplored' ? 0 : tile.elevation;
  
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
          transparent
          opacity={tile.visible === 'unexplored' ? 0.3 : 0.75}
          roughness={0.7}
          metalness={0.4}
        />
      </mesh>
      
      <Line
        points={octEdgePoints}
        color={edgeColor}
        lineWidth={1}
        transparent
        opacity={tile.visible === 'unexplored' ? 0.1 : 0.6}
      />
      
      {tile.resourceType && tile.resourceAmount && tile.visible !== 'unexplored' && (
        <ResourceIndicator type={tile.resourceType} amount={tile.resourceAmount} />
      )}
      
      {hasHero && (
        <HeroIndicator color={heroColor || '#ffffff'} />
      )}
    </group>
  );
}

function ResourceIndicator({ type, amount }: { type: NonNullable<Tile['resourceType']>, amount: number }) {
  const geo = resourceGeometries[type];
  const { color, rotation } = getResourceStyle(type);
  
  return (
    <group position={[0, 0.08, 0]}>
      <mesh geometry={geo} rotation={rotation}>
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <Text
        position={[0.2, 0, 0]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        fontSize={0.12}
        color="#ffffff"
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {amount}
      </Text>
    </group>
  );
}

function HeroIndicator({ color }: { color: string }) {
  return (
    <group position={[0, 0.25, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.22, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// === Helpers ===

function createOctagonGeometry(size: number = 0.46): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function getOctagonEdgePoints(size: number = 0.46): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const angle = ((i % 8) / 8) * Math.PI * 2 + Math.PI / 8;
    points.push([Math.cos(angle) * size, 0.07, Math.sin(angle) * size]);
  }
  return points;
}

function getResourceStyle(type: string) {
  switch (type) {
    case 'wood': return { color: '#4a3520', rotation: new THREE.Euler(0, 0, Math.PI / 2) };
    case 'stone': return { color: '#666666', rotation: new THREE.Euler(0, 0, 0) };
    case 'iron': return { color: '#8888aa', rotation: new THREE.Euler(0, 0, 0) };
    case 'food': return { color: '#447733', rotation: new THREE.Euler(0, 0, 0) };
    case 'water': return { color: '#3344aa', rotation: new THREE.Euler(Math.PI / 2, 0, 0) };
    default: return { color: '#555555', rotation: new THREE.Euler(0, 0, 0) };
  }
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.floor(r * factor).toString(16).padStart(2, '0')}${Math.floor(g * factor).toString(16).padStart(2, '0')}${Math.floor(b * factor).toString(16).padStart(2, '0')}`;
}
