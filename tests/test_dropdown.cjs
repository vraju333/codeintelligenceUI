const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../static/app.js','utf8');
const section=src.slice(src.indexOf('function projectKey(path)'),src.indexOf('\nfunction setupProjectDialog()',src.indexOf('function projectKey(path)')));
class Node {constructor(){this.value='';this.textContent='';this.children=[];this.title='';}appendChild(x){this.children.push(x)}replaceChildren(x){this.children=x.children}get options(){return this.children} }
async function test(){
 const select=new Node(),status=new Node(),connection=new Node();
 let current='',changed=[];
 const sandbox={console,document:{createElement:()=>new Node(),createDocumentFragment:()=>new Node()},$:id=>({projectSelect:select,ciProjectStatus:status,connection}[id]),state:{project:''},api:async()=>({active_project_path:'D:\\AIlearning\\student-employee-project',projects:[{name:'spring-batch',path:'D:\\AIlearning\\spring-batch'},{name:'student-employee-project',path:'D:\\AIlearning\\student-employee-project'}]}),changeProject:p=>{current=p;changed.push(p);sandbox.state.project=p},updateProjectGate:()=>{},toast:()=>{}};
 vm.createContext(sandbox);vm.runInContext(section,sandbox);
 assert.equal(await sandbox.projects('D:\\AIlearning\\spring-batch'),true);
 assert.equal(select.options.length,3);
 assert.equal(select.value,'D:\\AIlearning\\spring-batch');
 assert.equal(current,select.value);
 sandbox.api=async()=>{throw Error('502 proxy unavailable')};
 assert.equal(await sandbox.projects(),false);
 assert.equal(select.options.length,3,'retain options on transient failure');
 assert.equal(status.textContent,'● Load failed');
 console.log('PASS: populated, preferred selected, project state updated, transient failures preserve options');
}
test().catch(e=>{console.error(e);process.exitCode=1});
