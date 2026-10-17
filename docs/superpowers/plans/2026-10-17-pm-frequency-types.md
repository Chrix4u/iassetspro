# PM Frequency Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy PM cadence picker with the canonical two-mode model — Time/Day or Meter — while preserving all existing schedules and due-date behavior.

**Architecture:** Keep `PmSchedule.frequencyType` as the existing string persistence boundary for this change, add a typed compatibility layer in `src/lib/pm-utils.ts`, and write new Time/Day schedules as explicit `time_<unit>` values. Legacy cadence strings remain readable and normalize into the new UI model. Meter scheduling remains backed by the existing component operating-hours trigger until additional real meter sources are implemented.

**Tech Stack:** Next.js, TypeScript, Prisma/PostgreSQL, Vitest, React.

**Spec:** Product decision in the PM/MRMP workstream: frequency type is exactly `Time/Day` or `Meter`; Time/Day units are minutes, hours, days, weeks, months, years; Meter uses the selected supported meter unit.

## Global Constraints

- User-facing frequency types are exactly `Time/Day` and `Meter`.
- Time/Day units are exactly minutes, hours, days, weeks, months, years.
- Frequency value must be a finite positive number.
- Do not destroy or bulk-rewrite legacy PM schedules.
- `custom_hours` retains its legacy meaning of component operating-hours meter scheduling; it must never be reinterpreted as calendar hours.
- New calendar-hour schedules use `time_hours`.
- New meter schedules use the existing real component operating-hours trigger (`hours`) in this PR; do not invent unsupported meter sources.
- Editing a legacy schedule presents its canonical mode/unit/value and upgrades it only when saved.
- Time-based edits recompute `nextDueDate`; Meter schedules use trigger thresholds rather than calendar next-due dates.

## Review Focus

- Legacy biweekly/quarterly/semiannual values preserve their effective interval when normalized.
- Switching Time/Day ↔ Meter cannot retain an incompatible unit.
- Calendar hours and operating-hours meter schedules remain semantically distinct.
- Invalid, zero, negative, NaN, or mismatched mode/unit payloads are rejected server-side.
- Existing API clients that send legacy `frequencyType` values remain compatible.

---

### Task 1: Canonical PM frequency domain

**Files:**
- Modify: `src/lib/pm-utils.ts`
- Create: `src/lib/__tests__/pm-utils.test.ts`

**Interfaces:**
- Produces: canonical mode/unit constants and types, legacy normalization, canonical serialization, validation, and due-date calculation for new `time_*` persistence values.
- Consumes: existing legacy `PmFrequencyType` strings and `calculateNextDueDate` callers.

- [ ] Write failing Vitest contracts for the two modes, six Time/Day units, legacy normalization, `custom_hours` meter semantics, canonical serialization, positive interval validation, and minute/hour/day/week/month/year due-date math.
- [ ] Run the focused test and verify RED because the canonical helpers/types do not exist yet.
- [ ] Implement the smallest compatibility layer in `pm-utils.ts` while retaining all legacy frequency strings.
- [ ] Run focused tests and verify GREEN.
- [ ] Commit.

### Task 2: Schedule API validation and update semantics

**Files:**
- Modify: `src/app/api/pm-schedules/route.ts`
- Modify: `src/app/api/pm-schedules/[id]/route.ts`
- Test: focused route/helper tests following existing Vitest patterns.

**Interfaces:**
- Consumes: canonical parser/serializer from Task 1.
- Produces: create/update endpoints that accept canonical mode/unit/value, retain legacy-client compatibility, reject incompatible inputs, recompute Time/Day due dates, and synchronize Meter triggers.

- [ ] Write failing tests for canonical create/update parsing, invalid mode/unit/value rejection, and due-date recomputation on Time/Day edit.
- [ ] Verify RED.
- [ ] Implement minimal route changes using the shared frequency domain.
- [ ] Verify focused route/helper tests GREEN.
- [ ] Commit.

### Task 3: PM schedule form and display

**Files:**
- Modify: `src/components/modules/MaintenancePages.tsx`
- Add/modify a focused source/behavior contract test using the repository's existing component-test conventions.

**Interfaces:**
- Consumes: canonical normalization/serialization from Task 1 and canonical API shape from Task 2.
- Produces: create/edit form with only Time/Day and Meter; dependent Time/Day unit selector; supported Meter unit/source; safe resets on mode changes; normalized schedule labels.

- [ ] Write the failing UI contract proving legacy cadence choices are no longer user-facing and the six Time/Day units are available.
- [ ] Verify RED.
- [ ] Replace legacy frequency picker/state with canonical mode + dependent unit state, normalize legacy records on edit, and send canonical API payloads.
- [ ] Keep the wide-screen frequency controls compact on one logical row where space permits.
- [ ] Verify focused UI tests GREEN.
- [ ] Commit.

### Task 4: Full verification and release gate

**Files:**
- No product changes unless a test exposes a defect.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: reviewable PR at an exact head SHA.

- [ ] Run focused PM tests, touched lint, TypeScript/Repairs release guard, and relevant build checks.
- [ ] Run full repository CI and require all eight project gates green.
- [ ] Review the exact branch diff for unrelated changes and legacy-data safety.
- [ ] Merge only with exact expected head SHA after all required gates pass.
