const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
for(const file of ['flippy-flapper.js','flippy-flapper.esm.js']){
 let source=fs.readFileSync(path.join(__dirname,'..','lib',file),'utf8');
 source=source.replace('window.FlippyFlapper=Object.freeze({create:createMagazineViewer,createMagazineViewer,MagazineViewer,inferPageLayout});','window.api={validateManifest,expandPages,inferPageLayout};').replace('export {createMagazineViewer,createMagazineViewer as create,MagazineViewer,inferPageLayout};','window.api={validateManifest,expandPages,inferPageLayout};');
 const window={};vm.runInNewContext(source,{window,URL});
 test(`${file}: cover spread reads front first and back last, with interior halves in order`,()=>{
  for(const layouts of [['cover-spread'],['cover-spread','single'],['cover-spread','spread']]){
   const manifest=window.api.validateManifest({pageWidth:100,pageHeight:200,pages:layouts.map(layout=>({layout,image:'x.webp',thumbnail:'x.webp'}))},'https://test/');
   const pages=window.api.expandPages(manifest).pages;
   assert.equal(pages[0].sourceIndex,1);assert.equal(pages[0].crop,1);assert.equal(pages[0].sheetWidth,2);
   assert.equal(pages.at(-1).sourceIndex,1);assert.equal(pages.at(-1).crop,0);assert.equal(pages.length%2,0);
   if(layouts[1]==='spread')assert.deepEqual(Array.from(pages.filter(p=>p.sourceIndex===2),p=>p.crop),[0,1]);
  }
 });
 test(`${file}: misplaced cover spread is rejected`,()=>assert.throws(()=>window.api.validateManifest({pageWidth:100,pageHeight:200,pages:['single','cover-spread'].map(layout=>({layout,image:'x',thumbnail:'x'}))},'https://test/'),/first image/));
 test(`${file}: automatic image layout detects shapes and rejects malformed dimensions`,()=>{
  for(const [width,layout] of [[750,'single'],[1000,'single'],[1294,'spread'],[2000,'spread'],[2400,'foldout']])assert.equal(window.api.inferPageLayout(width,1000),layout);
  for(const value of [0,-1,NaN,Infinity,'1000'])assert.throws(()=>window.api.inferPageLayout(value,1000),/positive/);
 });
 test(`${file}: automatic first spread becomes front/back covers and explicit singles remain whole`,()=>{
  const pages=[{layout:'auto',width:2000,height:1545,image:'cover',thumbnail:'cover'},{layout:'auto',width:2000,height:1545,image:'inside',thumbnail:'inside'},{layout:'single',width:2000,height:1545,image:'whole',thumbnail:'whole'}];
  const manifest=window.api.validateManifest({pageWidth:1000,pageHeight:1545,pages},'https://test/');
  assert.equal(manifest.pages[0].layout,'cover-spread');assert.equal(manifest.pages[1].layout,'spread');assert.equal(manifest.pages[2].layout,'single');
  const expanded=window.api.expandPages(manifest).pages;
  assert.equal(expanded[0].crop,1);assert.equal(expanded.at(-1).crop,0);assert.equal(expanded.at(-1).sourceIndex,1);
 });
 test(`${file}: automatic sources require usable image dimensions`,()=>assert.throws(()=>window.api.validateManifest({pageWidth:100,pageHeight:200,pages:[{layout:'auto',image:'x',thumbnail:'x'}]},'https://test/'),/positive/));

}
