## Description
<!-- Provide a clear description of the problem solved and changes implemented -->

## Linked Remediation Issues
- Fixes: [Issue ID, e.g., TEST-001, ARCH-009]

---

## Definition of Done (§4.3 Checklist)

Please verify all criteria before marking this pull request ready for review:

- [ ] **Scope Limitation**: Code changes are strictly limited to the issue's *Affected Files* (plus tests and documented context files).
- [ ] **Typecheck**: `npx tsc --noEmit` exits 0 with zero errors.
- [ ] **Lint & Guards**: `npm run lint` exits 0 (ESLint and all 10 Static Regression Guards pass).
- [ ] **Automated Tests**: `npm test` passes completely (Unit, Auth Matrix, DTO Snapshots, Concurrency).
- [ ] **Production Build**: `npm run build` succeeds cleanly.
- [ ] **Database Integrity** (if schema changed):
  - [ ] Migration file added in `supabase/migrations/`.
  - [ ] `npm run db:parity` passes 100% across all tables, columns, indexes, and constraints.
- [ ] **Safety Rules**: All 14 Implementation Safety Rules from §4.2 obeyed without exception.
- [ ] **Documentation**: `docs/ai-context/` updated per `.agent/skills/project-context-management/SKILL.md`.
