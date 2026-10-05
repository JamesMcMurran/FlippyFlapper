const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function load(file){
    const filename=path.join(__dirname,'..','lib',file);
    let source=fs.readFileSync(filename,'utf8');
    const exports='window.api={clampPage,spreads,groupFor,adjacent,shouldCommit,fitBook,thickness,inferPageLayout,applyImposition,createImpositionEditor,expandPages,artworkBox,pageSurface,curlProfile,paperPoint,triangleTransform,paperMesh,PaperRenderer,CanvasPaperRenderer,ImageCache,MagazineViewer,createMagazineViewer};';
    source=source.replace(/window\.FlippyFlapper=Object\.freeze\([^\n]+\);/,exports).replace(/export \{[^\n]+\};/,exports);
    const calls=[];
    const context2d={
        fillRect(...args){calls.push(['fillRect',...args]);},fillText(){},drawImage(...args){calls.push(['drawImage',...args]);},
        translate(){},rotate(){},scale(){},setTransform(){},clearRect(){},beginPath(){},lineTo(){},moveTo(){},
        closePath(){},clip(){},save(){},restore(){},stroke(){},arc(){},getImageData(){return {data:[]};},
    };
    const gl={
        VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,
        DEPTH_TEST:8,CULL_FACE:9,TEXTURE0:10,TEXTURE_2D:11,UNPACK_FLIP_Y_WEBGL:12,MAX_TEXTURE_SIZE:13,
        RGBA:14,UNSIGNED_BYTE:15,TEXTURE_MIN_FILTER:16,TEXTURE_MAG_FILTER:17,LINEAR:18,TEXTURE_WRAP_S:19,
        TEXTURE_WRAP_T:20,CLAMP_TO_EDGE:21,COLOR_BUFFER_BIT:22,DEPTH_BUFFER_BIT:23,TRIANGLES:24,
        createShader(){return {};},shaderSource(){},compileShader(){},getShaderParameter(){return true;},getShaderInfoLog(){return '';},
        createProgram(){return {};},attachShader(){},linkProgram(){},deleteShader(){},getProgramParameter(){return true;},
        getProgramInfoLog(){return '';},useProgram(){},createBuffer(){return {};},bindBuffer(){},getAttribLocation(){return 0;},
        bufferData(){},enableVertexAttribArray(){},vertexAttribPointer(){},getUniformLocation(_program,name){return name;},
        enable(){},disable(){},createTexture(){return {};},activeTexture(){},pixelStorei(){},getParameter(){return 128;},
        bindTexture(){},texImage2D(){},texParameteri(){},uniform1i(){},viewport(){},clearColor(){},clear(){},
        uniform2f(){},uniform1f(){},drawArrays(){},deleteTexture(){},deleteBuffer(){},deleteProgram(){},
    };
    class Image{constructor(){this.width=100;this.height=150;}}
    class HTMLElement{}
    class HTMLCanvasElement extends HTMLElement{toDataURL(){return 'data:image/png;base64,';}}
    class Element{
        constructor(tag){this.tagName=tag;this.width=0;this.height=0;this.style={setProperty(){}};this.dataset={};this.attributes={};this.children=[];this.className='';this.hidden=false;this.classList={add(){},remove(){},toggle(){},contains(){return false;}};}
        getContext(type){return type==='webgl'?gl:context2d;}
        append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parentElement=this;}
        replaceChildren(...nodes){this.children=[];this.append(...nodes);}
        setAttribute(key,value){this.attributes[key]=value;}
        addEventListener(){}
        focus(){}
        scrollTo(){}
        contains(){return false;}
        cloneNode(){return new Element(this.tagName);}
        replaceWith(){}
        querySelector(selector){if(selector==='img')return this.children.find(child=>child.tagName==='img')||null;return null;}
        get isConnected(){return true;}
        get childElementCount(){return this.children.length;}
    }
    const document={createElement(tag){return new Element(tag);},baseURI:'https://test/',hidden:false,querySelector(){return null;}};
    const window={devicePixelRatio:1};
    vm.runInNewContext(source,{window,document,Image,HTMLElement,HTMLCanvasElement,URL,console:{error(){}},setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){return 1;},performance:{now:()=>0},Float32Array,Math,Number,Array,Set,Map,Promise},{filename});
    return {api:window.api,calls,context2d,gl,document,window,Element,HTMLCanvasElement};
}

