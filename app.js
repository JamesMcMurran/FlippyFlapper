/* HTML5 app wrapper. Images and layout choices stay in this browser. */
(function () {
  'use strict';
  const root=document.getElementById('magazine'),picker=document.getElementById('page-files');
  const status=document.getElementById('app-status'),openButton=document.getElementById('open-images');
  const demoSelect=document.getElementById('open-demo'),layoutButton=document.getElementById('edit-layouts');
  const dialog=document.getElementById('layouts-dialog'),reference=document.getElementById('paper-reference'),rows=document.getElementById('layout-rows');
  let reader=null,objectUrls=[],importing=false,sources=[],paperReference=0,baseUrl=document.baseURI,title='Your magazine';

  /** Report progress or a recoverable import error. */
  function report(message,error=false){status.textContent=message;status.dataset.error=String(error);}
  /** Release image URLs owned by an old magazine. */
  function release(urls){urls.forEach(url=>URL.revokeObjectURL(url));}
  /** Infer a source's layout, allowing explicit choices to override its proportions. */
  function layoutFor(source,index,ref=paperReference){
    if(source.choice!=='auto')return source.choice;
    return FlippyFlapper.inferPageLayout(source.width,source.height);
  }
  /** Install the current source images without revoking their URLs during a layout change. */
  async function mount(initialSourceIndex){
    if(reader)reader.destroy();
    const paper=sources[paperReference],layout=layoutFor(paper,paperReference),paperWidth=paper.width/(layout==='spread'||layout==='foldout'?2:1);
    reader=FlippyFlapper.create(root,{
      manifest:{title,pageWidth:paperWidth,pageHeight:paper.height,pageCount:sources.length,pages:sources.map((s,i)=>({index:i+1,image:s.image,thumbnail:s.thumbnail,layout:layoutFor(s,i),width:s.width,height:s.height}))},
      baseUrl,showHeader:true,globalArrowKeys:true,initialPage:1,initialSourceIndex,
      spreadMode:document.getElementById('page-view').value
    });
    await reader.ready;layoutButton.disabled=false;
    report(`${title} · ${sources.length} images · ${reader.manifest.pageCount} pages`);
  }
  /** Replace the source collection and clean up only the previous magazine. */
  async function install(nextSources,nextBase,nextTitle,urls=[]){
    if(reader){reader.destroy();reader=null;}release(objectUrls);objectUrls=urls;
    sources=nextSources;paperReference=0;baseUrl=nextBase;title=nextTitle;await mount();
  }
  /** Open either the original magazine or the mixed-layout demonstration. */
  async function demo(){
    if(importing)return;layoutButton.disabled=true;
    try{
      const manifest=demoSelect.value==='mixed'?window.FLIPPY_MIXED:window.FLIPPY_DEMO;
      const next=manifest.pages.map((p,i)=>({...p,name:p.name||`Image ${i+1}`,width:p.width||manifest.pageWidth,height:p.height||manifest.pageHeight,choice:p.layout||'auto'}));
      await install(next,new URL('demo/',document.baseURI).href,manifest.title);
    }catch(error){report(error.message,true);}
  }
  /** Decode a user-selected image with a bounded failure time. */
  function loadImage(url){return new Promise((resolve,reject)=>{
    const image=new Image(),timer=setTimeout(()=>finish(new Error('An image took too long to open.')),15000);
    function finish(error){clearTimeout(timer);image.onload=image.onerror=null;error?reject(error):resolve(image);}
    image.onload=()=>finish();image.onerror=()=>finish(new Error('An image could not be decoded. Choose JPEG, PNG, WebP, or AVIF files.'));image.src=url;
  });}
  /** Generate a small WebP thumbnail while preserving the original artwork. */
  function thumbnail(image){
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=Math.max(1,Math.round(160*image.naturalHeight/image.naturalWidth));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(URL.createObjectURL(blob)):reject(new Error('Could not create a page thumbnail.')),'image/webp',.80));
  }
  /** Import naturally sorted images of any aspect ratio. */
  async function importImages(files){
    if(!files.length||importing)return;importing=true;openButton.disabled=demoSelect.disabled=layoutButton.disabled=true;
    const urls=[];
    try{
      const ordered=[...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})),next=[];
      for(let i=0;i<ordered.length;i++){
        report(`Opening image ${i+1} of ${ordered.length}: ${ordered[i].name}`);
        const imageUrl=URL.createObjectURL(ordered[i]);urls.push(imageUrl);
        const image=await loadImage(imageUrl),thumb=await thumbnail(image);urls.push(thumb);
        next.push({name:ordered[i].name,image:imageUrl,thumbnail:thumb,width:image.naturalWidth,height:image.naturalHeight,choice:'auto'});
      }
      await install(next,document.baseURI,'Your magazine',urls);
      report(`${next.length} images opened. Use Page layouts to choose spreads, fold-outs, or white borders.`);
    }catch(error){if(objectUrls!==urls)release(urls);report(error.message,true);}
    finally{importing=false;openButton.disabled=demoSelect.disabled=false;layoutButton.disabled=!reader?.loaded;picker.value='';}
  }
  /** Present source-image layout choices separately from physical page numbers. */
  function editLayouts(){
    if(!sources.length||importing)return;reader.stopAutoFlip();reader.cancelTurn();reference.replaceChildren();rows.replaceChildren();
    sources.forEach((source,index)=>{
      const option=document.createElement('option');option.value=index;option.textContent=`${source.name} (${source.width} × ${source.height})`;reference.append(option);
      const row=document.createElement('div');row.className='layout-row';
      const preview=document.createElement('img');preview.src=new URL(source.thumbnail,baseUrl).href;preview.alt='';preview.loading='lazy';
      const label=document.createElement('label');label.htmlFor=`layout-${index}`;label.textContent=`${index+1}. ${source.name}`;
      const size=document.createElement('small');size.textContent=`${source.width} × ${source.height}`;label.append(size);
      const select=document.createElement('select');select.id=`layout-${index}`;select.dataset.source=index;
      const choices=[['auto','Auto'],['single','Single page · white borders'],['spread','Two-page spread'],['foldout','Fold-out · two panels']];
      if(index===0||index===sources.length-1)choices.push(['cover','Single cover']);
      for(const [value,text] of choices){const item=document.createElement('option');item.value=value;item.textContent=text;select.append(item);}
      select.value=source.choice;row.append(preview,label,select);rows.append(row);
    });reference.value=paperReference;dialog.showModal();
  }
  /** Apply choices and retain the same source image even if physical numbering changes. */
  async function applyLayouts(){
    const sourceIndex=reader.getState().sourceIndex||1;
    paperReference=Number(reference.value);for(const select of rows.querySelectorAll('select'))sources[Number(select.dataset.source)].choice=select.value;
    dialog.close();layoutButton.disabled=true;
    try{await mount(sourceIndex);}catch(error){report(error.message,true);}
  }
  document.getElementById('page-view').addEventListener('change',event=>reader?.setSpreadMode(event.target.value));
  openButton.addEventListener('click',()=>picker.click());demoSelect.addEventListener('change',demo);
  picker.addEventListener('change',()=>importImages(picker.files));layoutButton.addEventListener('click',editLayouts);
  document.getElementById('close-layouts').onclick=document.getElementById('cancel-layouts').onclick=()=>dialog.close();
  document.getElementById('apply-layouts').onclick=applyLayouts;
  window.addEventListener('pagehide',()=>{reader?.destroy();release(objectUrls);});demo();
})();
