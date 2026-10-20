# CodeIntelligenceUI — Live Agentic UI

A **standalone Python/FastAPI UI** based on the supplied dark three-column design, wired to the actual API routes found in the uploaded CodeIntelligence backend. It does **not** replace your backend, database, existing UI, IntelliJ plugin, or Java project.

## Run on Windows

1. Start the existing CodeIntelligence backend on **http://127.0.0.1:8081** (e.g. `python -m uvicorn main:app --reload --port 8081` in its own project folder).
2. Extract this ZIP and open a PowerShell terminal inside `CodeIntelligenceUI`.
3. Run:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CI_BACKEND_URL = "http://127.0.0.1:8081"
python -m uvicorn app:app --reload --port 8090
```

Or double-click `start_ui.bat` (which sets the default backend URL).

4. Open **http://127.0.0.1:8090**. The header shows **Backend connected** when the backend health check succeeds.

## Verified route mapping from the uploaded backend

| UI feature | Backend route |
|---|---|
| ASK / QA retrieval | `POST /api/knowledge-agent/ask` `{ "query": "..." }` |
| Project selector | `GET /api/projects` |
| Indexed JIRA | `GET /api/jira-knowledge` |
| JIRA search | `GET /api/jira-knowledge/search?query=...` |
| Knowledge Hub documents | `GET /api/knowledge-base/documents` |
| Knowledge Hub search | `GET /api/knowledge-base/search?query=...` |
| Knowledge Hub source status | `GET /api/knowledge-sync/status` |
| Mapping documents | `GET /api/mapping-intelligence/documents` |
| Attribute lineage | `GET /api/mapping-intelligence/lineage?attribute=...` |
| Mapping graph evidence | `GET /api/mapping-intelligence/graph-lineage?attribute=...` |
| Release report | `GET /api/sdlc/releases/{key}/report?project_path=...` |
| Baseline comparison | `GET /api/sdlc/releases/{key}/compare?project_path=...&from_version=1&to_version=2` |
| Diagnostics | `GET /health`, `GET /api/storage/status` |

## UI implementation

- Dark responsive top nav, recent-query sidebar, right-side evidence panes, KPI cards, tabs, collapsible Knowledge Hub and release panels.
- ASK results and provenance are **live**, not simulated. Counts show `—` where the backend has not returned verifiable structured metrics.
- An SSE **AG-UI-inspired adapter** emits `RUN_STARTED`, `STEP_STARTED`, `STEP_FINISHED`, `STATE_SNAPSHOT`, `RUN_FINISHED` / `RUN_ERROR`. It is **not the official AG-UI protocol** and the backend ASK route is synchronous; progress represents gateway stages, not individual LangGraph node telemetry.
- All displayed user/backend content is escaped; GitHub commit links from answers are clickable.
- Local browser recent-query history is optional and stored only in that browser. No private credentials are copied from the backend ZIP.
- A read-only UI gateway exposes a small allowlist of existing routes. Release baseline capture, project registration, source sync and write operations are intentionally not exposed in this version.

## Honest current limitations

- ASK currently returns primarily formatted text. The dependency graph tab can show structured path evidence when present, but a fully interactive node/edge graph needs a consistent graph JSON contract from the backend.
- KPI metrics are not fabricated. More structured response contracts are needed for accurate method/mapping/scenario counts.
- The QA panel uses the backend's existing reconciliation logic; it does not independently certify executions.
- This UI uses FastAPI + vanilla HTML/CSS/JS; no React or Node build step.
- Production deployments need authentication, authorization, TLS, CORS/security review, and user-specific access control. This local developer gateway is not intended for public internet exposure.

## Package contents

`app.py`, `requirements.txt`, `start_ui.bat`, `templates/index.html`, `static/style.css`, `static/app.js`, `README.md`.