for(const file of ['flippy-flapper.js','flippy-flapper.esm.js'])test(`${file}: geometry helpers and both renderers exercise normal and fallback paths`,()=>{
    const {api,calls,context2d,gl}=load(file);
    assert.deepEqual(JSON.parse(JSON.stringify(api.spreads(5))),[[1],[2,3],[4,5]]);
    assert.deepEqual(JSON.parse(JSON.stringify(api.groupFor(4,5,'single'))),[4]);
    assert.deepEqual(JSON.parse(JSON.stringify(api.adjacent(3,5,'single',1))),[4]);
    assert.equal(api.adjacent(1,5,'spread',-1),null);
    assert.equal(api.clampPage(4.8,3),3);
    assert.equal(api.shouldCommit(.5,0),true);
    assert.equal(api.shouldCommit(.1,.8),true);
    assert.equal(api.shouldCommit(.1,0),false);
    assert.equal(api.thickness(1,1).left,0);
    assert.equal(api.fitBook(600,800,2/3,{spreadMode:'always'}).mode,'spread');
    assert.equal(api.fitBook(500,800,2/3,{spreadMode:'never'}).mode,'single');
    assert.equal(api.inferPageLayout(3,1),'foldout');
    assert.throws(()=>api.inferPageLayout(0,1));
    assert.throws(()=>api.artworkBox(0,1,1));
    assert.equal(api.artworkBox(100,100,2).width,200);
    const nativeImage={width:100,height:150};
    assert.equal(api.pageSurface(nativeImage,{sheetWidth:1,crop:0},2/3),nativeImage);
    assert.equal(api.pageSurface({width:200,height:150},{sheetWidth:2,crop:1},2/3).width,100);
    assert.ok(api.curlProfile(2,.5,.2).x<2);
    assert.ok(Number.isFinite(api.paperPoint(.5,.5,.5,1,2).x));
    assert.equal(api.triangleTransform([{x:0,y:0},{x:1,y:0},{x:0,y:1}],[{x:2,y:3},{x:3,y:3},{x:2,y:4}])[4],2);
    assert.equal(api.triangleTransform([{x:0,y:0},{x:1,y:0},{x:2,y:0}],[{x:0,y:0},{x:1,y:0},{x:2,y:0}]),null);
    const mesh=api.paperMesh({direction:1,aspect:1},.5,0,2,2);
    assert.equal(mesh.length,8);
    const front={width:100,height:150},back={width:100,height:150};
    const gpu=new api.PaperRenderer({getContext:()=>gl,width:0,height:0});
    gpu.prepare(front,back,{canvasWidth:300,canvasHeight:200,pageWidth:100,aspect:2/3,direction:1,bleed:true});
    gpu.draw(.5,.2);gpu.destroy();
    assert.equal(gpu.textures.length,0);
    const renderer=new api.CanvasPaperRenderer({width:0,height:0,getContext:()=>context2d});
    renderer.prepare(front,back,{canvasWidth:300,canvasHeight:200,pageWidth:100,aspect:2/3,direction:-1,bleed:true,spine:0});
    renderer.draw(.5);renderer.clear();renderer.destroy();
    assert.ok(calls.some(call=>call[0]==='fillRect'));
});

