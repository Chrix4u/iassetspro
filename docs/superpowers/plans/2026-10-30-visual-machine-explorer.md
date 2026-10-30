# Visual Machine Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link 3D machine meshes to exact registry components and use those clicks for PM/repair target selection.

**Architecture:** Extend AssetMeshBinding with an optional ComponentRegistry FK. Preserve bindings in normalized scenes and expose component selection from DigitalTwinViewer. Embed the viewer as a new MachineVisualExplorer tab; existing 2D/AI views remain fallbacks.

**Tech Stack:** Next.js, React, TypeScript, Prisma/PostgreSQL, React Three Fiber, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-visual-machine-explorer.md`

## Global Constraints
- Component registry is the maintenance source of truth.
- AI visuals never auto-create authoritative component mappings.
- Existing asset-level mesh bindings remain backward compatible.

## Review Focus
- Component bound to the wrong machine must be rejected.
- Unmapped mesh clicks must not change PM/repair target.
- Scene without model/bindings must keep current empty/fallback UX.
- Existing 2D selection must remain unchanged.
- Viewer selection callback must not create React/R3F render loops.

---

### Task 1: Persistence and API component binding
- [ ] Write failing contract tests for schema and mesh-binding API.
- [ ] Add optional `componentId` FK + relation/index migration.
- [ ] Validate component belongs to `assetId` in create/update APIs and return component metadata.
- [ ] Run targeted tests and commit.

### Task 2: Viewer component-selection handoff
- [ ] Write failing normalization/viewer tests.
- [ ] Preserve mesh bindings in normalized scene state.
- [ ] Add `onComponentSelect` callback driven by selected mesh binding.
- [ ] Run targeted tests and commit.

### Task 3: Machine explorer 3D mode
- [ ] Write failing UI contract test.
- [ ] Add `3D Model` tab and lazy viewer wrapper resolving the asset twin.
- [ ] Wire mapped mesh component IDs into `setSelectedId` and existing selection callbacks.
- [ ] Add mapped/unmapped guidance; keep existing fallback modes intact.
- [ ] Run targeted tests and commit.

### Task 4: Verification
- [ ] Run digital-twin tests, PM hierarchy contract tests, typecheck and relevant lint.
- [ ] Review diff for plant scope, backward compatibility and mobile layout.
