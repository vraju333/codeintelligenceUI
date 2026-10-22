'use strict';
const $=id=>document.getElementById(id);const state={result:null,question:'',tab:'overview',view:'ask',project:'',recent:[]};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>typeof x==='string'?x:JSON.stringify(x,null,2);
const item=(title,body)=>`<div class="item"><strong>${esc(title)}</strong><small>${esc(body)}</small></div>`;
const notice=s=>`<div class="notice">${esc(s)}</div>`;
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',3500)}
async function api(path,opts={}){if(!PROJECT_FREE_PATHS.has(path.split('?')[0])){if(!state.project)throw Error('Select an indexed project first.');path=projectApiPath(path);opts=projectBody(opts)}const res=await fetch('/ui/api'+path,opts);const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.detail||`HTTP ${res.status}`);return data}
// A workspace project is required for every project-scoped operation.
const PROJECT_FREE_PATHS=new Set(['/health','/api/projects','/api/storage/status']);
function requireProject(){
 if(state.project)return true;
 toast('Select an indexed project before continuing.');
 const select=$('projectSelect');if(select){select.focus();select.style.outline='2px solid #e89b35';}
 return false;
}
function projectApiPath(path){
 const [pathname,query='']=path.split('?');
 if(PROJECT_FREE_PATHS.has(pathname))return path;
 const params=new URLSearchParams(query);
 params.set('project_path',state.project);
 return pathname+'?'+params.toString();
}
function projectBody(opts){
 if(!opts.body||typeof opts.body!=='string')return opts;
 try{const data=JSON.parse(opts.body);if(data&&typeof data==='object'&&!Array.isArray(data)){
  return {...opts,body:JSON.stringify({...data,project_path:state.project,project:state.project})};
 }}catch(_e){}
 return opts;
}
function updateProjectGate(){
 const ready=Boolean(state.project);
 const bar=$('ciProjectTop');if(bar){bar.classList.toggle('ci-ready',ready);$('ciProjectStatus').textContent=ready?'● Active':'● Required';}
 document.querySelectorAll('#nav button, #workspaceMenu, #newAnalysis, [data-open], [data-question], [data-recent], #followupSend, #export, #clearRecent').forEach(el=>{el.disabled=!ready});
 ['run','question','followup'].forEach(id=>{const el=$(id);if(el)el.disabled=!ready});
}
function changeProject(path){if(impactGitStream){impactGitStream.close();impactGitStream=null;}
 state.project=path;state.result=null;state.question='';state.impactFocusOverride=null;state.tab='overview';
 $('question').value='';$('mainBody').innerHTML=notice(path?'Project changed. Run a new analysis for the selected project.':'Select a project to begin.');
 $('runState').textContent=path?'Ready':'Project required';
 $('run').disabled=!path;
 updateProjectGate();
 try{if(path)localStorage.setItem('ci_selected_project',path);else localStorage.removeItem('ci_selected_project')}catch(_e){}
 loadView(state.view);
}
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
// Shared evidence-first layout. Only real backend evidence is counted as evidence.
const array=x=>Array.isArray(x)?x:[];
const compact=(s,n=170)=>String(s??'').replace(/\s+/g,' ').slice(0,n);
const evidenceCard=(icon,title,body,tag='')=>`<section class="ev-card"><div class="ev-card-head"><h3><span aria-hidden="true">${icon}</span> ${esc(title)}</h3>${tag?`<span class="ev-tag">${esc(tag)}</span>`:''}</div><div class="ev-card-body">${body}</div></section>`;
const evidenceLine=(title,detail='',sub='')=>`<div class="ev-line"><strong>${esc(title)}</strong>${detail?`<div>${esc(detail)}</div>`:''}${sub?`<small>${esc(sub)}</small>`:''}</div>`;
const evidenceGrid=cards=>`<div class="ev-grid">${cards.join('')}</div>`;
const technicalDetails=r=>`<details class="ev-technical"><summary>Technical details and source data</summary><p>Evidence and suggestions are kept separate. A requirement mention does not prove a code dependency or test execution.</p><pre class="impact-json">${esc(fmt(r))}</pre></details>`;
function jiraCardsFromAnswer(answer){
 const ids=[...new Set((String(answer||'').match(/\b[A-Z][A-Z0-9]+-\d+\b/g)||[]))].slice(0,15);
 return ids.map(id=>evidenceLine(id,'Mentioned in the response','Check the underlying JIRA record for its relationship'));
}
// Normalize QA evidence without treating suggestions or empty objects as executed tests.
function testRecords(r){
 const out=[];
 const sources=[r, r?.engineering_evidence].filter(x=>x&&typeof x==='object');
 const keys=['test_evidence','test_documents','test_baselines','jira_test_baselines','qa_documents','test_cases','test_suites','qa','test_cases'];
 const add=(kind,value,name='')=>{
  if(value===null||value===undefined)return;
  if(Array.isArray(value)){value.forEach(x=>add(kind,x,name));return;}
  if(typeof value==='object'){
   if(!Object.keys(value).length)return;
   // TestSuiteService.search returns {count, items:[...]}; counts are metadata, not records.
   if(Array.isArray(value.items)||Array.isArray(value.results)||Array.isArray(value.records)||Array.isArray(value.test_cases)){
    add(kind,value.items||value.results||value.records||value.test_cases,name);return;
   }
   if(value.count===0||value.unique_count===0)return;
   const recordFields=['test_id','test_case_id','scenario_code','document_id','filename','source_ref','jira','name','title','test_name','test_case','scenario','description','baseline_version','release_key'];
   if(recordFields.some(k=>value[k]!==undefined)){out.push({kind,name,value});return;}
   Object.entries(value).forEach(([key,v])=>{
    if(['count','unique_count','status','project_path','execution_verified','note','total','limit'].includes(key))return;
    add(kind,v,key);
   });return;
  }
  if(typeof value==='string'&&value.trim())out.push({kind,name,value:{description:value}});
 };
 sources.forEach(source=>keys.forEach(key=>add(key,source[key])));
 const seen=new Set();return out.filter(row=>{const id=JSON.stringify([row.kind,row.value]);if(seen.has(id))return false;seen.add(id);return true});
}
function testEvidenceHtml(r){
 const records=testRecords(r);
 if(!records.length)return evidenceCard('▦','Test evidence','<p class="ev-muted">No imported test cases or linked test documents were returned.</p>','No records');
 const tests=new Map(),other=[];
 records.forEach(({kind,name,value:t})=>{
  if(!t.test_id&&!t.test_case_id){other.push({kind,name,value:t});return;}
  const id=String(t.test_id||t.test_case_id);
  if(!tests.has(id))tests.set(id,{...t,sources:[],statuses:new Set()});
  const merged=tests.get(id);
  const source=[t.source_kind||'',t.source_filename||t.filename||'',t.source_ref||''].filter(Boolean).join(' · ');
  if(source&&!merged.sources.includes(source))merged.sources.push(source);
  if(t.execution_status)merged.statuses.add(t.execution_status);
 });
 const answer=String(r.answer||'');
 const recorded=new Map();
 // A recorded execution mentioned in the backend answer is displayed as a reported record,
 // never as independently verified CI execution.
 for(const match of answer.matchAll(/-\s+([A-Za-z0-9_-]+):[^\n]*\| execution=(PASSED|FAILED|SKIPPED|NOT_VERIFIED)([\s\S]*?)(?=\n-\s+[A-Za-z0-9_-]+:|\n\n|$)/g)){
  const ref=(match[3].match(/Recorded evidence:\s*([^;\n]+)/)||[])[1];
  if(ref)recorded.set(match[1],{status:match[2],ref:ref.trim()});
 }
 const body=[...tests.entries()].map(([id,t])=>{
  const report=recorded.get(id);
  const detail=[t.scenario||t.description||'',t.operation||'',t.expected?'Expected: '+t.expected:''].filter(Boolean).join(' · ');
  const status=report?`Recorded ${report.status} (user-supplied)`:([...t.statuses].join(', ')||'Execution not verified');
  return `<div class="ev-line"><strong>${esc(id)} · ${esc(t.scenario||'Test case')}</strong><div>${esc(detail)}</div><small>${esc(status)}</small>${report?`<small>${esc(report.ref)}</small>`:''}<details class="ev-test-sources"><summary>Document sources · ${t.sources.length}</summary>${t.sources.map(x=>`<div class="ev-muted">${esc(x)}</div>`).join('')}</details></div>`;
 });
 other.forEach(({kind,name,value:t})=>body.push(evidenceLine(t.title||t.filename||t.name||name||'Test document',t.source_ref||t.description||'',kind.replace(/_/g,' '))));
 return evidenceCard('▦',`Test evidence · ${tests.size} unique case${tests.size===1?'':'s'}`,body.join(''),`${records.length} imported record${records.length===1?'':'s'} · execution separate`);
}
function releaseBaselineHtml(r){
 const scenarios=array(r.project_release_baselines).filter(x=>x&&typeof x==='object');
 if(!scenarios.length)return '';
 const captured=scenarios.filter(x=>x.baseline_captured===true||x.active_baseline_id!=null||x.active_baseline_version!=null);
 const uncaptured=scenarios.filter(x=>!captured.includes(x));
 const cards=[];
 cards.push(evidenceCard('◇',`Project scenarios · ${scenarios.length}`,scenarios.map(b=>{
  const title=[b.http_method,b.endpoint].filter(Boolean).join(' ')||b.scenario_name||b.scenario_code||'Scenario';
  const detail=b.scenario_name&&title!==b.scenario_name?b.scenario_name:'';
  const sub=b.baseline_captured===true?'Baseline captured':b.active_baseline_version!=null?'Active baseline version '+b.active_baseline_version:'Baseline not captured';
  return evidenceLine(title,detail,sub);
 }).join(''),'Project-wide · attribute coverage not verified'));
 if(captured.length)cards.push(evidenceCard('▤',`Captured scenario baselines · ${captured.length}`,captured.map(b=>evidenceLine(b.active_baseline_name||b.scenario_code||b.scenario_name||'Captured baseline',b.active_baseline_version!=null?'Version '+b.active_baseline_version:'',b.active_release_version!=null?'Release version '+b.active_release_version:'Attribute linkage not verified')).join(''),'Project-wide'));
 else cards.push(evidenceCard('▤','Captured scenario baselines · 0','<p class="ev-muted">None of the returned project scenarios has a captured baseline. Historical immutable release snapshots are not included in this response; use the Releases workspace to view them.</p>','No captured records'));
 return cards.join('');
}
function codeImpactHtml(r){
 const sources=[r,r.engineering_evidence].filter(x=>x&&typeof x==='object');
 const methods=[],apis=[];
 const collect=(arr,value)=>{
  if(Array.isArray(value))value.forEach(x=>collect(arr,x));
  else if(typeof value==='string'&&value.trim())arr.push(value.trim());
  else if(value&&typeof value==='object'){
   if(value.method||value.method_name||value.name||value.signature){arr.push([value.class_name||value.class||'',value.method||value.method_name||value.signature||value.name].filter(Boolean).join('.'));}
   else if(value.path||value.endpoint||value.route){arr.push([value.http_method||value.verb||'',value.path||value.endpoint||value.route].filter(Boolean).join(' '));}
   else Object.values(value).forEach(v=>collect(arr,v));
  }
 };
 sources.forEach(x=>{
  ['affected_methods','changed_methods','java_methods','methods'].forEach(k=>collect(methods,x[k]));
  ['affected_apis','affected_endpoints','api_endpoints','endpoints'].forEach(k=>collect(apis,x[k]));
 });
 const unique=x=>[...new Set(x)].filter(Boolean);
 const m=unique(methods),a=unique(apis),cards=[];
 if(m.length)cards.push(evidenceCard('⌘',`Java methods · ${m.length}`,m.map(x=>evidenceLine(x)).join(''),'Code evidence'));
 if(a.length)cards.push(evidenceCard('⇄',`Affected APIs · ${a.length}`,a.map(x=>evidenceLine(x)).join(''),'Backend-reported'));
 return cards;
}
function qaLookupHtml(r){
 const key=r.jira?.jira_id||(/^[A-Z][A-Z0-9]+-\d+$/.test(r.input||'')?r.input:'');
 const attrs=array(r.attributes).join(', ')||(!key?r.input||'':'');
 return `<section class="ev-qa-lookup"><h3>Additional QA document search</h3><p class="ev-muted">Search imported test plans and baseline knowledge separately. Search matches are not automatically linked or executed tests.</p><button type="button" class="primary" id="lookupImpactQa">Search QA documents</button><div id="impactQaResults" aria-live="polite"></div></section>`;
}
async function lookupImpactQa(r){if(!requireProject())return;
 const target=$('impactQaResults');if(!target)return;
 const key=r.jira?.jira_id||(/^[A-Z][A-Z0-9]+-\d+$/.test(r.input||'')?r.input:'');
 const attrs=array(r.attributes).join(' ')||(!key?r.input||'':'');
 const query=`Find imported test documents, test cases and release test baselines related to ${[key,attrs].filter(Boolean).join(' ')} in project ${r.project||state.project||'current project'}. List document names, scenarios, baseline versions and source references. Distinguish indexed documents from executed tests.`;
 target.innerHTML=notice('Searching indexed QA documents…');
 try{
  const data=await api('/api/knowledge-agent/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
  const records=testRecords(data);
  const answer=typeof textAnswer(data)==='string'?textAnswer(data):'';
  target.innerHTML=records.length?testEvidenceHtml(data):`<div class="ev-card"><div class="ev-card-body"><strong>QA knowledge search result</strong><div class="ev-readable">${esc(answer||'No indexed QA document details were returned.').replace(/\n/g,'<br>')}</div><small>Separate knowledge search; not a verified JIRA-to-test link or test execution.</small></div></div>`;
 }catch(e){target.innerHTML=notice(`QA lookup unavailable: ${e.message}`)}
}
// Normalize Git commit evidence returned by either Impact Analysis or the ASK agent.
function impactGitCommits(r){
 const sources=[...array(r.git_commits),...array(r.verified_commits)];
 for(const group of Object.values(r.git_commit_evidence||{})){
  if(Array.isArray(group))sources.push(...group);
  else if(group&&typeof group==='object')sources.push(...array(group.commits));
 }
 const unique=new Map();
 for(const c of sources){
  if(!c||typeof c!=='object')continue;
  const sha=String(c.commit||c.sha||c.hash||c.commit_sha||'').trim();
  if(!sha)continue;
  if(!unique.has(sha))unique.set(sha,c);
 }
 return [...unique.values()];
}
// The impact endpoint may omit Git history even when ASK can retrieve it.
// Fetch it from the same project-scoped ASK stream without changing workspaces.
let impactGitStream=null;
function retrieveImpactGit(r,mode,value,project,container){
 if(impactGitStream){impactGitStream.close();impactGitStream=null;}
 const status=container.querySelector('#impactGitStatus');
 if(impactGitCommits(r).length){if(status)status.remove();return;}
 if(status)status.textContent='Checking Git history through ASK…';
 const query=mode==='jira'?`Show verified Git commits for JIRA ${value}. Include commit hashes, subjects and links.`:`Show Git commits associated with ${mode==='attribute'?'attribute':'requirement'} ${value} in this project. Include commit hashes, subjects and links. Do not infer commits from JIRA mentions.`;
 const stream=new EventSource('/ui/agent/events?'+new URLSearchParams({query,project_path:project,project}).toString());
 impactGitStream=stream;
 const finish=message=>{stream.close();if(impactGitStream===stream)impactGitStream=null;if(status&&status.isConnected)status.textContent=message;};
 stream.addEventListener('STATE_SNAPSHOT',e=>{
  if(state.project!==project||state.view!=='impact'||!container.isConnected){finish('');return;}
  let answer;try{answer=JSON.parse(e.data).result}catch(_){return;}
  if(!answer||typeof answer!=='object')return;
  const commits=impactGitCommits(answer);
  if(commits.length){
   r.git_commit_evidence=answer.git_commit_evidence||r.git_commit_evidence;
   r.git_commits=commits;
   container.innerHTML=renderRequirementImpact(r);
   const qa=container.querySelector('#lookupImpactQa');if(qa)qa.onclick=()=>lookupImpactQa(r);
   finish('');
  } // A snapshot without Git evidence is not terminal; wait for RUN_FINISHED.
 });
 stream.addEventListener('RUN_ERROR',()=>finish('Git lookup unavailable. Other impact evidence is still shown.'));
 stream.addEventListener('RUN_FINISHED',()=>finish('No verified Git commits were returned by ASK for this project and query.'));
 stream.onerror=()=>finish('Git lookup unavailable. Other impact evidence is still shown.');
}
function requirementImpactHighlights(r){
 const review=r.operation_evidence?.role_review||{};
 const primary=array(review.priority_operations),secondary=array(review.conditional_or_other_operations);
 const ops=[...primary,...secondary];
 const paths=ops.reduce((n,o)=>n+array(o.candidate_call_paths).length,0);
 const methods=array(r.java_evidence?.methods),fields=array(r.java_evidence?.fields);
 const gaps=array(r.operation_evidence?.mapping_source_gaps);
 const recommendations=array(r.regression_recommendations);
 if(!ops.length&&!methods.length&&!gaps.length)return '';
 const metrics=`<div class="ci-impact-metrics"><div><b>${ops.length||array(r.affected_operations).length}</b><span>REST operations</span></div><div><b>${methods.length}</b><span>Java method mentions</span></div><div><b>${paths}</b><span>Candidate call paths</span></div><div><b>${gaps.length}</b><span>Mapping gaps</span></div><div><b>${recommendations.length}</b><span>Suggested tests</span></div></div>`;
 const operation=(o)=>{
  const role=array(o.requirement_roles).join(' + ')||'REVIEW';
  const priority=String(o.change_review_priority||'REVIEW').toLowerCase();
  const chains=array(o.candidate_call_paths);
  const body=chains.length?chains.map(c=>`<div class="ci-chain">${array(c.path).map((step,i)=>`<div class="ci-chain-step"><strong>${esc(step.class||'Class')}.${esc(step.method||'method')}()</strong><small>${esc(step.file||'')}:${esc(step.line||'—')}</small></div>${i<array(c.path).length-1?'<div class="ci-chain-arrow">↓</div>':''}`).join('')}<small>Matched: ${esc(array(c.matched_attributes).join(', '))} · source-backed candidate, not AST</small></div>`).join(''):'<p class="ev-muted">No resolved attribute call path. This does not establish that the API is unaffected.</p>';
  return `<details class="ci-impact-operation"><summary><span class="ci-priority ci-priority-${esc(priority)}">${esc(o.change_review_priority||'REVIEW')}</span><strong>${esc(o.http_method||'HTTP')} ${esc(o.endpoint||'')}</strong><span class="ci-op-role">${esc(role)}</span><small>${chains.length} paths</small></summary><div class="ci-operation-body"><p>${esc(o.role_reason||o.reason||'Requires review')}</p><p class="ev-muted">${esc(o.role_evidence_note||'Role inferred from requirement')}</p>${body}</div></details>`;
 };
 let html=`<section class="ci-impact-highlights"><h3>Pre-development impact overview</h3><p class="ev-muted">Review priorities are inferred; candidate source paths are not verified execution traces.</p>${metrics}`;
 if(ops.length)html+=`<div class="ci-impact-panel"><h4>Prioritized REST operations</h4>${primary.map(operation).join('')}${secondary.length?`<details class="ci-conditional"><summary>Conditional / regression operations (${secondary.length})</summary>${secondary.map(operation).join('')}</details>`:''}</div>`;
 if(gaps.length)html+=`<div class="ci-impact-panel ci-gap-panel"><h4>Mapping-to-source gaps</h4>${gaps.map(g=>evidenceLine(g.attribute||'Attribute',g.classification||'',g.note||'')).join('')}</div>`;
 if(methods.length){
  const groups=new Map();
  methods.forEach(m=>{const file=String(m.file||'Unknown source');if(!groups.has(file))groups.set(file,[]);groups.get(file).push(m)});
  const groupHtml=[...groups.entries()].map(([file,items])=>{
   const name=file.replace(/\\/g,'/').split('/').pop();
   const isTest=/^(src[\\/])test[\\/]/i.test(file);
   return `<details class="ci-source-group"><summary><span class="ci-source-file">${esc(name)}</span><span class="ci-source-count">${items.length} method${items.length===1?'':'s'}${isTest?' · test':''}</span></summary><div class="ci-source-path">${esc(file)}</div><div class="ci-source-items">${items.map(m=>evidenceLine(`${m.method||'method'}()`,`Line ${m.line||'—'}`,`Attributes: ${array(m.matched_attributes).join(', ')}`)).join('')}</div></details>`;
  }).join('');
  html+=`<details class="ci-impact-panel ci-methods"><summary>Java source evidence · ${methods.length} method mentions · ${groups.size} files · ${fields.length} fields</summary><p class="ev-muted">Grouped by Java source file. Method mentions are source evidence, not proof of JIRA implementation.</p>${groupHtml}${fields.length?`<details class="ci-source-group ci-fields-group"><summary>Field declarations <span class="ci-source-count">${fields.length} fields</span></summary><div class="ci-source-items">${fields.map(f=>evidenceLine(`${f.file||''}:${f.line||'—'}`,f.text||'')).join('')}</div></details>`:''}</details>`;
 }
 if(recommendations.length)html+=`<div class="ci-impact-panel"><h4>Recommended regression scenarios · not executed</h4>${recommendations.map(t=>evidenceLine(t.scenario||t.title||'Test scenario','','REQUIREMENT_DERIVED_NOT_EXECUTED')).join('')}</div>`;
 return html+'</section>';
}
// Deterministic question-specific presentation. Evidence stays sourced from the ASK response.
// Never infer implementation status from the chosen view.
function impactFocus(query){
 const q=String(query||'').toLowerCase();
 if(/\b(mapping|mappings|mapped|workbook|xml mapping|source gap|mapping gap)\b/.test(q)&&/\b(show|find|list|compare|identify|gap|mapping)\b/.test(q))return 'mappings';
 if(/\b(regression|test cases?|tests?|coverage|qa)\b/.test(q)&&/\b(show|find|list|recommend|suggest|coverage|regression)\b/.test(q))return 'tests';
 if(/\b(release|baseline|version|history|historical|timeline)\b/.test(q)&&/\b(show|find|list|compare|history|release|baseline)\b/.test(q))return 'releases';
 if(/\b(api|apis|endpoint|endpoints|rest operations?|call paths?|dependency paths?|affected operations?)\b/.test(q)&&/\b(show|find|list|trace|which|affected|call paths?)\b/.test(q))return 'apis';
 return 'all';
}
function impactFocusToolbar(focus){
 const labels={all:'Complete impact',apis:'Affected APIs',mappings:'Mapping gaps',tests:'Regression tests',releases:'Release history'};
 return `<nav class="ci-impact-focus" aria-label="Impact result views">${Object.entries(labels).map(([id,label])=>`<button type="button" class="ci-focus-button ${focus===id?'active':''}" data-impact-focus="${id}" aria-pressed="${focus===id}">${esc(label)}</button>`).join('')}</nav>`;
}
function renderFocusedImpact(r,focus){
 const review=r.operation_evidence?.role_review||{};
 const primary=array(review.priority_operations),secondary=array(review.conditional_or_other_operations);
 const opHtml=o=>{const paths=array(o.candidate_call_paths);return `<details class="ci-impact-operation"><summary><span class="ci-priority ci-priority-${esc(String(o.change_review_priority||'review').toLowerCase())}">${esc(o.change_review_priority||'REVIEW')}</span><strong>${esc(o.http_method||'')} ${esc(o.endpoint||'')}</strong><span class="ci-op-role">${esc(array(o.requirement_roles).join(' + '))}</span><small>${paths.length} paths</small></summary><div class="ci-operation-body"><p>${esc(o.role_reason||o.reason||'Review required')}</p>${paths.length?paths.map(c=>`<div class="ci-chain">${array(c.path).map((node,i)=>`<div class="ci-chain-step"><strong>${esc(node.class)}.${esc(node.method)}()</strong><small>${esc(node.file)}:${esc(node.line)}</small></div>${i<array(c.path).length-1?'<div class="ci-chain-arrow">↓</div>':''}`).join('')}<small>Matched attributes: ${esc(array(c.matched_attributes).join(', '))} · candidate, not AST</small></div>`).join(''):'<p class="ev-muted">No source-backed attribute path resolved. Impact is not ruled out.</p>'}</div></details>`};
 let heading='',content='';
 if(focus==='apis'){
  heading='Affected APIs and candidate call paths';
  content=`<p class="ev-muted">Review priorities are inferred, not verified changes. Expand each operation to inspect available source-backed candidates.</p>${primary.length||secondary.length?[...primary,...secondary].map(opHtml).join(''):notice('No prioritized operation evidence returned for this request.')}`;
 }else if(focus==='mappings'){
  heading='Mapping-to-source comparison';
  const gaps=array(r.operation_evidence?.mapping_source_gaps),rows=array(r.mappings);
  content=`<h4>Implementation review gaps · ${gaps.length}</h4>${gaps.length?gaps.map(g=>evidenceLine(g.attribute,g.classification,g.note)).join(''):notice('No mapping-to-source gap reported by the backend.')}<h4>Imported mapping rows · ${rows.length}</h4>${rows.map(x=>evidenceLine(`${x.source_path||'Source'} → ${x.target_expression||x.target_attribute||'Target'}`,x.mapping_rule||'',`${x.provenance?.document||'Document'} · row ${x.provenance?.row||'—'}`)).join('')||notice('No imported mapping rows returned.')}`;
 }else if(focus==='tests'){
  heading='Regression recommendations and coverage';
  const recs=array(r.regression_recommendations),existing=array(r.test_cases),scenarios=array(r.scenarios);
  content=`<p class="ev-muted">Recommendations are not test executions. Existing scenarios and imported tests are shown separately.</p><h4>Recommended · ${recs.length}</h4>${recs.map(t=>evidenceLine(t.scenario||t.title||'Recommendation',t.classification||'NOT_EXECUTED')).join('')||notice('No recommendations returned.')}<h4>Existing scenarios · ${scenarios.length}</h4>${scenarios.map(x=>evidenceLine(x.name||x.scenario||x.scenario_id||'Scenario',x.description||'')).join('')||notice('No matching existing scenarios returned.')}<h4>Imported test cases · ${existing.length}</h4>${existing.map(x=>evidenceLine(x.title||x.name||x.test_case_id||'Test case',x.status||'Execution not verified')).join('')||notice('No imported test cases returned.')}`;
 }else if(focus==='releases'){
  heading='Release history and baselines';
  const releases=array(r.releases),baselines=array(r.baselines||r.release_baselines);
  content=`<p class="ev-muted">Historical release evidence must be retrieved and linked by the backend; no release impact is inferred from this requirement alone.</p><h4>Releases · ${releases.length}</h4>${releases.map(x=>evidenceLine(x.release_key||x.version||x.name||'Release',x.summary||'')).join('')||notice('No linked release history returned for this JIRA.')}<h4>Baselines · ${baselines.length}</h4>${baselines.map(x=>evidenceLine(x.version||x.name||x.id||'Baseline',x.summary||'')).join('')||notice('No linked baseline evidence returned.')}<p class="ev-muted">${esc(array(r.unavailable).find(x=>/release baseline/i.test(x))||'No verified release-to-JIRA linkage supplied.')}</p>`;
 }
 return `<div class="ev-dashboard"><div class="ci-impact-panel"><h3>${esc(heading)}</h3>${content}</div><details class="ev-technical"><summary>Technical response and provenance</summary>${technicalDetails(r)}</details></div>`;
}
function renderAdaptiveImpact(r){
 const focus=state.impactFocusOverride||impactFocus(state.question);
 return impactFocusToolbar(focus)+(focus==='all'?renderRequirementImpact(r):renderFocusedImpact(r,focus));
}
function renderRequirementImpact(r){
 const jiras=array(r.historical_jiras),rows=array(r.mappings),scenarios=array(r.scenarios),conflicts=array(r.mapping_conflicts),recs=array(r.regression_recommendations);
 const code=array(r.code_impact?.candidates),verified=array(r.verified_code_changes),git=impactGitCommits(r),releases=array(r.releases);
 const current=r.jira?.jira_id? [{jira_id:r.jira.jira_id,summary:r.jira.summary,relationship:'CURRENT_REQUIREMENT'}]:[];
 const allJiras=[...current,...jiras.filter(j=>j.jira_id!==r.jira?.jira_id)];
 const cards=[];
 if(git.length)cards.push(evidenceCard('⑂',`Git changes · ${git.length}`,git.map(c=>{const sha=c.commit||c.sha||c.hash||c.commit_sha||'';const url=typeof c.url==='string'&&/^https:\/\/github\.com\//i.test(c.url)?c.url:'';return `<div class="ev-line"><strong>${esc(sha)}</strong><div>${esc(c.subject||c.message||'Commit')}</div><small>${esc(c.file||'')}</small>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">View commit ↗</a>`:''}</div>`}).join(''),'Git evidence'));
 if(allJiras.length)cards.push(evidenceCard('▣',`JIRA · ${allJiras.length}`,allJiras.map(j=>evidenceLine(j.jira_id,j.summary,j.relationship==='CURRENT_REQUIREMENT'?'Selected JIRA':'Related requirement mention')).join(''),'Requirements'));
 if(rows.length){
  const groups=new Map(),seen=new Set();
  for(const x of rows){
   const v=x.provenance||{};
   const identity=[v.document_id||v.source_ref||v.document||'',v.sheet||'',v.row||'',x.source_path||'',x.target_expression||x.target_attribute||''].join('|');
   if(seen.has(identity))continue;seen.add(identity);
   const key=String(v.document_id||v.source_ref||v.document||'Unknown document');
   if(!groups.has(key))groups.set(key,{name:v.document||'Mapping document',source:v.source_ref||'',rows:[]});
   groups.get(key).rows.push(x);
  }
  const sections=[...groups.values()].map(g=>`<details class="ev-technical" open><summary>${esc(g.name)} · ${g.rows.length} rows</summary><p class="ev-muted">${esc(g.source)}</p>${g.rows.map(x=>evidenceLine(`${x.source_path||'Source'} → ${x.target_expression||x.target_attribute||'Target'}`,`Rule: ${x.mapping_rule||'Not specified'}`,`${x.provenance?.sheet||''} row ${x.provenance?.row||'—'}`)).join('')}</details>`).join('');
  cards.push(evidenceCard('▤',`Mapping documents · ${groups.size} documents · ${seen.size} rows`,sections,'Documented · versions kept separate'));
 }
 cards.push(testEvidenceHtml(r));
 if(scenarios.length)cards.push(evidenceCard('◇',`Related scenarios · ${scenarios.length}`,scenarios.map(x=>evidenceLine(x.scenario_code||x.name||'Scenario',x.name||'',`${x.http_method||''} ${x.endpoint||''} · Potential match`)).join(''),'Possible match'));
 if(verified.length)cards.push(evidenceCard('⌘',`Git-changed Java methods · ${verified.length}`,verified.map(c=>evidenceLine(`${c.method||'Method'} · ${c.change||'changed'}`,`${c.file||''}${c.line?':'+c.line:''}`,`Commit ${String(c.commit_sha||'').slice(0,12)} · source diff evidence`)).join(''),'Verified commit'));
 if(code.length&&!array(r.java_evidence?.methods).length){
  const attrTokens=array(r.attributes).map(a=>String(a).toLowerCase());
  const evidence=code.flatMap(c=>array(c.source_evidence)).filter(e=>{
    const statement=String(e.statement||'').toLowerCase();
    return attrTokens.some(a=>statement.includes(a)||statement.includes(a.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase()));
  });
  const info=evidence.length
    ? evidence.slice(0,10).map(e=>evidenceLine(e.method_candidate||'Source candidate',`${e.file||''}:${e.line||''}`,compact(e.statement,180))).join('')
    : '<p>No direct firstName/lastName source statement was identified by the current heuristic scan. Generic validation and exception-handler matches have been hidden; method-level tracing is still needed.</p>';
  cards.push(`<details class="ev-technical"><summary>Java source evidence · ${evidence.length} direct attribute match${evidence.length===1?'':'es'}</summary><p>Source text matches are not verified dependency paths or implemented CAS-6 changes.</p>${info}</details>`);
 }
 if(releases.length)cards.push(evidenceCard('▧',`Release evidence · ${releases.length}`,releases.map(x=>evidenceLine(x.version||x.release_key||x.name||'Release',x.summary||'')).join('')));
 if(recs.length)cards.push(evidenceCard('✓',`Suggested tests · ${recs.length}`,recs.map(x=>evidenceLine(x.scenario||x.title||'Test recommendation','','Suggested, not executed')).join(''),'Recommendations'));
 
 let alerts=conflicts.map(c=>`<div class="ev-alert"><strong>${esc(c.attribute||'Mapping rule needs review')}</strong><div>Requirement: ${esc(c.requirement||'')}</div><div>Document: ${esc(c.document_rule||'')}</div></div>`).join('');
 const title=r.jira?.summary||r.input||'Impact analysis';
 return `<div class="ev-dashboard">${requirementImpactHighlights(r)}${!r.operation_evidence?.role_review?proposedOperationCards(r).join(''):''}<div class="ev-heading"><div><h2>${esc(title)}</h2><p>${esc(r.jira?.jira_id||r.input||'')} ${array(r.attributes).map(a=>`<span class="impact-chip">${esc(a)}</span>`).join(' ')}</p></div></div>${alerts?`<section class="ev-attention"><h3>Needs attention</h3>${alerts}</section>`:''}${evidenceGrid(cards)}${!git.length?'<div id="impactGitStatus" class="ci-sub" role="status" aria-live="polite">Git history not yet checked.</div>':''}${qaLookupHtml(r)}${technicalDetails(r)}</div>`;
}
// Presentation is directed by the backend's validated LLM DSL, never by UI regex.
// Older ASK stream responses without presentation_plan display every evidence section.
const ASK_SECTIONS = Object.freeze({JIRA:'jira',GIT:'code',CODE:'code',MAPPINGS:'mappings',TESTS:'tests',RELEASES:'releases',SCENARIOS:'scenarios'});
function askPresentation(result){
 const plan=result?.presentation_plan;
 if(!plan||plan.schema_version!=='1.0'||!Array.isArray(plan.primary_sections)||plan.complete_impact===true){
  return {all:true,primary:new Set(),source:'ALL_EVIDENCE_FALLBACK'};
 }
 const valid=plan.primary_sections.filter(id=>Object.hasOwn(ASK_SECTIONS,id));
 if(!valid.length)return {all:true,primary:new Set(),source:'ALL_EVIDENCE_FALLBACK'};
 return {all:false,primary:new Set(valid.map(id=>ASK_SECTIONS[id])),source:plan.planner||'BACKEND'};
}
function proposedOperationCards(r){
 const ops=array(r.affected_operations);
 if(!ops.length)return [];
 const priority={POST:0,PUT:1,PATCH:2,GET:3,DELETE:4};
 const ordered=[...ops].sort((a,b)=>(priority[a.http_method]??9)-(priority[b.http_method]??9));
 const counts=ordered.reduce((acc,o)=>(acc[o.http_method]=(acc[o.http_method]||0)+1,acc),{});
 const short=Object.entries(counts).map(([method,count])=>`${method} ${count}`).join(' · ');
 const entries=ordered.map(o=>evidenceLine(`${o.http_method||'HTTP'} ${o.endpoint||''}`,
   `${o.controller_method||''}${o.controller_file?' · '+o.controller_file:''}`,
   `${o.classification||'INFERRED'} · ${o.reason||'Requires code-path verification'}`)).join('');
 return [`<details class="ev-technical ci-operations-compact" style="margin:0 0 12px;padding:0;overflow:hidden">
   <summary style="cursor:pointer;padding:12px 16px;font-weight:600">Potentially affected HTTP operations · ${ops.length} <span style="font-size:12px;font-weight:400;opacity:.8;margin-left:8px">${esc(short)} · Expand</span></summary>
   <div style="padding:0 16px 12px"><p style="margin:0 0 8px;font-size:12px;opacity:.8">Controller entry points only; attribute-to-operation dependencies are not yet verified.</p>${entries}</div>
  </details>`];
}
function renderAskEvidence(r){
 if(r?.intent==='JIRA_IMPACT_ANALYSIS'||r?.source==='JIRA_REQUIREMENT_IMPACT')return renderAdaptiveImpact(r);
 if(r?.source==='MAPPING_DOCUMENT_EVIDENCE'&&askPresentation(r).primary.has('mappings'))return `<div class="ev-dashboard">${mappingContent(r)}${technicalDetails(r)}</div>`;

 const answer=textAnswer(r),engineering=r.engineering_evidence||{},git=r.git_commit_evidence||engineering.git_commit_evidence||{},commits=Object.values(git).flatMap(v=>array(v?.commits));
 const urls=[...new Set(String(answer).match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/[a-f0-9]{7,40}/gi)||[])];
 const commitKeys=[...new Set([...commits.map(c=>c.commit||c.sha||c.hash).filter(Boolean),...urls.map(u=>u.split('/').pop())])];
 const candidateJiras=array(r.candidate_jiras||engineering.candidate_jiras).map(x=>typeof x==='string'?x:x?.jira_id||x?.key).filter(Boolean);
 const verifiedJiras=array(r.verified_change_jiras||engineering.verified_change_jiras).map(x=>typeof x==='string'?x:x?.jira_id||x?.key).filter(Boolean);
 const jiraKeys=[...new Set([...candidateJiras,...verifiedJiras,...Object.keys(git),...(String(answer).match(/\b[A-Z][A-Z0-9]+-\d+\b/g)||[])])].filter(x=>/^[A-Z][A-Z0-9]+-\d+$/.test(x));

 const rows=array(r.mapping_rows),docs=array(r.mapping_documents),scenarios=array(r.scenarios||r.affected_scenarios||r.business_scenarios);
 const presentation=askPresentation(r);
  const focus=presentation.all?'all':'selected';
 const cards=[];const related=[];
 const put=(kind,html)=>{if(presentation.all||presentation.primary.has(kind))cards.push(html);else related.push(html)};
 if(commitKeys.length)put('code',evidenceCard('⑂',`Git changes · ${commitKeys.length}`,commitKeys.map(k=>{const c=commits.find(c=>(c.commit||c.sha||c.hash)===k)||{};const url=urls.find(u=>u.endsWith(k));return `<div class="ev-line"><strong>${esc(k.slice(0,12))}</strong><div>${esc(c.subject||c.message||'Commit found in engineering evidence')}</div>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open commit ↗</a>`:''}</div>`}).join(''),'Commit evidence'));
 if(jiraKeys.length){
  const known=[...array(r.historical_jiras),...array(r.jiras),...array(r.jira_issues),...array(engineering.historical_jiras),...array(engineering.jira_issues),...(r.jira?[r.jira]:[])];
  const lookup=r._jiraSummaries||{};
  put('jira',evidenceCard('▣',`JIRA · ${jiraKeys.length}`,jiraKeys.map(k=>{
   const record=known.find(j=>(j.jira_id||j.jira_key||j.key)===k)||{};
   const subject=record.summary||record.title||lookup[k]||'';
   const relation=verifiedJiras.includes(k)?'Verified code change':candidateJiras.includes(k)?'Related requirement mention':'Mentioned in engineering evidence';
   return evidenceLine(k,subject||'Subject not available in indexed JIRA records',relation);
  }).join(''),'Requirements'));
 }
 if(docs.length||rows.length)put('mappings',evidenceCard('▤',`Mapping documents · ${docs.length||rows.length}`,rows.map(x=>evidenceLine(x.provenance?.document||x.target_expression||'Mapping',`${x.source_path||''} → ${x.target_expression||x.target_attribute||''}`,`Rule: ${x.mapping_rule||'Not specified'} · ${x.provenance?.sheet||''} row ${x.provenance?.row??'—'}`)).join('')||docs.map(d=>evidenceLine(d.filename||d.title||'Document',d.source_ref||'')).join('')));
 codeImpactHtml(r).forEach(card=>put('code',card));
 if(testRecords(r).length)put('tests',testEvidenceHtml(r));
 if(array(r.project_release_baselines).length)put('releases',releaseBaselineHtml(r));
 if(scenarios.length)put('scenarios',evidenceCard('◇',`Scenarios · ${scenarios.length}`,scenarios.map(x=>evidenceLine(x.scenario_code||x.name||'Scenario',x.name||'')).join('')));
 const body=String(answer||'').trim();
 if(body&&!cards.length&&!related.length)cards.push(evidenceCard('▤','Analysis result',`<div class="ev-readable">${findLinks(body.replace(/^#{1,6}\s*/gm,'').replace(/\*\*/g,''))}</div>`));
 const focusLabel=[...presentation.primary].join(', ')||'requested evidence';
 const focusNotice=focus!=='all'&&!cards.length?notice(`No structured ${focusLabel?.toLowerCase()||'requested'} was returned for this question. Other retrieved evidence is available below.`):'';
 const relatedHtml=focus!=='all'&&related.length?`<details class="ev-technical"><summary>Related evidence · ${related.length} section${related.length===1?'':'s'}</summary>${evidenceGrid(related)}</details>`:'';
 return `<div class="ev-dashboard">${focusNotice}${cards.length?evidenceGrid(cards):focus==='all'?notice('No evidence was returned.'):''}${relatedHtml}${rows.length&&(presentation.all||presentation.primary.has('mappings'))?`<details class="ev-technical"><summary>Mapping source, target and transformation details</summary>${mappingContent(r)}</details>`:''}${body&&cards.length?`<details class="ev-technical"><summary>Full analysis text</summary><div class="ev-readable" style="padding:14px">${findLinks(body.replace(/^#{1,6}\s*/gm,'').replace(/\*\*/g,''))}</div></details>`:''}${technicalDetails(r)}</div>`;
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
function bindImpactFocusButtons(){
 $('mainBody').querySelectorAll('[data-impact-focus]').forEach(button=>button.addEventListener('click',()=>{state.impactFocusOverride=button.dataset.impactFocus;renderAnswer(state.result)}));
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
 $('mainBody').innerHTML=renderAskEvidence(r);
 bindImpactFocusButtons();
 if(state.view==='ask' && r?.source!=='MAPPING_DOCUMENT_EVIDENCE')enrichAskJiraSubjects(r);
 $('insights').innerHTML=mapping?item('Evidence source',`${docs.length} imported mapping document(s) · ${rows.length} row(s)`)+(r.note?item('Evidence boundary',r.note):''):item('Evidence source',r.source||r.status||'ASK result')+(r.note?item('Evidence boundary',r.note):'');
 setVisible('insightsPanel',false);
 $('rightCode').innerHTML=commits.map(c=>item(c.subject||c.message||c.commit||'Commit',(c.commit||'').slice(0,12))).join('');
 $('rightJiras').innerHTML=jiraKeys.map(k=>item(k,'Historical commit association')).join('');
 $('rightScenarios').innerHTML=hasScenarios?`<div class="evidence">${esc(fmt(scenarioData))}</div>`:'';
 setVisible('rightCodePanel',hasCode&&commits.length>0);setVisible('rightJirasPanel',jiraKeys.length>0);setVisible('rightScenariosPanel',hasScenarios);
 setVisible('rightbar',false);
 $('qaPreview').innerHTML=qa?item(`${qa} imported QA records`,'Imported plans are not execution evidence'):'';
 $('changesPreview').innerHTML=commits.map(c=>item((c.commit||'').slice(0,9),c.subject||c.message||'Commit')).join('');
 setVisible('qaPanel',false);setVisible('changesPanel',false);setVisible('bottomGrid',false);
 const tabAllowed={overview:true,code:false,mappings:false,jira:false,qa:false,scenarios:false,graph:false};
 document.querySelectorAll('#tabs [data-tab]').forEach(b=>{b.hidden=!tabAllowed[b.dataset.tab];b.style.display=tabAllowed[b.dataset.tab]?'':'none'});
 if(!tabAllowed[state.tab])state.tab='overview';
 document.querySelectorAll('#tabs [data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===state.tab));
 if(state.tab!=='overview')showTab(state.tab);
}
async function enrichAskJiraSubjects(result){
 // The ASK payload often contains issue keys without subjects. Resolve exact keys
 // against indexed JIRA data, falling back to the indexed search endpoint.
 const engineering=result.engineering_evidence||{};
 const ids=[...new Set([
  ...array(result.candidate_jiras||engineering.candidate_jiras).map(x=>typeof x==='string'?x:x?.jira_id||x?.key),
  ...array(result.verified_change_jiras||engineering.verified_change_jiras).map(x=>typeof x==='string'?x:x?.jira_id||x?.key),
  ...Object.keys(result.git_commit_evidence||{}),
  ...(String(textAnswer(result)).match(/\b[A-Z][A-Z0-9]+-\d+\b/g)||[])
 ])].filter(x=>/^[A-Z][A-Z0-9]+-\d+$/.test(x));
 if(!ids.length)return;
 const summaries={...(result._jiraSummaries||{})};
 // JIRA knowledge APIs can return an array or a wrapper such as {issues:[...]}.
 const unpack=(data)=>{
  if(Array.isArray(data))return data;
  if(!data||typeof data!=='object')return [];
  for(const k of ['issues','jiras','jira_issues','requirements','results','items','data','records']){
   const v=data[k];if(Array.isArray(v))return v;
   if(v&&typeof v==='object'){const nested=unpack(v);if(nested.length)return nested;}
  }
  return data.jira_id||data.jira_key||data.key?[data]:[];
 };
 const accept=(data)=>{
  for(const row of unpack(data)){
   if(!row||typeof row!=='object')continue;
   const id=String(row.jira_id||row.jira_key||row.key||row.issue_key||'').toUpperCase();
   if(!ids.includes(id))continue;
   const fields=row.fields||{};
   const title=row.summary||row.title||row.subject||fields.summary||fields.title;
   if(typeof title==='string'&&title.trim())summaries[id]=title.trim();
  }
 };
 try{accept(await api('/api/jira-knowledge'))}catch(_err){}
 for(const id of ids.filter(id=>!summaries[id])){
  try{
   const data=await api('/api/jira-knowledge/search?'+new URLSearchParams({query:id,top_k:'20'}));
   accept(data);
  }catch(_err){}
 }
 if(state.result!==result||state.view!=='ask')return;
 result._jiraSummaries=summaries;
 if(state.tab==='overview'){ $('mainBody').innerHTML=renderAskEvidence(result); bindImpactFocusButtons(); }
}

function setSteps(lines){$('steps').innerHTML=lines.map(x=>`<div class="${x[0]}">${x[0]==='done'?'✓':x[0]==='running'?'◉':'○'} ${esc(x[1])}</div>`).join('')}
// Route explicit impact-analysis requests through the same structured endpoint as the
// Impact Analysis workspace. Generic ASK and history queries retain agent routing.
function askImpactTarget(query){
 const q=String(query||'').trim();
 const jira=q.match(/\b[A-Z][A-Z0-9]+-\d+\b/i);
 // All explicit JIRA impact, API, mapping, regression and release questions share
 // the same structured evidence contract; the view is chosen independently.
 if(jira && /\b(analy[sz]e|analysis|impact|affected|api|apis|endpoint|mapping|mapped|gap|regression|tests?|coverage|release|baseline|history|call path|dependency)\b/i.test(q))
  return {mode:'jira',value:jira[0].toUpperCase()};
 if(!/\b(impact|affected|affect|analysis|analy[sz]e)\b/i.test(q))return null;
 const identifiers=[
  [/\bcountry[\s_-]*code\b/i,'countryCode'],
  [/\bfirst[\s_-]*name\b/i,'firstName'],
  [/\blast[\s_-]*name\b/i,'lastName'],
  [/\bfull[\s_-]*name\b/i,'fullName'],
  [/\baccount[\s_-]*type\b/i,'accountType'],
  [/\bprimary[\s_-]*email\b/i,'primaryEmail']
 ];
 for(const [pattern,value] of identifiers)if(pattern.test(q))return {mode:'attribute',value};
 return null;
}
async function runStructuredImpact(target,query){
 const project=state.project;
 $('run').disabled=true;$('runState').textContent='Running';
 setSteps([['running','Analyzing source and requirement evidence…']]);
 $('mainBody').innerHTML=notice('Analyzing impacted operations, JIRA, mappings and tests…');
 try{
  const r=await api('/api/requirement-impact/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:target.mode,value:target.value,project})});
  if(state.project!==project||state.view!=='ask'||state.question!==query)return;
  const result={...r,intent:'JIRA_IMPACT_ANALYSIS',source:'JIRA_REQUIREMENT_IMPACT'};
  renderAnswer(result);saveRecent(query);
  $('runState').textContent='Completed';
  setSteps([['done','Structured project-scoped impact analysis completed']]);
 }catch(error){
  $('runState').textContent='Failed';
  $('mainBody').innerHTML=notice('Impact analysis failed: '+(error.message||error));
  setSteps([['error','Structured impact request failed']]);
 }finally{$('run').disabled=false;}
}
function run(){if(!requireProject())return;state.impactFocusOverride=null;const query=$('question').value.trim();if(!query)return toast('Enter a question');state.question=query;state.view='ask';setView('ask');const impactTarget=askImpactTarget(query);// JIRA ASK must use the comprehensive knowledge-agent endpoint; do not bypass it.
 // Project path is passed to the event gateway below.
 if(impactTarget){runStructuredImpact(impactTarget,query);return;}$('run').disabled=true;$('runState').textContent='Running';setSteps([['running','Retrieving verified engineering evidence…']]);$('mainBody').innerHTML='<div class="empty">Waiting for backend response…</div>';const source=new EventSource('/ui/agent/events?'+new URLSearchParams({query,project_path:state.project,project:state.project}).toString());let finished=false;
source.addEventListener('RUN_STARTED',()=>setSteps([['running','Starting agent run…']]));source.addEventListener('STEP_STARTED',e=>setSteps([['done','Query accepted'],['running',JSON.parse(e.data).step]]));source.addEventListener('STEP_FINISHED',e=>setSteps([['done','Query accepted'],['done',JSON.parse(e.data).step]]));source.addEventListener('STATE_SNAPSHOT',e=>{renderAnswer(JSON.parse(e.data).result);saveRecent(query)});source.addEventListener('RUN_FINISHED',()=>{finished=true;source.close();$('run').disabled=false;$('runState').textContent='Completed';setSteps(state.result?executionSummary(state.result):[['done','Backend completed']])});source.addEventListener('RUN_ERROR',e=>{finished=true;source.close();$('run').disabled=false;$('runState').textContent='Failed';const m=JSON.parse(e.data).message;$('mainBody').innerHTML=notice(m);setSteps([['done','Query accepted'],['error','Backend request failed']])});source.onerror=()=>{if(!finished){source.close();$('run').disabled=false;$('runState').textContent='Disconnected';$('mainBody').innerHTML=notice('Could not reach the ASK stream. Check backend and UI server.')}}}
function saveRecent(q){const norm=x=>x.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();state.recent=[q,...state.recent.filter(x=>norm(x)!==norm(q))].slice(0,8);try{localStorage.setItem('ci_recent',JSON.stringify(state.recent))}catch{}renderRecent()}
function renderRecent(){$('recent').innerHTML=state.recent.map(q=>`<button title="${esc(q)}" data-recent="${esc(q)}">◈ ${esc(q)}</button>`).join('')||'<div class="muted">No recent analyses</div>';document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{if(!requireProject())return;$('question').value=b.dataset.recent;run()});updateProjectGate()}
function showTab(tab){if(!requireProject())return;state.tab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));if(tab==='overview'){renderAnswer(state.result||{answer:'No analysis yet.'});return}const r=state.result||{};let html='';if(tab==='graph'){const paths=Object.values(r.commit_call_paths||{});html=paths.length?`<div class="graph-flow">${paths.map(p=>`<div class="code-node">${esc(fmt(p).slice(0,1800))}</div>`).join('')}</div>`:notice('No structured call graph returned by ASK. Use Impact Analysis to query verified graph services.')}else if(tab==='code')html=content(r);else if(tab==='mappings')html=r.source==='MAPPING_DOCUMENT_EVIDENCE'?mappingContent(r):notice('No mapping rows in this result.');else if(tab==='qa')html=Object.keys(r.test_suites||{}).length?`<div class="evidence">${esc(fmt(r.test_suites))}</div>`:notice('No QA payload in this answer. Ask for CAS-2 test cases.');else if(tab==='jira')html=Object.keys(r.git_commit_evidence||{}).length?`<div class="evidence">${esc(fmt(r.git_commit_evidence))}</div>`:notice('Use the JIRA navigation to search indexed requirements.');else html=notice(`Use the ${tab} workspace to load its live data.`);$('mainTitle').textContent=tab.toUpperCase()+' evidence';$('mainBody').innerHTML=html}
// Knowledge Hub combines independent source APIs; one unavailable source must not hide the others.
function hubRows(payload, keys=[]){
 if(Array.isArray(payload))return payload;
 if(!payload||typeof payload!=='object')return [];
 for(const key of [...keys,'issues','jiras','jira_issues','requirements','documents','results','items','records','data']){
  if(Array.isArray(payload[key]))return payload[key];
  if(payload[key]&&typeof payload[key]==='object'){
   const nested=hubRows(payload[key],[]);if(nested.length)return nested;
  }
 }
 return [];
}
function hubDocIdentity(row){
 const value=row.source_ref||row.path||row.file_path||row.filepath||row.url||row.source_url||row.filename||row.title||row.name||row.document_id||row.id||'';
 return String(value).trim().replace(/\\/g,'/').toLowerCase()||JSON.stringify(row);
}
function hubUnique(rows,kind){
 const seen=new Set();return rows.filter(row=>{
  const id=kind==='jira'?row.jira_id||row.jira_key||row.issue_key||row.key:hubDocIdentity(row);
  const key=String(id||JSON.stringify(row)).trim().replace(/\\/g,'/').toLowerCase();
  if(seen.has(key))return false;seen.add(key);return true;
 });
}
function hubQaDocuments(cases){
 const docs=new Map();
 for(const c of cases){
  const name=c.source_filename||c.filename||'Imported test suite';
  const source=c.source_ref||name;
  const key=String(source).trim().replace(/\\/g,'/').toLowerCase();
  if(!docs.has(key))docs.set(key,{title:name,source_ref:source,source_kind:c.source_kind||'',caseCount:0});
  docs.get(key).caseCount++;
 }
 return [...docs.values()];
}
function hubSection(label,rows,render,empty){
 return `<details class="hub-section" open><summary>${esc(label)} (${rows.length})</summary><div class="hub-section-body">${rows.length?rows.map(render).join(''):notice(empty)}</div></details>`;
}
function hubError(label,reason){return `<div class="hub-warning">${esc(label)} could not be loaded: ${esc(reason)}. Other sources remain available.</div>`}
function hubUrl(value){
 const s=String(value||'').trim();
 try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}
}
function hubLinks(doc){
 const candidates=[doc.download_url,doc.attachment_url,doc.content_url,doc.web_url,doc.source_url,doc.url,doc.source_ref,doc.path];
 const urls=[...new Set(candidates.map(hubUrl).filter(Boolean))];
 return urls.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" download="">${/download|attachment|content/i.test(u)?'Download attachment ↗':'Open source / attachment ↗'}</a>`).join(' · ');
}
function hubMappingDoc(d){
 const text=[d.source_type,d.document_type,d.category,d.kind,d.title,d.name,d.filename,d.document_name,d.source_ref,d.path].join(' ').toLowerCase();
 return /mapping|lineage|field.map|schema.map|\.xlsx|\.xls\b/.test(text)&&!/test|qa|suite|execution/i.test(text);
}
function hubTestDoc(d){
 const text=[d.source_type,d.document_type,d.category,d.kind,d.title,d.name,d.filename,d.document_name,d.source_ref,d.path].join(' ').toLowerCase();
 return /test|qa|suite|execution/i.test(text);
}
async function loadKnowledgeHub(){if(!requireProject())return notice('Select an indexed project to load Knowledge Hub.');
 // Use the existing source APIs. Missing mapping API records can still be present in indexed documents.
 const paths=['/api/jira-knowledge','/api/mapping-intelligence/documents','/api/knowledge-base/documents'];
 const requests=paths.map(path=>api(path));
 if(state.project)requests.push(api('/api/test-suites/search?'+new URLSearchParams({project_path:state.project})));
 const responses=await Promise.allSettled(requests);
 const value=i=>responses[i]?.status==='fulfilled'?responses[i].value:null;
 const normalizedProject=String(state.project||'').replace(/\\/g,'/').replace(/\/$/,'').toLowerCase();
 const inProject=row=>!normalizedProject||!row.project_path||String(row.project_path).replace(/\\/g,'/').replace(/\/$/,'').toLowerCase()===normalizedProject;
 const jiras=hubUnique(hubRows(value(0),['issues','jiras']).filter(inProject),'jira');
 const mapped=hubRows(value(1),['documents']).filter(inProject);
 const indexed=hubUnique(hubRows(value(2),['documents']).filter(inProject),'document');
 const mapping=hubUnique([...mapped,...indexed.filter(hubMappingDoc)],'document');
 const qaPayload=value(3);
 const qaCases=Array.isArray(qaPayload?.test_cases)?qaPayload.test_cases:hubRows(qaPayload,['test_cases','cases']);
 const tests=hubUnique([...indexed.filter(hubTestDoc),...hubQaDocuments(qaCases)],'document');
 const docRow=d=>`<div class="item"><strong>${esc(d.title||d.name||d.filename||d.document_name||'Imported document')}</strong><small>${esc([d.source_ref||d.path||d.filename||d.source_type||'',d.caseCount?`${d.caseCount} imported case(s)`:null].filter(Boolean).join(' · '))}</small>${hubLinks(d)?`<div class="hub-doc-links">${hubLinks(d)}</div>`:''}</div>`;
 const jiraRow=j=>item(j.jira_id||j.jira_key||j.issue_key||j.key||'JIRA',j.summary||j.title||j.requirement||j.description||'');
 let html=`<div class="hub-stats"><div><strong>${jiras.length}</strong><span>Saved JIRA issues</span></div><div><strong>${mapping.length}</strong><span>Mapping documents</span></div><div><strong>${tests.length}</strong><span>Test documents</span></div></div>`;
 html+=hubSection('JIRA issues',jiras,jiraRow,'No saved JIRA issues returned for this project.');
 html+=hubSection('Mapping documents and URLs',mapping,docRow,'No mapping documents found in mapping or indexed document sources.');
 html+=hubSection('Test documents and attachments',tests,docRow,state.project?'No imported test documents returned for this project.':'Select a project to retrieve imported test suites.');
 // No ASK, QA retrieval, source status, generic search, or unrelated indexed-document panels.
 responses.forEach((r,i)=>{if(r.status==='rejected')html+=hubError(['Saved JIRA issues','Mapping documents','Indexed documents','Imported QA suites'][i],r.reason?.message||'Request failed')});
 if(responses[1]?.status==='fulfilled'&&!mapped.length&&mapping.length)html+=`<div class="ci-sub">Mapping API returned no documents; showing ${mapping.length} mapping document(s) from the indexed Knowledge Hub.</div>`;
 return html;
}
async function loadView(view){state.view=view;if(!state.project){setView(view);$('mainTitle').textContent='Project selection required';$('mainBody').innerHTML=notice('Choose an indexed project in the top navigation before opening a workspace.');return;}setView(view);const title=({impact:'Impact Analysis',knowledge:'Knowledge Hub',releases:'Release Intelligence',jira:'JIRA Intelligence',mappings:'Mapping Intelligence',tests:'Testing & Baselines',evaluation:'Evaluation & Diagnostics'})[view];if(view==='ask'){renderAnswer(state.result||{answer:'Ask a question to retrieve live CodeIntelligence evidence.'});return}let html=`<div class="section">`;try{if(view==='knowledge'){html+=await loadKnowledgeHub()}
else if(view==='jira'){const data=await api('/api/jira-knowledge');html+=`<div class="field"><input id="jiraQuery" placeholder="Search Jira requirements, e.g. country code"><button id="jiraSearch" class="primary">Search</button></div><div id="jiraResults"></div><details open><summary>Indexed JIRA requirements (${listOf(data).length})</summary>${listOf(data).map(x=>item(x.jira_id||x.jira_key||x.key||'Jira',x.title||x.requirement||'')).join('')||notice('No indexed Jira issues')}</details>`}
else if(view==='mappings'){const docs=await api('/api/mapping-intelligence/documents');html+=`<div class="field"><input id="mapAttribute" placeholder="Attribute e.g. countryCode"><button id="mapSearch" class="primary">Trace mappings</button></div><div id="mapResults"></div><details open><summary>Mapping documents (${listOf(docs).length})</summary>${listOf(docs).map(x=>item(x.title||x.filename||'Mapping',x.document_version||x.source_ref||'')).join('')||notice('No mapping documents')}</details>`}
else if(view==='impact'){html+=`<div class="impact-entry"><h3>Find related changes and evidence</h3><div class="field"><select id="impactMode" aria-label="Impact analysis entry point"><option value="jira">JIRA</option><option value="requirement">Business requirement</option><option value="attribute">Attribute</option></select><input id="impactAttribute" placeholder="JIRA key, e.g. CAS-10"><button id="impactSearch" class="primary">Analyze impact</button></div><div class="ci-sub">Project: ${esc(state.project||'Select a project in the top navigation')}</div></div><div id="impactResults"></div>`}
else if(view==='releases'){html+=`<div class="field"><input id="releaseKey" value="OCT-2026" placeholder="Release key"><input id="releaseProject" readonly placeholder="Selected project"><button class="primary" id="releaseSearch">Load report</button></div><div id="releaseResults"></div><details><summary>Compare immutable baselines</summary><div class="field"><input id="fromVersion" type="number" min="1" value="1"><input id="toVersion" type="number" min="1" value="2"><button class="primary" id="releaseCompare">Compare</button></div><div id="compareResults"></div></details>${notice('This UI is read-only for baseline capture; historical versions are never altered here.')}`}
else if(view==='tests'){html+=`<div class="field"><input id="testQuery" value="test data for countryCode please"><button id="testSearch" class="primary">Retrieve QA evidence</button></div><div id="testResults"></div>${notice('Imported test plans and separately recorded execution evidence are distinguished by the backend.')}`}
else if(view==='evaluation'){const health=await api('/health');const status=await api('/api/storage/status');html+=`<details open><summary>Backend health</summary><div class="evidence">${esc(fmt(health))}</div></details><details open><summary>Persistence status</summary><div class="evidence">${esc(fmt(status))}</div></details>${notice('No accuracy percentage is invented; use your existing RAG evaluation endpoints for measured metrics.')}`}
}catch(e){html+=notice(e.message)}html+='</div>';$('mainTitle').textContent=title;$('mainBody').innerHTML=html;setVisible('insightsPanel',false);setVisible('rightbar',false);wireView(view)}
function setView(v){document.body.classList.toggle('ci-ask-workspace',v==='ask');document.body.classList.toggle('ci-other-workspace',v!=='ask');document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v))}
function resultAt(id,v){$(id).innerHTML=`<div class="evidence">${esc(fmt(v))}</div>`}
function wireView(v){const bind=(id,fn)=>{if($(id))$(id).onclick=async()=>{if(!requireProject())return;try{await fn()}catch(e){toast(e.message)}}};if(v==='jira')bind('jiraSearch',async()=>{const d=await api('/api/jira-knowledge/search?'+new URLSearchParams({query:$('jiraQuery').value,top_k:'15'}));$('jiraResults').innerHTML=listOf(d).map(x=>item(x.jira_id||x.jira_key||x.key||'JIRA',x.title||x.requirement||fmt(x))).join('')||notice('No matches')});if(v==='mappings')bind('mapSearch',async()=>resultAt('mapResults',await api('/api/mapping-intelligence/lineage?'+new URLSearchParams({attribute:$('mapAttribute').value}))));if(v==='impact'){
 const mode=$('impactMode'),field=$('impactAttribute');
 mode.onchange=()=>{field.placeholder=mode.value==='jira'?'JIRA key, e.g. CAS-10':mode.value==='requirement'?'Describe the new business requirement':'Attribute, e.g. countryCode';field.value=''};
 bind('impactSearch',async()=>{const value=field.value.trim();if(!value)return toast('Enter a JIRA, requirement or attribute');$('impactResults').innerHTML=notice('Searching indexed requirements, historical JIRAs and mapping evidence…');const r=await api('/api/requirement-impact/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode.value,value,project:state.project||null})});state.result=r;const target=$('impactResults');target.innerHTML=renderRequirementImpact(r);const qaButton=$('lookupImpactQa');if(qaButton)qaButton.onclick=()=>lookupImpactQa(r);retrieveImpactGit(r,mode.value,value,state.project,target);});
 }if(v==='releases'){if(state.project)$('releaseProject').value=state.project;bind('releaseSearch',async()=>resultAt('releaseResults',await api(`/api/sdlc/releases/${encodeURIComponent($('releaseKey').value)}/report?`+new URLSearchParams({project_path:state.project}))));bind('releaseCompare',async()=>resultAt('compareResults',await api(`/api/sdlc/releases/${encodeURIComponent($('releaseKey').value)}/compare?`+new URLSearchParams({project_path:state.project,from_version:$('fromVersion').value,to_version:$('toVersion').value})) ))}if(v==='tests')bind('testSearch',async()=>{const d=await api('/api/knowledge-agent/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:$('testQuery').value})});$('testResults').innerHTML=testRecords(d).length?testEvidenceHtml(d):`<div class="ev-readable">${esc(textAnswer(d))}</div>`})}
async function projects(){
 const select=$('projectSelect');
 try{
  const rows=listOf(await api('/api/projects'));
  const available=rows.map(x=>({path:String(x.path||x.project_path||x.directory||'').trim(),name:x.name||x.project_name||''})).filter(x=>x.path);
  select.innerHTML='<option value="">Select a project (required)</option>'+available.map(x=>`<option value="${esc(x.path)}">${esc(x.name||x.path)}</option>`).join('');
  select.required=true;
  select.onchange=()=>changeProject(select.value);
  // Explicit project selection is required for every new page session.
  changeProject('');if(!available.length)toast('No indexed projects found. Index a project first.');
 }catch(e){select.innerHTML='<option value="">Projects unavailable</option>';changeProject('');toast('Could not load indexed projects: '+e.message)}
}
async function check(){try{await api('/health');$('connection').textContent='● Backend connected';$('connection').classList.add('online');await projects()}catch(e){$('connection').textContent='● Backend offline';$('connection').title=e.message}}
$('run').onclick=run;$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();run()}});$('followupSend').onclick=()=>{const q=$('followup').value.trim();if(q){$('question').value=q;$('followup').value='';run()}};$('followup').onkeydown=e=>{if(e.key==='Enter')$('followupSend').click()};$('newAnalysis').onclick=()=>{$('question').value='';state.result=null;loadView('ask');$('question').focus()};$('clearRecent').onclick=()=>{state.recent=[];try{localStorage.removeItem('ci_recent')}catch{}renderRecent()};$('export').onclick=()=>{if(!state.result)return toast('No evidence to export');const b=new Blob([JSON.stringify(state.result,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='codeintelligence-evidence.json';a.click();URL.revokeObjectURL(a.href)};
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>loadView(b.dataset.view));$('workspaceMenu').onchange=()=>{if($('workspaceMenu').value)loadView($('workspaceMenu').value);$('workspaceMenu').value=''};document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>loadView(b.dataset.open));document.querySelectorAll('[data-tab-jump]').forEach(b=>b.onclick=()=>{loadView('ask');showTab(b.dataset.tabJump)});document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.question;run()});try{state.recent=JSON.parse(localStorage.getItem('ci_recent')||'[]')}catch{}renderRecent();renderAnswer({answer:'Ask a question to retrieve live CodeIntelligence evidence.'});setVisible('insightsPanel',false);updateProjectGate();check();
