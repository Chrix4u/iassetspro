# Planned Resource Coverage Forward-Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward-port the still-valid canonical Repairs resource-request coverage behavior from stale PR #553 onto current main without reviving superseded PM UI code.

**Architecture:** Keep `planningReadiness.service.ts` as the source of truth for recommendation/request coverage. Render that existing coverage in a small dedicated WO-detail component, and make the existing submission route ignore recommendations from unavailable Inventory/Tools modules before permission checks and request creation.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest, Testing Library.

**Spec:** PR #553 behavior plus current `src/services/pm/planningReadiness.service.ts` requestCoverage contract.

## Global Constraints
- Do not change Repairs approval/store workflow or schema.
- Do not revive stale PM schedule/task composition from PR #553.
- Rejected resource requests remain outstanding so execution staff can resubmit.
- Disabled Inventory/Tools modules are excluded from counts, permission requirements, and submission.
- Canonical `resources.requestCoverage` is authoritative; suggestion `pipelineStatus` is not.

## Review Focus
- Inventory disabled with material recommendations does not require material-request permission.
- Tools disabled with tool recommendations does not require tool-request permission.
- Rejected requests remain visibly outstanding.
- Already covered recommendations are not presented as outstanding.
- The UI hides disabled-module coverage while retaining enabled-module coverage.

---

### Task 1: Module-aware resource submission

**Files:**
- Modify: `src/app/api/work-orders/[id]/suggested-items/route.ts`
- Modify: `src/app/api/work-orders/[id]/suggested-items/__tests__/route.test.ts`

- [ ] Add failing tests for Inventory-disabled and Tools-disabled submission cases.
- [ ] Verify RED on current main.
- [ ] Filter `parts`/`tools` by operational module before permissions and submission.
- [ ] Verify focused route tests GREEN.
- [ ] Commit `fix(repairs): respect disabled resource modules on submit`.

### Task 2: Canonical WO planned-resource pipeline

**Files:**
- Create: `src/components/modules/pm/PmResourcePipelineCard.tsx`
- Create: `src/components/modules/pm/__tests__/PmResourcePipelineCard.test.tsx`
- Modify: `src/components/modules/MaintenancePages.tsx`

- [ ] Add failing rendered tests for outstanding, covered, rejected/resubmittable and disabled-module coverage.
- [ ] Verify RED because the component does not exist.
- [ ] Implement the focused pipeline component from canonical request coverage.
- [ ] Wire `PmPlanningReadinessData.resources.requestCoverage` into WO detail and remove suggestion-status derived counts.
- [ ] Run component + planning-readiness + changed-file lint tests GREEN.
- [ ] Commit `fix(pm): use canonical resource request coverage`.