for(const file of ['flippy-flapper.js','flippy-flapper.esm.js'])test(`${file}: viewer layout, artwork, navigation, zoom and thumbnail methods`,async()=>{
    const {api,document,Element}=load(file),proto=api.MagazineViewer.prototype;
    const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element('div'));return nodes.get(selector);};
    const viewer=Object.create(proto);
    Object.assign(viewer,{
        loaded:true,destroyed:false,turn:null,foldoutBusy:false,manifest:{pageCount:4,sourcePageCount:3,pageWidth:100,pageHeight:150,title:'Test',pages:[
            {index:1,sourceIndex:1,image:'one',thumbnail:'thumb',layout:'single',sheetWidth:1,crop:0},
            {index:2,sourceIndex:2,image:'two',thumbnail:'thumb',layout:'foldout',sheetWidth:2,crop:1},
            {index:3,sourceIndex:2,image:'two',thumbnail:'thumb',layout:'single',sheetWidth:1,crop:0,region:{x:0,y:0,width:1,height:1}},
            {index:4,sourceIndex:3,image:'three',thumbnail:'thumb',layout:'single',sheetWidth:1,crop:0},
        ]},
        state:{pageIndex:2,pageCount:4,mode:'spread',zoom:1,zoomMode:'fit',panX:0,panY:0,autoFlip:false,thumbnailsOpen:false},
        options:{maxZoom:3,preloadDistance:2,showPageThickness:true,animatePageTurns:false,enableAutoFlip:true,enableFullscreen:false,autoFlipIntervalMs:5000},
        openFoldouts:new Set([2,3]),viewportSize:{width:500,height:600},pageWidth:100,pageHeight:150,renderToken:0,
        root:new Element('div'),book:new Element('div'),stack:new Element('div'),canvas:new Element('canvas'),fallback:new Element('div'),cast:new Element('div'),
        pointers:new Map(),listeners:new Map(),reduced:{matches:true},cache:{get:async page=>({image:{width:100,height:150},failed:false}),preload(){}},
        $:node,updateControls(){},stopAutoFlip(){this.state.autoFlip=false;},fit(){this.state.zoom=1;},
        renderPages(){},selectThumbnail(){},announce(){},emit(){},transform(){},boundPan(){},resetPointers(){},
        viewport:{focus(){},setPointerCapture(){},hasPointerCapture(){return false;}},
    });
    viewer.book.classList={add(){},remove(){},toggle(){},contains(){return false;}};
    viewer.book.getBoundingClientRect=()=>({left:0,top:0,width:400,height:600});
    assert.deepEqual(JSON.parse(JSON.stringify(viewer.foldoutMetrics())),{left:1,right:1,scale:1});
    viewer.transform();viewer.boundPan();
    assert.equal(viewer.offset([1]),-50);assert.equal(viewer.offset([2,3]),0);
    assert.equal(viewer.artwork({blank:true}).attributes['aria-label'],'Blank page');
    assert.ok((await viewer.pageElement(1,'right')).children.length);
    const flap=await viewer.pageElement(2,'left');assert.ok(flap.children.length);
    const tiled=await viewer.pageElement(3,'left');assert.ok(tiled.children.length);
    viewer.cache.get=async()=>({image:{width:100,height:150},failed:true});
    const failed=await viewer.pageElement(1,'right');assert.equal(failed.children.at(-1).className,'ff-retry');
    viewer.cache.get=async page=>({image:{width:100,height:150},failed:false});
    const button=new Element('button');viewer.updateFoldoutButton(button,2);assert.equal(button.attributes['aria-expanded'],'true');
    viewer.cancelFoldoutTransition();
    assert.equal(await viewer.changeFoldouts([2],true),false);
    viewer.setPageTurnAnimation(false);
    viewer.goToPage(99);assert.equal(viewer.state.pageIndex,4);
    viewer.first();assert.equal(viewer.state.pageIndex,1);
    viewer.last();assert.equal(viewer.state.pageIndex,4);
    viewer.setZoom(2);assert.equal(viewer.state.zoom,2);
    viewer.zoomIn();viewer.zoomOut();viewer.fit();
    viewer.state.mode='single';viewer.openFoldouts.clear();
    viewer.renderThumbnails();
    viewer.state.thumbnailsOpen=true;viewer.selectThumbnail();
    viewer.openThumbnails();viewer.closeThumbnails();
    await viewer.enterFullscreen();await viewer.exitFullscreen();
    viewer.clearAutoTimer();viewer.scheduleAuto();viewer.startAutoFlip();viewer.stopAutoFlip();
    assert.equal(viewer.getState().pageCount,4);
    viewer.state.mode='single';viewer.state.zoom=1;viewer.state.pageIndex=1;
    proto.pointerDown.call(viewer,{pointerId:7,pointerType:'mouse',button:0,clientX:300,clientY:250,target:{closest:()=>false},preventDefault(){}});
    assert.equal(viewer.gesture.direction,1);
    proto.pointerUp.call(viewer,{pointerId:7});
    clearTimeout(viewer.idleTimer);
    assert.throws(()=>api.createMagazineViewer({},{}),/Pass an HTML element/);
    viewer.canvas=new Element('canvas');viewer.renderer=null;viewer.useCanvasRenderer();assert.equal(viewer.book.dataset.renderer,'canvas');
    viewer.state.pageIndex=1;viewer.state.mode='single';viewer.options.animatePageTurns=true;viewer.renderer=null;
    viewer.cache.get=async page=>({image:{src:`image-${page}`},failed:false});
    const turn=viewer.begin(1);
    assert.ok(turn);
    assert.equal(await turn.ready,true);
    viewer.cleanupTurn();
    viewer.cancelTurn();
    viewer.state.pageIndex=2;viewer.state.mode='spread';viewer.openFoldouts.delete(2);
    assert.equal(await viewer.changeFoldouts([2],true),true);
    viewer.openFoldouts.clear();
    viewer.state.pageIndex=1;viewer.state.mode='single';viewer.reduced.matches=false;
    viewer.renderer={prepare(){},draw(){},clear(){}};
    const gpuTurn=viewer.begin(1);
    assert.equal(await gpuTurn.ready,true);
    viewer.cleanupTurn();
    viewer.turn=null;viewer.state.mode='spread';viewer.state.pageIndex=2;viewer.openFoldouts.clear();viewer.pointers.clear();
    const pointerEvent=(pointerId,x)=>({pointerId,pointerType:'touch',button:0,clientX:x,clientY:250,target:{closest:()=>false},preventDefault(){}});
    proto.pointerDown.call(viewer,pointerEvent(10,150));
    proto.pointerDown.call(viewer,pointerEvent(11,250));
    assert.ok(viewer.pinch);
    viewer.resetPointers();
    clearTimeout(viewer.idleTimer);
});
