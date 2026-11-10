"""Standalone UI gateway. Run alongside the existing CodeIntelligence backend."""
import json
import os
from pathlib import Path
from urllib.parse import urlencode
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
BACKEND = os.getenv('CI_BACKEND_URL', 'http://127.0.0.1:8081').rstrip('/')
ALLOWED = {
 '/health', '/api/projects', '/api/projects/register', '/api/projects/import-git', '/api/jira-knowledge', '/api/jira-knowledge/search',
 '/api/knowledge-agent/ask', '/api/test-suites/search', '/api/test-suites/documents', '/api/knowledge-base/documents', '/api/knowledge-base/search',
 '/api/knowledge-sync/status', '/api/knowledge-sync/runs', '/api/knowledge-sync/sync-all', '/api/knowledge-sync/sources',
 '/api/mapping-intelligence/documents', '/api/mapping-intelligence/search',
 '/api/mapping-intelligence/lineage', '/api/mapping-intelligence/graph-lineage',
 '/api/scenarios/active-project', '/api/scenario-baselines/overview',
 '/api/storage/status', '/api/sdlc/releases',
 '/api/requirement-impact/analyze',
}
app = FastAPI(title='CodeIntelligence Agentic UI', version='1.0')
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')

@app.get('/')
def home():
    return FileResponse(ROOT / 'templates' / 'index.html')

@app.get('/ui/config')
def config():
    return {'mode':'LIVE', 'backend_configured':bool(BACKEND), 'ag_ui':'event-adapter', 'backend_target':'configured'}

@app.api_route('/ui/api/{path:path}', methods=['GET','POST','PATCH'])
async def gateway(path: str, request: Request):
    route = '/' + path
    if route not in ALLOWED and not (route.startswith('/api/knowledge-sync/sources/') and route.endswith('/disable') and request.method == 'POST' and route.split('/')[-2].isdigit()) and not (route.startswith('/api/knowledge-sync/sources/') and request.method == 'PATCH' and route.split('/')[-1].isdigit()) and not (route == '/api/knowledge-sync/connect' and request.method == 'POST') and not (route == '/api/knowledge-sync/jira/projects' and request.method == 'GET') and not (request.method == 'POST' and route.startswith('/api/knowledge-sync/sources/') and route.endswith('/sync') and route.split('/')[-2].isdigit()) and not (route.startswith('/api/release-snapshots/') and ((request.method == 'GET' and (route.endswith('/preview') or len(route.split('/')) == 4)) or (request.method == 'POST' and route == '/api/release-snapshots/finalize'))) and not (route.startswith('/api/scenario-baselines/latest/') and request.method == 'GET' and route.rsplit('/',1)[-1].isdigit()) and not (route.startswith('/api/scenario-baselines/capture/') and request.method == 'POST' and route.rsplit('/',1)[-1].isdigit()) and not (route.startswith('/api/sdlc/releases/') and (route.endswith('/report') or route.endswith('/compare'))):
        raise HTTPException(404, 'Route is not exposed by the UI gateway')
    params = dict(request.query_params)
    data = await request.body() if request.method in ('POST','PATCH') else None
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.request(request.method, BACKEND + route, params=params, content=data,
                headers={'content-type':'application/json'} if data else {})
        if resp.status_code >= 400:
            raise HTTPException(resp.status_code, detail=resp.text[:700])
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(502, f'Backend unavailable at configured CI_BACKEND_URL: {type(exc).__name__}') from exc
    except ValueError as exc:
        raise HTTPException(502, 'Backend returned non-JSON response') from exc

# Public project endpoints on the UI origin (8090). Forward unchanged to the
# existing backend project endpoints (8081). Other UI APIs keep /ui/api/*.
@app.api_route('/api/projects', methods=['GET'])
@app.api_route('/api/projects/register', methods=['POST'])
@app.api_route('/api/projects/import-git', methods=['POST'])
async def project_api_alias(request: Request):
    return await gateway(request.url.path.lstrip('/'), request)

@app.get('/ui/agent/events')
async def events(query: str, project_path: str = "", project: str = ""):
    """Forward backend investigation events without fabricating tool progress."""
    selected = (project_path or project).strip()
    if not query.strip() or not selected:
        raise HTTPException(400, 'Query and selected indexed project are required')

    async def stream():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=10)) as client:
                async with client.stream('POST', BACKEND + '/api/investigations/events',
                                         json={'query': query, 'project_path': selected}) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        yield chunk
        except Exception as exc:
            message = f'{type(exc).__name__}: investigation stream unavailable'
            yield 'event: RUN_ERROR\ndata: ' + json.dumps({'message': message}) + '\n\n'

    return StreamingResponse(stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
