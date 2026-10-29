import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
const read=n=>JSON.parse(fs.readFileSync(new URL(n,root),'utf8'));
const data={champions:read('champions.json'),augments:read('augments.json'),stats:read('champion-stats.json')};
const elements=new Map();
const listeners=new Map();
const on=(type,handler)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler)};
const dispatch=(type,target,props={})=>{for(const handler of listeners.get(type)||[])handler({target,...props})};
const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',style:{},addEventListener(){},focus(){},classList:{add(){},remove(){}},showModal(){this.open=true},close(){this.open=false}});return elements.get(id)};
const context=vm.createContext({console,URLSearchParams,setTimeout,clearTimeout,location:{hash:''},localStorage:{getItem(){return'[]'},setItem(){}},window:{scrollY:0,scrollTo(){},addEventListener(){}},document:{activeElement:null,querySelector:element,getElementById:element,addEventListener:on},inputData:data});
const code=fs.readFileSync(new URL('app.js',root),'utf8').replace(/boot\(\);\s*$/,'');
vm.runInContext(code,context);
vm.runInContext(`champions=inputData.champions;augments=inputData.augments;stats=inputData.stats;cMap=new Map(champions.map(c=>[c.id,c]));aMap=new Map();for(const a of augments){aMap.set(a.name,a);aMap.set(a.name.replace(/^퀘스트:\\s*/,''),a);for(const n of a.aliases||[])aMap.set(n,a)}for(const s of Object.values(stats)){s.augments=s.augments.map(r=>({...r,name:byName(r.name).name}));s.combos=s.combos.map(r=>({...r,names:r.names.map(n=>byName(n).name)}))}`,context);
assert.equal(new Set(data.augments.map(a=>a.id)).size,data.augments.length);
for(const a of data.augments){assert.ok(a.name&&a.description.length>10&&a.source.startsWith('https://'));assert.ok(['silver','gold','prismatic'].includes(a.rarity))}
for(const c of data.champions)assert.ok(vm.runInContext(`miniChamp(cMap.get(${JSON.stringify(c.id)}))`,context).includes(`https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion/${c.id}.png`));
const missing=vm.runInContext(`Object.values(stats).flatMap(s=>[...s.augments.map(r=>r.name),...s.combos.flatMap(r=>r.names)]).filter(n=>!aMap.has(n))`,context);
assert.equal(missing.length,0,`Unresolved augment names: ${missing}`);
let pageChecks=0;
assert.equal(vm.runInContext('state.onlyStats',context),false,'All champions must be shown by default');
const fullRoster=vm.runInContext('championSelect(false)',context);
assert.equal((fullRoster.match(/data-action="select-champ"/g)||[]).length,data.champions.length);
assert.ok(vm.runInContext('championSelect(true)',context).includes(`전체 ${data.champions.length}명`));
assert.ok(!vm.runInContext('championSelect(true)',context).includes('${champions.length}'));
for(const s of Object.values(data.stats)){
 assert.equal(s.patch,'16.20');assert.equal(s.augments.length,12);assert.equal(s.combos.length,10);
 for(const row of [...s.augments,...s.combos])for(const field of ['win','pick'])assert.ok(Number.isFinite(row[field])&&row[field]>=0&&row[field]<=100);
}
for(const id of data.champions.map(c=>c.id))for(const page of ['home','champions','combos']){
 const html=vm.runInContext(`state.champ=${JSON.stringify(id)};state.page=${JSON.stringify(page)};({home,champions:championPage,combos:comboPage})[state.page]()`,context);
 assert.ok(html.length>1000);assert.ok(!/NaN|undefined|등급 미확인/.test(html),`${id}/${page} contains invalid data`);pageChecks++;
}
for(const rarity of ['all','silver','gold','prismatic']){
 const html=vm.runInContext(`state.rarity=${JSON.stringify(rarity)};catalog()`,context);assert.ok(html.includes('증강 도감'));pageChecks++;
}
assert.ok(vm.runInContext('guide()',context).includes('실시간 전체 전적 서비스는 아닙니다'));
vm.runInContext(`state.champ='Yasuo';state.weight=100;state.minPick=0`,context);
let rows=vm.runInContext('recs()',context);assert.equal(rows[0].name,'신비한 주먹');assert.equal(rows[0].win,65.4);
vm.runInContext('state.weight=0',context);rows=vm.runInContext('recs()',context);assert.equal(rows[0].name,'영혼 흡수');assert.equal(rows[0].pick,24);
vm.runInContext('state.weight=70;state.minPick=5',context);rows=vm.runInContext('recs()',context);assert.ok(rows.every(r=>r.pick>=5));
const tied=vm.runInContext('rankItems([{win:50,pick:5},{win:50,pick:5}])',context);assert.ok(tied.every(r=>r.score===50));
const allScores=vm.runInContext(`Object.keys(stats).flatMap(id=>{state.champ=id;return recs().concat(comboRecs()).map(r=>r.score)})`,context);assert.ok(allScores.every(n=>Number.isFinite(n)&&n>=0&&n<=100));
vm.runInContext(`state.champ='Yasuo';state.slot1='신비한 주먹';state.slot2='광신자'`,context);assert.ok(vm.runInContext('comboResult()',context).includes('69.9%'));
vm.runInContext(`state.slot2='신비한 주먹'`,context);assert.ok(vm.runInContext('comboResult()',context).includes('서로 다른 증강'));
vm.runInContext(`state.slot2='보석 건틀릿'`,context);assert.ok(vm.runInContext('comboResult()',context).includes('검증된 조합 통계가 없습니다'));
for(const a of data.augments){vm.runInContext(`detail(${JSON.stringify(a.id)})`,context);assert.ok(!elements.get('#modal').innerHTML.includes('undefined'))}
vm.runInContext(`state.champ='Ahri';state.page='champions'`,context);assert.ok(vm.runInContext('championPage()',context).includes('검증된 통계는')||vm.runInContext('championPage()',context).includes('통계가 아직 없습니다'));
const comboHtml=vm.runInContext('comboPage()',context);
for(const c of data.champions)assert.ok(comboHtml.includes(`<option value="${c.id}"`),`${c.id} missing from combo selector`);
assert.ok(comboHtml.includes('<option value="Ahri" selected>'));
vm.runInContext(`location.hash='#combos?champ=Ahri';readRoute()`,context);assert.equal(vm.runInContext('state.champ',context),'Ahri');
vm.runInContext(`state.role='all';state.champQuery='아리';state.onlyStats=false`,context);
assert.ok(vm.runInContext('championSelect(false)',context).includes('data-id="Ahri"'));
vm.runInContext(`state.champQuery='';state.onlyStats=true`,context);
assert.equal((vm.runInContext('championSelect(false)',context).match(/data-action="select-champ"/g)||[]).length,Object.keys(data.stats).length);
assert.equal(vm.runInContext('signedDelta(-2.5)',context),'-2.5');
// Exercise the actual delegated handlers and count DOM replacements during IME input.
let renderCount=0,appHtml='';
Object.defineProperty(element('#app'),'innerHTML',{get:()=>appHtml,set:value=>{appHtml=value;renderCount++}});
for(const [id,key,page,word,match] of [
 ['augment-search','query','augments','신비한 주먹','신비한 주먹'],
 ['champ-search','champQuery','champions','아리','data-id="Ahri"']
]){
 vm.runInContext(`state.page=${JSON.stringify(page)};state.${key}='';state.onlyStats=false;state.onlySaved=false;state.role='all';state.rarity='all';state.limit=96`,context);
 const input={id,value:''};
 const value=()=>vm.runInContext(`state.${key}`,context);
 let before=renderCount;
 dispatch('compositionstart',input);
 for(const partial of ['ㅅ','시','신',word]){
  input.value=partial;dispatch('input',input,{isComposing:true});
  assert.equal(renderCount,before,`${id}: composing input must retain its DOM node`);
  assert.equal(value(),'');
 }
 // Some browsers report the final input as non-composing before compositionend.
 dispatch('input',input,{isComposing:false});assert.equal(renderCount,before);
 dispatch('compositionend',input);
 assert.equal(value(),word);assert.equal(renderCount,before+1);assert.ok(appHtml.includes(match));
 if(key==='query')assert.equal(vm.runInContext('state.limit',context),32);
 // Other browsers emit a final input after compositionend, possibly on the new node.
 dispatch('input',{id,value:word},{isComposing:false});assert.equal(renderCount,before+1);
 // Consecutive syllables and canceled composition must not lose or duplicate text.
 before=renderCount;dispatch('compositionstart',input);
 input.value=word+'ㄱ';dispatch('input',input,{isComposing:true});
 input.value=word+'가';dispatch('compositionend',input);
 assert.equal(value(),word+'가');assert.equal(renderCount,before+1);
 before=renderCount;dispatch('compositionstart',input);dispatch('compositionend',input);
 assert.equal(renderCount,before);
 // Native isComposing also protects an event without an observed compositionstart.
 input.value='ㅂ';dispatch('input',input,{isComposing:true});assert.equal(renderCount,before);
 input.value=word;dispatch('compositionend',input);assert.equal(value(),word);
 // Latin typing, paste, deletion, and clearing still filter immediately.
 for(const text of ['a','Ahri','신비한 주먹','신비한 주','']){
  input.value=text;before=renderCount;dispatch('input',input,{isComposing:false});
  assert.equal(value(),text);assert.equal(renderCount,before+1);
 }
}
console.log('PASS: Korean IME composition, both final-input event orders, repeated/canceled composition, Latin input, paste, deletion, and clearing in both search fields.');
console.log(`PASS: ${data.augments.length} augment descriptions and tiers, ${data.champions.length} portrait URLs, ${Object.keys(data.stats).length} champion datasets, ${pageChecks+1} page templates, all detail views, aliases, ranking endpoints, filters, ties, score bounds, known/unknown/duplicate combos.`);
console.log('Browser layout and interaction QA: unavailable (managed preview supervisor missing).');

