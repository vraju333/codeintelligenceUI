'use strict';
const $=id=>document.getElementById(id);const state={result:null,question:'',tab:'overview',view:'ask',project:'',recent:[]};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>typeof x==='string'?x:JSON.stringify(x,null,2);
const item=(title,body)=>`<div class="item"><strong>${esc(title)}</strong><small>${esc(body)}</small></div>`;
const notice=s=>`<div class="notice">${esc(s)}</div>`;
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',3500)}
async function api(path,opts={}){const res=await fetch('/ui/api'+path,opts);const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.detail||`HTTP ${res.status}`);return data}
function listOf(data){if(Array.isArray(data))return data;for(const k of ['results','items','projects','documents','sources','releases','scenarios','data'])if(Array.isArray(data?.[k]))return data[k];return []}
function textAnswer(r){return r?.answer||r?.message||r?.summary||r?.response||JSON.stringify(r,null,2)}
function findLinks(str){return esc(str).replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/[a-f0-9]{7,40}/gi,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u} ↗</a>`)}
function mappingContent(r){
 const rows=Array.isArray(r.mapping_rows)?r.mapping_rows:[];
 const docs=Array.isArray(r.mapping_documents)?r.mapping_documents:[];
 let html=`<section class="ci-result"><div class="ci-result-head"><div><div class="ci-eyebrow">KNOWLEDGE HUB · SOURCE-VERIFIED</div><h3>Mapping documents for ${esc(r.attribute||'attribute')}</h3><div class="ci-sub">${rows.length} mapping row${rows.length===1?'':'s'} · ${docs.length} document${docs.length===1?'':'s'}</div></div><span class="ci-status">${esc(r.status||'FOUND')}</span></div>`;
 if(!rows.length)return html+notice(r.answer||'No imported mapping evidence found.')+'</section>';
 html+=docs.map(d=>`<div class="ci-document"><div class="ci-document-title">▤ ${esc(d.filename||d.title||d.document||'Mapping document')}</div><div class="ci-sub">${esc(d.row_count??0)} matching rows · Document #${esc(d.document_id||'—')}</div>${d.source_ref?`<div class="ci-filepath">${esc(d.source_ref)}</div>`:''}</div>`).join('');
 html+=rows.map(x=>{const p=x.provenance||{};return `<article class="ci-mapping-card"><div class="ci-lineage"><div class="ci-endpoint"><div class="ci-eyebrow">${esc(x.source_type||'SOURCE')}</div><strong>${esc(x.source_path||'Not specified')}</strong></div><div class="ci-direction" aria-label="maps to">→</div><div class="ci-endpoint"><div class="ci-eyebrow">TARGET · ${esc(x.target_class||'CLASS')}</div><strong>${esc(x.target_expression||x.target_attribute||'Not specified')}</strong></div></div><div class="ci-rule"><div class="ci-eyebrow">TRANSFORMATION RULE</div><div>${esc(x.mapping_rule||'Not specified')}</div></div><details class="ci-provenance"><summary>Evidence provenance</summary><div><b>Workbook:</b> ${esc(p.document||'—')}<br><b>Sheet:</b> ${esc(p.sheet||'—')}<br><b>Row:</b> ${esc(p.row??'—')}<br><b>Document version:</b> ${esc(p.document_version||'Not supplied')}<br><b>Source reference:</b> ${esc(p.source_ref||'—')}</div></details></article>`}).join('');
 return html+'<div class="ci-boundary">Imported mapping evidence. Git/code relationships are not inferred from this result.</div></section>';
}
// Impact Analysis is a read-only composition of graph evidence and imported SQL workbook rows.
// An imported row is never promoted into a Neo4j relationship or verified code impact.
function renderImpactLineage(r){
 const rows=Array.isArray(r.mapping_rows)?r.mapping_rows:[];
 const docs=Array.isArray(r.mapping_documents)?r.mapping_documents:[];
 const graph=Array.isArray(r.mappings)?r.mappings:[];
 const graphCount=Number.isFinite(Number(r.graph_mapping_count))?Number(r.graph_mapping_count):graph.length;
 const documentCount=Number.isFinite(Number(r.document_mapping_count))?Number(r.document_mapping_count):rows.length;
 const project=r.project||state.project||'';
 let html=`<section class="ci-result impact-result"><div class="ci-result-head"><div><div class="ci-eyebrow">IMPACT ANALYSIS · ${esc(r.attribute||'ATTRIBUTE')}</div><h3>Mapping and dependency evidence</h3><div class="ci-sub">${esc(project||'No project context returned')}</div></div><span class="ci-status ${r.status==='NO_MATCH'?'ci-status-muted':''}">${esc(r.status||'UNKNOWN')}</span></div>`;
 if(rows.length){
  html+=`<div class="impact-counters"><div><strong>${documentCount}</strong><span>Document mapping rows</span></div><div><strong>${docs.length}</strong><span>Mapping documents</span></div>${graphCount?`<div><strong>${graphCount}</strong><span>Graph relationships</span></div>`:''}</div>`;
  html+=mappingContent({...r,source:'MAPPING_DOCUMENT_EVIDENCE'});
 }else if(!graph.length){html+=notice('No imported mapping rows or graph relationships were returned for this attribute and project.');}
 if(graph.length){html+=`<details class="impact-graph" open><summary>Verified graph relationships (${graph.length})</summary><div class="evidence">${esc(fmt(graph))}</div></details>`;}
 if(r.engineering_impact){html+=`<details class="impact-graph" open><summary>Engineering impact returned by backend</summary><div class="evidence">${esc(fmt(r.engineering_impact))}</div></details>`;}
 else html+=`<div class="ci-boundary">${esc(r.note||'Graph-based engineering impact is not established by this response. Imported Excel mappings are documentary evidence, not verified Neo4j relationships.')}</div>`;
 html+=`<details class="impact-graph"><summary>Raw API response · JSON</summary><pre class="impact-json">${esc(fmt(r))}</pre></details></section>`;
 return html;
}
function renderRequirementImpact(r){
 let html=`<section class="ci-result"><div class="ci-result-head"><div><div class="ci-eyebrow">REQUIREMENT IMPACT · ${esc(r.mode||'')}</div><h3>${esc(r.jira?.jira_id||r.input||'Impact analysis')}</h3><div class="ci-sub">${esc(r.jira?.summary||r.requirement_source||'')}</div></div><span class="ci-status ${r.status==='FOUND'?'':'ci-status-muted'}">${esc(r.status)}</span></div>`;
 if(r.note)html+=notice(r.note);
 const attributes=r.attributes||[],jiras=r.historical_jiras||[],rows=r.mappings||[],scenarios=r.scenarios||[];
 if(attributes.length)html+=`<div class="ci-document"><strong>Extracted attributes</strong><div>${attributes.map(a=>`<code class="impact-chip">${esc(a)}</code>`).join(' ')}</div></div>`;
 if(jiras.length)html+=`<div class="impact-evidence-section"><h3>Historical JIRAs (${jiras.length})</h3><div class="ci-sub">Related through indexed requirement mentions — not verified implementation links.</div>${jiras.map(j=>`<article class="ci-document"><strong>${esc(j.jira_id)} · ${esc(j.summary||'')}</strong><div class="ci-sub">Matched attributes: ${esc((j.matched_attributes||[]).join(', '))} · ${esc(j.matched_in||'requirement')}</div><div>${esc(j.evidence_excerpt||'')}</div><div class="ci-boundary">Relationship: ${esc(j.relationship||'REQUIREMENT_ATTRIBUTE_MENTION')}</div></article>`).join('')}</div>`;
 if(rows.length)html+=`<div class="impact-evidence-section"><h3>Mapping documents (${rows.length} rows)</h3>${mappingContent({mapping_rows:rows,mapping_documents:r.mapping_documents||[],attribute:attributes.join(', '),status:'FOUND'})}</div>`;
 if(scenarios.length)html+=`<div class="impact-evidence-section"><h3>Potentially relevant scenarios (${scenarios.length})</h3><div class="ci-sub">Text matches only; no test execution is implied.</div>${scenarios.map(s=>`<div class="ci-document"><strong>${esc(s.scenario_code)} · ${esc(s.name)}</strong><div class="ci-sub">${esc(s.http_method||'')} ${esc(s.endpoint||'')} · ${esc((s.matched_attributes||[]).join(', '))}</div></div>`).join('')}</div>`;
  const conflicts=r.mapping_conflicts||[],code=r.code_impact||{},recommendations=r.regression_recommendations||[];
  if(conflicts.length)html+=`<div class="impact-evidence-section"><h3>Requirement vs mapping rule (${conflicts.length})</h3>${conflicts.map(c=>`<article class="ci-document"><strong>${esc(c.attribute||'Attribute')} · ${esc(c.type)}</strong><div>Requirement: ${esc(c.requirement)}</div><div>Imported rule: ${esc(c.document_rule)}</div><div class="ci-sub">${esc(c.provenance?.document||'')} · row ${esc(c.provenance?.row||'—')}</div><div class="ci-boundary">${esc(c.note||'Documentary evidence only')}</div></article>`).join('')}</div>`;
  if(code.status&&code.status!=='NOT_CHECKED'){
   const candidates=code.candidates||[];
   html+=`<div class="impact-evidence-section"><h3>Java source candidates (${candidates.length})</h3><div class="ci-sub">Source-based heuristic candidates; not verified Jira-to-code links or AST dependency edges.</div>`;
   if(candidates.length)html+=candidates.map(c=>`<article class="ci-document"><strong>${esc(c.jira_id)} · ${esc(c.relationship||'POSSIBLE_IMPLEMENTATION')}</strong><div class="ci-sub">${esc(c.classification)} · ${esc(c.score_kind||'Heuristic relevance')}</div>${(c.source_evidence||[]).slice(0,12).map(e=>`<div class="item"><strong>${esc(e.file)}:${esc(e.line)} · ${esc(e.method_candidate||'method unknown')}</strong><small>${esc(e.statement||'')}</small></div>`).join('')}</article>`).join('');
   else html+=notice(code.note||'No source candidates were established.');
   html+='</div>';
  }
  if(recommendations.length)html+=`<div class="impact-evidence-section"><h3>Suggested regression tests (${recommendations.length})</h3><div class="ci-sub">Derived from the requirement; not existing test records or execution results.</div>${recommendations.map(x=>item(x.scenario,x.classification)).join('')}</div>`;
 if(!jiras.length&&!rows.length&&!scenarios.length)html+=notice('No historical Jira, mapping or scenario evidence found in the selected project scope.');
 html+=`<div class="ci-boundary">${esc(r.evidence_boundary||'')}</div>`;
 if((r.unavailable||[]).length)html+=`<details class="ci-provenance"><summary>Evidence not yet integrated</summary><div>${(r.unavailable||[]).map(esc).join('<br>')}</div></details>`;
 if((r.warnings||[]).length)html+=notice(r.warnings.join('; '));
 return html+`<details class="impact-graph"><summary>Raw API response</summary><pre class="impact-json">${esc(fmt(r))}</pre></details></section>`;
}
function gitContent(r){
 const answer=textAnswer(r);const evidence=r.git_commit_evidence||{};
 let html='<section class="ci-result"><div class="ci-result-head"><div><div class="ci-eyebrow">ENGINEERING EVIDENCE</div><h3>Code & Git analysis</h3></div></div>';
 const urls=[...new Set((answer.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/[a-f0-9]{7,40}/gi)||[]))];
 if(urls.length)html+=`<div class="ci-linklist"><div class="ci-eyebrow">VERIFIED COMMIT LINKS</div>${urls.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(u.split('/').pop().slice(0,12))} · View GitHub commit</a>`).join('')}</div>`;
 html+=`<details class="ci-provenance" open><summary>Analysis details</summary><div class="evidence">${findLinks(answer)}</div></details>`;
 if(Object.keys(evidence).length)html+=`<div class="ci-boundary">JIRA associations and commit evidence are supplied by the backend.</div>`;
 return html+'</section>';
}
function content(r){return r?.source==='MAPPING_DOCUMENT_EVIDENCE'?mappingContent(r):(hasData(r?.git_commit_evidence)||/commit|git|jira/i.test(r?.answer||''))?gitContent(r):`<section class="ci-result"><div class="evidence">${findLinks(textAnswer(r))}</div></section>`}
function objectKeys(r,k){const x=r?.[k];return x&&typeof x==='object'?Object.values(x):[]}
function evidenceCount(r){const qa=r?.test_suites||r?.qa||{};let tests=0;for(const val of Object.values(qa)){if(val&&typeof val==='object')tests+=val.unique_count||val.count||0}return tests}
function hasData(x){return Array.isArray(x)?x.length>0:!!(x&&typeof x==='object'&&Object.keys(x).length)}
function setVisible(id,visible){const el=$(id);if(el)el.hidden=!visible}
function resultKind(r){return r?.source==='MAPPING_DOCUMENT_EVIDENCE'?'mapping':hasData(r?.git_commit_evidence)?'git':'other'}
function executionSummary(r){
 const kind=resultKind(r);
 if(kind==='mapping'){
  const docs=r.mapping_documents||[],rows=r.mapping_rows||[];
  return [['done',`Understood as: mapping search for ${r.attribute||'requested attribute'}`],['done',`Evidence: Knowledge Hub · ${docs.length} document(s) · ${rows.length} mapping row(s)`],['done','Source: imported mapping evidence']];
 }
 const info=[['done',`Response source: ${r.source||r.status||'ASK backend'}`]];
 if(hasData(r.git_commit_evidence))info.push(['done',`Historical Git evidence · ${Object.keys(r.git_commit_evidence).length} JIRA reference(s)`]);
 info.push(['done','Evidence rendered from backend response']);return info;
}
function renderAnswer(r){
 state.result=r;
 const mapping=resultKind(r)==='mapping';
 const commits=Object.values(r.git_commit_evidence||{}).flatMap(v=>v?.commits||[]);
 const jiraKeys=Object.keys(r.git_commit_evidence||{});
 const qa=evidenceCount(r);
 const rows=r.mapping_rows||[],docs=r.mapping_documents||[];
 const scenarioData=r.scenarios||r.affected_scenarios||r.business_scenarios;
 const methodData=r.affected_methods||r.changed_methods;
 const paths=Object.values(r.commit_call_paths||{});
 const hasCode=commits.length>0||hasData(methodData)||paths.length>0;
 const hasScenarios=hasData(scenarioData);
 const metrics=[['mMethods',Array.isArray(methodData)?methodData.length:0,hasData(methodData)],['mMappings',rows.length, mapping&&rows.length>0],['mScenarios',Array.isArray(scenarioData)?scenarioData.length:0,hasScenarios],['mJiras',jiraKeys.length,jiraKeys.length>0],['mTests',qa,qa>0]];
 metrics.forEach(([id,value,visible])=>{const el=$(id);el.textContent=visible?String(value):'—';el.closest('.metric').hidden=!visible});
 setVisible('metrics',metrics.some(x=>x[2]));
 $('mainTitle').textContent=mapping?'Mapping evidence':hasCode?'Engineering evidence':'ASK result';
 $('mainBody').innerHTML=content(r);
 $('insights').innerHTML=mapping?item('Evidence source',`${docs.length} imported mapping document(s) · ${rows.length} row(s)`)+(r.note?item('Evidence boundary',r.note):''):item('Evidence source',r.source||r.status||'ASK result')+(r.note?item('Evidence boundary',r.note):'');
 setVisible('insightsPanel',mapping||!!r.note||!!r.source);
 $('rightCode').innerHTML=commits.map(c=>item(c.subject||c.message||c.commit||'Commit',(c.commit||'').slice(0,12))).join('');
 $('rightJiras').innerHTML=jiraKeys.map(k=>item(k,'Historical commit association')).join('');
 $('rightScenarios').innerHTML=hasScenarios?`<div class="evidence">${esc(fmt(scenarioData))}</div>`:'';
 setVisible('rightCodePanel',hasCode&&commits.length>0);setVisible('rightJirasPanel',jiraKeys.length>0);setVisible('rightScenariosPanel',hasScenarios);
 setVisible('rightbar',(hasCode&&commits.length>0)||jiraKeys.length>0||hasScenarios);
 $('qaPreview').innerHTML=qa?item(`${qa} imported QA records`,'Imported plans are not execution evidence'):'';
 $('changesPreview').innerHTML=commits.map(c=>item((c.commit||'').slice(0,9),c.subject||c.message||'Commit')).join('');
 setVisible('qaPanel',qa>0);setVisible('changesPanel',commits.length>0);setVisible('bottomGrid',qa>0||commits.length>0);
 const tabAllowed={overview:true,code:hasCode,mappings:mapping||hasData(r.mapping_rows),jira:jiraKeys.length>0,qa:qa>0,scenarios:hasScenarios,graph:paths.length>0};
 document.querySelectorAll('#tabs [data-tab]').forEach(b=>{b.hidden=!tabAllowed[b.dataset.tab]});
 if(!tabAllowed[state.tab])state.tab='overview';
 document.querySelectorAll('#tabs [data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===state.tab));
 if(state.tab!=='overview')showTab(state.tab);
}
function setSteps(lines){$('steps').innerHTML=lines.map(x=>`<div class="${x[0]}">${x[0]==='done'?'✓':x[0]==='running'?'◉':'○'} ${esc(x[1])}</div>`).join('')}
function run(){const query=$('question').value.trim();if(!query)return toast('Enter a question');state.question=query;state.view='ask';setView('ask');$('run').disabled=true;$('runState').textContent='Running';setSteps([['running','Retrieving verified engineering evidence…']]);$('mainBody').innerHTML='<div class="empty">Waiting for backend response…</div>';const source=new EventSource('/ui/agent/events?query='+encodeURIComponent(query));let finished=false;
source.addEventListener('RUN_STARTED',()=>setSteps([['running','Starting agent run…']]));source.addEventListener('STEP_STARTED',e=>setSteps([['done','Query accepted'],['running',JSON.parse(e.data).step]]));source.addEventListener('STEP_FINISHED',e=>setSteps([['done','Query accepted'],['done',JSON.parse(e.data).step]]));source.addEventListener('STATE_SNAPSHOT',e=>{renderAnswer(JSON.parse(e.data).result);saveRecent(query)});source.addEventListener('RUN_FINISHED',()=>{finished=true;source.close();$('run').disabled=false;$('runState').textContent='Completed';setSteps(state.result?executionSummary(state.result):[['done','Backend completed']])});source.addEventListener('RUN_ERROR',e=>{finished=true;source.close();$('run').disabled=false;$('runState').textContent='Failed';const m=JSON.parse(e.data).message;$('mainBody').innerHTML=notice(m);setSteps([['done','Query accepted'],['error','Backend request failed']])});source.onerror=()=>{if(!finished){source.close();$('run').disabled=false;$('runState').textContent='Disconnected';$('mainBody').innerHTML=notice('Could not reach the ASK stream. Check backend and UI server.')}}}
function saveRecent(q){const norm=x=>x.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();state.recent=[q,...state.recent.filter(x=>norm(x)!==norm(q))].slice(0,8);try{localStorage.setItem('ci_recent',JSON.stringify(state.recent))}catch{}renderRecent()}
function renderRecent(){$('recent').innerHTML=state.recent.map(q=>`<button title="${esc(q)}" data-recent="${esc(q)}">◈ ${esc(q)}</button>`).join('')||'<div class="muted">No recent analyses</div>';document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.recent;run()})}
function showTab(tab){state.tab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));if(tab==='overview'){renderAnswer(state.result||{answer:'No analysis yet.'});return}const r=state.result||{};let html='';if(tab==='graph'){const paths=Object.values(r.commit_call_paths||{});html=paths.length?`<div class="graph-flow">${paths.map(p=>`<div class="code-node">${esc(fmt(p).slice(0,1800))}</div>`).join('')}</div>`:notice('No structured call graph returned by ASK. Use Impact Analysis to query verified graph services.')}else if(tab==='code')html=content(r);else if(tab==='mappings')html=r.source==='MAPPING_DOCUMENT_EVIDENCE'?mappingContent(r):notice('No mapping rows in this result.');else if(tab==='qa')html=Object.keys(r.test_suites||{}).length?`<div class="evidence">${esc(fmt(r.test_suites))}</div>`:notice('No QA payload in this answer. Ask for CAS-2 test cases.');else if(tab==='jira')html=Object.keys(r.git_commit_evidence||{}).length?`<div class="evidence">${esc(fmt(r.git_commit_evidence))}</div>`:notice('Use the JIRA navigation to search indexed requirements.');else html=notice(`Use the ${tab} workspace to load its live data.`);$('mainTitle').textContent=tab.toUpperCase()+' evidence';$('mainBody').innerHTML=html}
async function loadView(view){state.view=view;setView(view);const title=({impact:'Impact Analysis',knowledge:'Knowledge Hub',releases:'Release Intelligence',jira:'JIRA Intelligence',mappings:'Mapping Intelligence',tests:'Testing & Baselines',evaluation:'Evaluation & Diagnostics'})[view];if(view==='ask'){renderAnswer(state.result||{answer:'Ask a question to retrieve live CodeIntelligence evidence.'});return}let html=`<div class="section"><h2>${title}</h2>`;try{if(view==='knowledge'){const [docs,sources]=await Promise.all([api('/api/knowledge-base/documents'),api('/api/knowledge-sync/status')]);html+=`<details open><summary>Knowledge Hub documents (${listOf(docs).length})</summary>${listOf(docs).map(x=>item(x.title||x.name||x.source_type, x.source_ref||x.source_type||'')).join('')||notice('No documents indexed')}</details><details open><summary>Connected knowledge sources</summary><div class="evidence">${esc(fmt(sources))}</div></details><details><summary>Search Knowledge Hub</summary><div class="field"><input id="knowledgeQuery" placeholder="Search indexed knowledge"><button class="primary" id="knowledgeSearch">Search</button></div><div id="knowledgeResults"></div></details>`}
else if(view==='jira'){const data=await api('/api/jira-knowledge');html+=`<div class="field"><input id="jiraQuery" placeholder="Search Jira requirements, e.g. country code"><button id="jiraSearch" class="primary">Search</button></div><div id="jiraResults"></div><details open><summary>Indexed JIRA requirements (${listOf(data).length})</summary>${listOf(data).map(x=>item(x.jira_id||x.jira_key||x.key||'Jira',x.title||x.requirement||'')).join('')||notice('No indexed Jira issues')}</details>`}
else if(view==='mappings'){const docs=await api('/api/mapping-intelligence/documents');html+=`<div class="field"><input id="mapAttribute" placeholder="Attribute e.g. countryCode"><button id="mapSearch" class="primary">Trace mappings</button></div><div id="mapResults"></div><details open><summary>Mapping documents (${listOf(docs).length})</summary>${listOf(docs).map(x=>item(x.title||x.filename||'Mapping',x.document_version||x.source_ref||'')).join('')||notice('No mapping documents')}</details>`}
else if(view==='impact'){html+=`<div class="impact-entry"><div class="ci-eyebrow">REQUIREMENT-TO-HISTORICAL-IMPACT</div><h3>Analyze a new JIRA or business requirement</h3><div class="field"><select id="impactMode" aria-label="Impact analysis entry point"><option value="jira">New JIRA</option><option value="requirement">Business requirement</option><option value="attribute">Attribute</option></select><input id="impactAttribute" placeholder="JIRA key, e.g. CAS-10"><button id="impactSearch" class="primary">Analyze impact</button></div><div class="ci-sub">Project: ${esc(state.project||'Select a project in the sidebar')} · Historical matches are not automatically verified implementation links.</div></div><div id="impactResults"></div>`}
else if(view==='releases'){html+=`<div class="field"><input id="releaseKey" value="OCT-2026" placeholder="Release key"><input id="releaseProject" placeholder="Project path (required)"><button class="primary" id="releaseSearch">Load report</button></div><div id="releaseResults"></div><details><summary>Compare immutable baselines</summary><div class="field"><input id="fromVersion" type="number" min="1" value="1"><input id="toVersion" type="number" min="1" value="2"><button class="primary" id="releaseCompare">Compare</button></div><div id="compareResults"></div></details>${notice('This UI is read-only for baseline capture; historical versions are never altered here.')}`}
else if(view==='tests'){html+=`<div class="field"><input id="testQuery" value="test data for countryCode please"><button id="testSearch" class="primary">Retrieve QA evidence</button></div><div id="testResults"></div>${notice('Imported test plans and separately recorded execution evidence are distinguished by the backend.')}`}
else if(view==='evaluation'){const health=await api('/health');const status=await api('/api/storage/status');html+=`<details open><summary>Backend health</summary><div class="evidence">${esc(fmt(health))}</div></details><details open><summary>Persistence status</summary><div class="evidence">${esc(fmt(status))}</div></details>${notice('No accuracy percentage is invented; use your existing RAG evaluation endpoints for measured metrics.')}`}
}catch(e){html+=notice(e.message)}html+='</div>';$('mainTitle').textContent=title;$('mainBody').innerHTML=html;$('insights').innerHTML=item('Active workspace',title)+item('Data source','Live CodeIntelligence backend');wireView(view)}
function setView(v){document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v))}
function resultAt(id,v){$(id).innerHTML=`<div class="evidence">${esc(fmt(v))}</div>`}
function wireView(v){const bind=(id,fn)=>{if($(id))$(id).onclick=async()=>{try{await fn()}catch(e){toast(e.message)}}};if(v==='jira')bind('jiraSearch',async()=>{const d=await api('/api/jira-knowledge/search?'+new URLSearchParams({query:$('jiraQuery').value,top_k:'15'}));$('jiraResults').innerHTML=listOf(d).map(x=>item(x.jira_id||x.jira_key||x.key||'JIRA',x.title||x.requirement||fmt(x))).join('')||notice('No matches')});if(v==='knowledge')bind('knowledgeSearch',async()=>resultAt('knowledgeResults',await api('/api/knowledge-base/search?'+new URLSearchParams({query:$('knowledgeQuery').value,top_k:'8'}))));if(v==='mappings')bind('mapSearch',async()=>resultAt('mapResults',await api('/api/mapping-intelligence/lineage?'+new URLSearchParams({attribute:$('mapAttribute').value}))));if(v==='impact'){
 const mode=$('impactMode'),field=$('impactAttribute');
 mode.onchange=()=>{field.placeholder=mode.value==='jira'?'JIRA key, e.g. CAS-10':mode.value==='requirement'?'Describe the new business requirement':'Attribute, e.g. countryCode';field.value=''};
 bind('impactSearch',async()=>{const value=field.value.trim();if(!value)return toast('Enter a JIRA, requirement or attribute');$('impactResults').innerHTML=notice('Searching indexed requirements, historical JIRAs and mapping evidence…');const r=await api('/api/requirement-impact/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode.value,value,project:state.project||null})});state.result=r;$('impactResults').innerHTML=renderRequirementImpact(r);});
 }if(v==='releases'){if(state.project)$('releaseProject').value=state.project;bind('releaseSearch',async()=>resultAt('releaseResults',await api(`/api/sdlc/releases/${encodeURIComponent($('releaseKey').value)}/report?`+new URLSearchParams({project_path:$('releaseProject').value}))));bind('releaseCompare',async()=>resultAt('compareResults',await api(`/api/sdlc/releases/${encodeURIComponent($('releaseKey').value)}/compare?`+new URLSearchParams({project_path:$('releaseProject').value,from_version:$('fromVersion').value,to_version:$('toVersion').value})) ))}if(v==='tests')bind('testSearch',async()=>{const d=await api('/api/knowledge-agent/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:$('testQuery').value})});$('testResults').innerHTML=content(d)})}
async function projects(){try{const p=listOf(await api('/api/projects'));$('projectSelect').innerHTML='<option value="">Select a project</option>'+p.map(x=>{const path=x.path||x.project_path||x.directory||'';return `<option value="${esc(path)}">${esc(x.name||x.project_name||path||'Project')}</option>`}).join('');$('projectSelect').onchange=()=>state.project=$('projectSelect').value}catch(e){$('projectSelect').innerHTML='<option>Backend unavailable</option>'}}
async function check(){try{await api('/health');$('connection').textContent='● Backend connected';$('connection').classList.add('online');await projects()}catch(e){$('connection').textContent='● Backend offline';$('connection').title=e.message}}
$('run').onclick=run;$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();run()}});$('followupSend').onclick=()=>{const q=$('followup').value.trim();if(q){$('question').value=q;$('followup').value='';run()}};$('followup').onkeydown=e=>{if(e.key==='Enter')$('followupSend').click()};$('newAnalysis').onclick=()=>{$('question').value='';state.result=null;loadView('ask');$('question').focus()};$('clearRecent').onclick=()=>{state.recent=[];try{localStorage.removeItem('ci_recent')}catch{}renderRecent()};$('export').onclick=()=>{if(!state.result)return toast('No evidence to export');const b=new Blob([JSON.stringify(state.result,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='codeintelligence-evidence.json';a.click();URL.revokeObjectURL(a.href)};
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>loadView(b.dataset.view));$('workspaceMenu').onchange=()=>{if($('workspaceMenu').value)loadView($('workspaceMenu').value);$('workspaceMenu').value=''};document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>loadView(b.dataset.open));document.querySelectorAll('[data-tab-jump]').forEach(b=>b.onclick=()=>{loadView('ask');showTab(b.dataset.tabJump)});document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.question;run()});try{state.recent=JSON.parse(localStorage.getItem('ci_recent')||'[]')}catch{}renderRecent();renderAnswer({answer:'Ask a question to retrieve live CodeIntelligence evidence.'});setVisible('insightsPanel',false);check();
