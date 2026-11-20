# Implementation handoffs

> These are dated coordination logs between the agent teams, kept to show how the project was built. Paths under `/tmp` or `/var/folders` refer to local evidence files that are not part of this repository.

[Project overview](../../README.md) · [Project punch card](../PROGRESS.md)

This folder records agreements between implementation owners so parallel work uses compatible interfaces and clear file ownership.

- [Integration coordination](integration-coordination.md): owners, sequencing, live-test interface and final acceptance gates.
- [Parallel completion lanes](parallel-work.md): additional worker scopes, isolated runtime targets and evidence handoffs.
- [Review actions](review-actions.md): Opus findings, owner fixes, closure decisions and styling recommendation triage.
- [Frontend data contract](frontend-data-contract.md): UI data requirements and frontend/backend mappings.
- [Frontend updates](frontend-updates.md): selected interactions, verification evidence and acceptance checks.

The backend's [API contract](../../backend/docs/API_CONTRACT.md) and generated OpenAPI describe the wire interface. Handoff documents record proposed changes and their acceptance; a proposed field is not evidence that it has shipped.
