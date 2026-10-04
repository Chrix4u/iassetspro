'use client';

import { useRef, useState, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  useDigitalTwinStore,
  type DigitalTwinAnnotation,
} from '@/stores/digitalTwinStore';
import { useStoreSelector } from '@/hooks/useDigitalTwin';

// ============================================================================
// Types
// ============================================================================

export interface AnnotationLayerProps {
  /** Override annotations from the store (optional) */
  annotations?: DigitalTwinAnnotation[];
}

// ============================================================================
// Single Annotation Component — 3D pin with connecting line
// ============================================================================

interface AnnotationPinProps {
  annotation: DigitalTwinAnnotation;
  index: number;
}

function AnnotationPin({ annotation, index }: AnnotationPinProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const pinRef = useRef<HTMLDivElement>(null);
  const floatOffset = useRef(Math.random() * Math.PI * 2); // Random phase for float animation
  const sceneAssetId = useStoreSelector((s) => s.currentScene?.assetId ?? null);

  // 3D line from annotation position to the label position (offset upward)
  const targetPosition: [number, number, number] = [
    annotation.position[0],
    annotation.position[1] + 1.2,
    annotation.position[2],
  ];

  // Animate float effect
  const currentYOffset = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const floatAmount = Math.sin(t * 0.8 + floatOffset.current) * 0.08;
    currentYOffset.current = floatAmount;
  });

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (annotation.meshName && sceneAssetId) {
      setTimeout(() => {
        useDigitalTwinStore.getState().selectMesh(annotation.meshName!, sceneAssetId);
      }, 0);
      return;
    }

    setIsExpanded(true);
  }, [annotation.meshName, sceneAssetId]);

  // Determine the line endpoint including float offset
  const labelY = annotation.position[1] + 0.3 + currentYOffset.current;

  return (
    <group>
      {/* 3D connecting line from target point to annotation label */}
      <Line
        points={[
          new THREE.Vector3(...annotation.position),
          new THREE.Vector3(annotation.position[0], labelY + 0.35, annotation.position[2]),
        ]}
        color="#64748b"
        lineWidth={1}
        transparent
        opacity={0.5}
        dashed
        dashSize={0.1}
        gapSize={0.05}
      />

      {/* Small sphere at the annotation target point */}
      <mesh position={annotation.position}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial
          color="#94a3b8"
          emissive="#64748b"
          emissiveIntensity={0.3}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Annotation label via Html overlay */}
      <Html
        position={[
          annotation.position[0],
          labelY,
          annotation.position[2],
        ]}
        center
        distanceFactor={15}
        zIndexRange={[15, 0]}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex flex-col items-center group">
          {/* Annotation pin marker */}
          <div
            className="relative cursor-pointer"
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {/* Pin icon */}
            <div
              className="h-7 w-7 rounded-full bg-slate-800/90 border flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
              style={{
                borderColor: isExpanded
                  ? 'rgba(148,163,184,0.6)'
                  : 'rgba(148,163,184,0.3)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="12" y1="6" x2="12" y2="12" />
              </svg>
            </div>

            {/* Connecting stem from pin to card */}
            <div
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-px"
              style={{
                height: '12px',
                background:
                  'linear-gradient(to bottom, #94a3b8, transparent)',
              }}
            />
          </div>

          {/* Annotation card — always slightly visible, full on hover/click */}
          <div
            className={`mt-5 transition-all duration-300 ${
              isExpanded
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <div
              className="px-3 py-2.5 rounded-lg shadow-2xl max-w-[200px] border"
              style={{
                background: 'rgba(10,10,20,0.95)',
                borderColor: isExpanded
                  ? 'rgba(148,163,184,0.3)'
                  : 'rgba(148,163,184,0.15)',
                backdropFilter: 'blur(16px)',
              }}
            >
              {/* Author + timestamp header */}
              {(annotation.author || annotation.createdAt) && (
                <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-white/5">
                  {annotation.author && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                        style={{
                          background: 'rgba(148,163,184,0.2)',
                          color: '#94a3b8',
                        }}
                      >
                        {annotation.author.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium">
                        {annotation.author}
                      </span>
                    </div>
                  )}
                  {annotation.createdAt && (
                    <span className="text-[8px] text-slate-500">
                      {new Date(annotation.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}

              {/* Annotation text */}
              <p className="text-[11px] text-slate-200 leading-relaxed">
                {annotation.text}
              </p>

              {/* Mesh reference */}
              {annotation.meshName && (
                <div className="mt-1.5 pt-1.5 border-t border-white/5">
                  <span className="text-[8px] text-slate-500 font-mono">
                    📍 {annotation.meshName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}

// ============================================================================
// Main AnnotationLayer Component
// ============================================================================

// Stable empty array constant — prevents new reference on every selector call
// which would cause infinite re-renders in R3F reconciler (Error #185)
const EMPTY_ANNOTATIONS: DigitalTwinAnnotation[] = [];

export function AnnotationLayer({
  annotations: externalAnnotations,
}: AnnotationLayerProps) {
  // useStoreSelector: Safe alternative to useDigitalTwinStore() inside R3F Canvas.
  // Avoids useSyncExternalStore cross-reconciler cascading (Error #185).
  const annotationsVisible = useStoreSelector((s) => s.annotationsVisible);
  const storeAnnotations = useStoreSelector(
    (s) => s.currentScene?.annotations || EMPTY_ANNOTATIONS,
  );

  const annotations = externalAnnotations ?? storeAnnotations;

  if (!annotationsVisible || annotations.length === 0) return null;

  return (
    <group>
      {annotations.map((annotation, index) => (
        <AnnotationPin
          key={annotation.id}
          annotation={annotation}
          index={index}
        />
      ))}
    </group>
  );
}

export default AnnotationLayer;
