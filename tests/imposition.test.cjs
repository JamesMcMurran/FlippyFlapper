const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function api(file,extras={}){let s=fs.readFileSync(path.join(__dirname,'../lib',file),'utf8');s=s.replace(/window.FlippyFlapper=Object.freeze\([^\n]+\);/,'window.api={applyImposition,expandPages,validateManifest,ImageCache,pageSurface};').replace(/export \{[^\n]+\};/,'window.api={applyImposition,expandPages,validateManifest,ImageCache,pageSurface};');const window={};vm.runInNewContext(s,{window,URL,...extras});return window.api;}
const plain=value=>JSON.parse(JSON.stringify(value));
const source=(count)=>({pageWidth:100,pageHeight:150,pages:Array.from({length:count},(_,i)=>({index:i+1,image:`sheet-${i+1}.webp`,thumbnail:`sheet-${i+1}-thumb.webp`,width:200,height:150,layout:'spread'}))});
for(const file of ['flippy-flapper.js','flippy-flapper.esm.js']){
 const lib=api(file),map=(count,cfg)=>lib.applyImposition(source(count),cfg);
 test(`${file}: 16-page saddle stitch unfolds all sheet sides into exact reading order without rewriting images`,()=>{
  const input=source(8),before=JSON.stringify(input),m=lib.applyImposition(input,{type:'booklet'});
  assert.deepEqual(plain(m.pages.map(p=>[p.sourceIndex,p.region.x])),[[1,.5],[2,0],[3,.5],[4,0],[5,.5],[6,0],[7,.5],[8,0],[8,.5],[7,0],[6,.5],[5,0],[4,.5],[3,0],[2,.5],[1,0]]);
  assert.deepEqual(plain(m.pages.map(p=>p.index)),Array.from({length:16},(_,i)=>i+1));
  assert.equal(m.pages[0].image,input.pages[0].image);assert.equal(m.pages[15].image,input.pages[0].image);assert.equal(JSON.stringify(input),before);
 });
 test(`${file}: signatures restart imposition for every smaller section including a short final section`,()=>{const m=map(10,{type:'signature',signaturePages:8});assert.deepEqual(plain(m.pages.filter((p,i)=>i%8===0).map(p=>p.sourceIndex)),[1,5,9]);assert.equal(m.pageCount,20);assert.equal(m.pages[7].sourceIndex,1);assert.equal(m.pages[19].sourceIndex,9);});
 test(`${file}: singles keep whole files, reader spreads preserve left then right and standalone covers`,()=>{assert.equal(map(3,{type:'single'}).pageCount,3);assert.equal(map(3,{type:'single'}).pages[0].region.width,1);const input=source(3);input.pages[0].width=100;input.pages[0].layout='cover';input.pages[2].width=100;input.pages[2].layout='cover';const m=lib.applyImposition(input,{type:'reader-spreads'});assert.deepEqual(plain(m.pages.map(p=>p.sourceIndex)),[1,2,2,3]);assert.equal(m.pages[1].region.x,0);assert.equal(m.pages[2].region.x,.5);});
 test(`${file}: auto output survives validation and repeated expansion including alignment blanks`,()=>{
  const input=source(2);input.pages[1].layout='single';input.pages[1].width=100;
  const mapped=lib.applyImposition(input,{type:'auto'}),validated=lib.validateManifest(mapped,'https://test/'),expanded=lib.expandPages(validated);
  assert.equal(mapped.readingPages,true);assert.equal(expanded.sourcePageCount,2);
  assert.deepEqual(plain(expanded.pages.map(p=>[p.sourceIndex,p.crop,p.sheetWidth,!!p.blank])),[[1,1,2,false],[2,0,1,false],[null,0,1,true],[1,0,2,false]]);
  assert.equal(expanded,validated);
  assert.deepEqual(plain(lib.applyImposition(mapped,{type:'auto'}).pages),plain(mapped.pages));
  assert.throws(()=>lib.validateManifest({...input,pages:[{index:1,blank:true}]},'https://test/'),/image and thumbnail/);
 });
 test(`${file}: reader spreads honor explicit layouts before dimensions`,()=>{
  const input=source(6);['single','cover','spread','cover-spread','auto',undefined].forEach((layout,i)=>input.pages[i].layout=layout);
  input.pages[2].width=100;
  const mapped=lib.applyImposition(input,{type:'reader-spreads'});
  assert.deepEqual(plain(mapped.pages.map(p=>p.sourceIndex)),[1,2,3,3,4,4,5,5,6,6]);
  assert.equal(mapped.pages[0].region.width,1);assert.equal(mapped.pages[2].region.width,.5);
 });
 test(`${file}: reader spreads infer wide foldouts consistently with resolved layouts`,()=>{
  const input=source(3);input.pages[0].layout='auto';input.pages[0].width=450;
  input.pages[1].layout=undefined;input.pages[1].width=450;input.pages[2].layout='spread';input.pages[2].width=450;
  const inferred=lib.applyImposition(input,{type:'reader-spreads'}),resolved=lib.applyImposition(lib.validateManifest(input,'https://test/'),{type:'reader-spreads'});
  assert.deepEqual(plain(inferred.pages.map(p=>p.sourceIndex)),[1,2,3,3]);
  assert.deepEqual(plain(inferred.pages.map(p=>p.region)),plain(resolved.pages.map(p=>p.region)));
 });
 test(`${file}: N-up walks row-major and cut-and-stack walks each pile across sheets`,()=>{assert.deepEqual(plain(map(2,{type:'n-up',rows:2,columns:2}).pages.map(p=>p.sourceIndex)),[1,1,1,1,2,2,2,2]);const m=map(2,{type:'cut-stack',rows:2,columns:2});assert.deepEqual(plain(m.pages.map(p=>p.sourceIndex)),[1,2,1,2,1,2,1,2]);assert.deepEqual(plain(m.pages[6].region),{x:.5,y:.5,width:.5,height:.5});});
 for(const [fold,expected] of [['tri-fold',[[1,2],[2,0],[2,1],[2,2],[1,0],[1,1]]],['z-fold',[[1,1],[1,2],[2,0],[2,1],[2,2],[1,0]]],['gatefold',[[1,1],[1,2],[2,0],[2,1],[2,2],[2,3],[1,3],[1,0]]]])test(`${file}: ${fold} follows its documented panel convention`,()=>{const m=map(2,{type:'brochure',fold});assert.deepEqual(plain(m.pages.map(p=>[p.sourceIndex,Math.round(p.region.x/m.pages[0].region.width)])),expected);});
 test(`${file}: custom assignments preserve rotations and requested panel order`,()=>{const m=map(2,{type:'custom',columns:2,rows:1,order:[{sourceIndex:2,cell:1,rotation:180},{sourceIndex:1,cell:0,rotation:90}]});assert.deepEqual(plain(m.pages.map(p=>[p.sourceIndex,p.rotation])),[[2,180],[1,90]]);assert.equal(m.pages[0].region.x,.5);});
 test(`${file}: malformed grids, unsupported folds, odd booklet sides, duplicated panels and oversized layouts are rejected`,()=>{
  for(const [n,cfg,pattern] of [[3,{type:'booklet'},/even/],[2,{type:'signature',signaturePages:6},/multiple/],[2,{type:'n-up',rows:0},/Rows/],[2,{type:'n-up',columns:1.5},/Columns/],[2,{type:'brochure',fold:'unknown'},/Choose/],[1,{type:'brochure'},/front and back/],[50,{type:'n-up',rows:16,columns:16},/limit/],[2,{type:'custom',order:[]},/assignments/],[2,{type:'custom',order:[{sourceIndex:3,cell:0}]},/outside/],[2,{type:'custom',order:[{sourceIndex:1,cell:2}]},/outside/],[2,{type:'custom',order:[{sourceIndex:1,cell:0,rotation:45}]},/rotation/],[2,{type:'custom',order:[{sourceIndex:1,cell:0},{sourceIndex:1,cell:0}]},/twice/],[2,{type:'unknown'},/supported/]])assert.throws(()=>map(n,cfg),pattern);
 });
 test(`${file}: imposed pages survive validation and expansion with their original source mappings`,()=>{const m=map(4,{type:'booklet'}),validated=lib.validateManifest(m,'https://test/');assert.deepEqual(plain(lib.expandPages(validated).pages.map(p=>p.sourceIndex)),plain(m.pages.map(p=>p.sourceIndex)));assert.throws(()=>lib.validateManifest({...m,pages:m.pages.map((p,i)=>i? p:{...p,region:{x:2,y:0,width:1,height:1}})},'https://test/'),/region/);});
}

for(const file of ['flippy-flapper.js','flippy-flapper.esm.js'])test(`${file}: panel surfaces use original source coordinates and default zero rotation`,()=>{
 const calls=[],ctx={fillRect(){},translate(...v){calls.push(['translate',...v]);},rotate(v){calls.push(['rotate',v]);},drawImage(...v){calls.push(['draw',...v]);}},lib=api(file,{document:{createElement:()=>({width:0,height:0,getContext:()=>ctx})}});
 const image={width:200,height:150},panel={region:{x:.5,y:0,width:.5,height:1},sheetWidth:1,crop:0};
 const canvas=lib.pageSurface(image,panel,2/3);assert.equal(canvas.width,100);assert.equal(canvas.height,150);assert.deepEqual(calls.at(-1),['draw',image,100,0,100,150,-50,-75,100,150]);assert.deepEqual(calls.find(c=>c[0]==='rotate'),['rotate',0]);
 const rotated=lib.pageSurface(image,{...panel,rotation:90},1.5);assert.equal(rotated.width,150);assert.equal(rotated.height,100);
});
