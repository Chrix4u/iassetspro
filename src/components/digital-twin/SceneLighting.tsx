'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface SceneLightingProps {
  /** Ambient light intensity (default: 0.4) */
  ambientIntensity?: number;
  /** Ambient light color (default: '#e0e0e8') */
  ambientColor?: string;
  /** Directional light intensity (default: 1.2) */
  directionalIntensity?: number;
  /** Directional light position (default: [10, 15, 10]) */
  directionalPosition?: [number, number, number];
  /** Whether shadows are enabled (default: true) */
  shadows?: boolean;
  /** Whether to show the environment background (default: false) */
  showEnvironmentBackground?: boolean;
  /** Spotlight enabled (default: false) */
  enableSpotlight?: boolean;
  /** Spotlight intensity (default: 2) */
  spotlightIntensity?: number;
  /** Fill light intensity (default: 0.4) */
  fillLightIntensity?: number;
  /** Rim light intensity (default: 0.8) */
  rimLightIntensity?: number;
}

// ============================================================================
// Component
// ============================================================================

export function SceneLighting({
  ambientIntensity = 0.4,
  ambientColor = '#e0e0e8',
  directionalIntensity = 1.2,
  directionalPosition = [10, 15, 10] as [number, number, number],
  shadows = true,
  showEnvironmentBackground = false,
  enableSpotlight = false,
  spotlightIntensity = 2,
  fillLightIntensity = 0.4,
  rimLightIntensity = 0.8,
}: SceneLightingProps) {
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);

  // Subtle directional light animation for realism — key light orbits slightly
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.05;

    // Key light: gentle orbital motion
    if (dirLightRef.current) {
      dirLightRef.current.position.x = directionalPosition[0] + Math.sin(t) * 2;
      dirLightRef.current.position.z = directionalPosition[2] + Math.cos(t) * 2;
    }

    // Fill light: complementary motion on opposite side
    if (fillLightRef.current) {
      fillLightRef.current.position.x = -8 + Math.sin(t * 0.7) * 1.5;
      fillLightRef.current.position.z = -6 + Math.cos(t * 0.7) * 1.5;
    }

    // Rim light: subtle oscillation from behind
    if (rimLightRef.current) {
      rimLightRef.current.position.x = Math.sin(t * 0.3) * 3;
      rimLightRef.current.position.z = -10 + Math.cos(t * 0.3) * 2;
    }
  });

  // Shadow map configuration
  const shadowConfig = useMemo(
    () => ({
      mapSizeWidth: 2048,
      mapSizeHeight: 2048,
      cameraFar: 50,
      cameraLeft: -15,
      cameraRight: 15,
      cameraTop: 15,
      cameraBottom: -15,
      bias: -0.0001,
    }),
    [],
  );

  return (
    <>
      {/* ── Ambient fill light ────────────────────────────────────────────── */}
      <ambientLight intensity={ambientIntensity} color={ambientColor} />

      {/* ── Key directional light with shadows (main light source) ───────── */}
      <directionalLight
        ref={dirLightRef}
        position={directionalPosition}
        intensity={directionalIntensity}
        castShadow={shadows}
        shadow-mapSize-width={shadowConfig.mapSizeWidth}
        shadow-mapSize-height={shadowConfig.mapSizeHeight}
        shadow-camera-far={shadowConfig.cameraFar}
        shadow-camera-left={shadowConfig.cameraLeft}
        shadow-camera-right={shadowConfig.cameraRight}
        shadow-camera-top={shadowConfig.cameraTop}
        shadow-camera-bottom={shadowConfig.cameraBottom}
        shadow-bias={shadowConfig.bias}
        color="#fffaf5"
      />

      {/* ── Fill light — softer, from opposite side to reduce harsh shadows ── */}
      <directionalLight
        ref={fillLightRef}
        position={[-8, 6, -6]}
        intensity={fillLightIntensity}
        color="#c4d4f0"
      />

      {/* ── Rim / back light — creates edge definition and depth ──────────── */}
      <directionalLight
        ref={rimLightRef}
        position={[0, 8, -10]}
        intensity={rimLightIntensity}
        color="#ffeedd"
      />

      {/* ── Hemisphere light for natural sky-ground fill ──────────────────── */}
      <hemisphereLight
        args={['#b1e1ff', '#b97a20', 0.3]}
      />

      {/* ── Optional spotlight for dramatic effect ────────────────────────── */}
      {enableSpotlight && (
        <spotLight
          ref={spotLightRef}
          position={[0, 12, 0]}
          angle={Math.PI / 6}
          penumbra={0.5}
          intensity={spotlightIntensity}
          castShadow={shadows}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          color="#fff5e6"
        />
      )}

      {/* Local studio reflection rig: no remote HDRI request, including on
          restricted factory networks. These lights are not machine geometry. */}
      <Environment
        resolution={128}
        frames={1}
        background={showEnvironmentBackground}
        backgroundBlurriness={0.8}
        backgroundIntensity={0.4}
      >
        <color attach="background" args={['#555c68']} />
        <Lightformer form="rect" intensity={4} color="#fffaf5"
          position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 5, 1]} />
        <Lightformer form="rect" intensity={2} color="#dce8ff"
          position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#fff0da"
          position={[0, 2, -5]} rotation={[0, 0, 0]} scale={[6, 4, 1]} />
      </Environment>
    </>
  );
}

export default SceneLighting;
