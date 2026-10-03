const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
for(const file of ['flippy-flapper.js','flippy-flapper.esm.js']){
 let source=fs.readFileSync(path.join(__dirname,'..','lib',file),'utf8');
 source=source.replace('window.FlippyFlapper=Object.freeze({create:createMagazineViewer,createMagazineViewer,MagazineViewer});','window.api={validateManifest,expandPages};').replace('export {createMagazineViewer,createMagazineViewer as create,MagazineViewer};','window.api={validateManifest,expandPages};');
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
}
