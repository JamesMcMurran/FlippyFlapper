/* Flippy Flapper | Browser library | No runtime dependencies */
(function(window){
'use strict';
/** Clamp a one-based page to the manifest. */
const clampPage=(page,count)=>Math.max(1,Math.min(count,Math.round(Number(page)||1)));
/** Pair the front cover, interior spreads, and a final unpaired back cover. */
function spreads(count){const out=[[1]];for(let p=2;p<=count;p+=2)out.push(p+1<=count?[p,p+1]:[p]);return out;}
/** Return the visible logical group without losing the focused page. */
function groupFor(page,count,mode){return mode==='single'?[clampPage(page,count)]:spreads(count).find(g=>g.includes(clampPage(page,count)));}
/** Find an adjacent group, or null at a book boundary. */
function adjacent(page,count,mode,direction){const groups=mode==='single'?Array.from({length:count},(_,i)=>[i+1]):spreads(count);const at=groups.findIndex(g=>g.includes(page));return groups[at+direction]||null;}
/** Use distance and intentional flick velocity to decide whether a drag commits. */
const shouldCommit=(progress,velocity,threshold=.4)=>progress>=threshold||(progress>.06&&velocity>.65);
/** Compute a fitted size, using both viewport width and readable page width. */
function fitBook(width,height,aspect,options={}){width=Math.max(1,width);height=Math.max(1,height);const mode=options.spreadMode==='always'?'spread':options.spreadMode==='never'?'single':width<700||width/2<(options.minSpreadPageWidth??250)?'single':'spread';const pageWidth=Math.min(width/(mode==='spread'?2:1),height*aspect);return {mode,pageWidth,pageHeight:pageWidth/aspect};}
/** Divide page-block thickness between read and unread sheets. */
function thickness(page,count,max=12){const fraction=count<=1?0:(page-1)/(count-1);return {left:fraction*max,right:(1-fraction)*max};}
/** Validate and resolve a magazine's assets relative to its manifest. */
/** Infer a source layout from its aspect ratio; explicit layouts remain authoritative. */
function inferPageLayout(width,height){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new TypeError('Provide positive image width and height.');const aspect=width/height;return aspect<=1?'single':aspect<=2?'spread':'foldout';}
function validateManifest(value,url){if(!value||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>10000)throw Error('The manifest must contain 1 to 10,000 pages.');if(!(Number.isFinite(value.pageWidth)&&value.pageWidth>0&&Number.isFinite(value.pageHeight)&&value.pageHeight>0))throw Error('The manifest needs positive pageWidth and pageHeight values.');if(value.pageCount!=null&&value.pageCount!==value.pages.length)throw Error('pageCount must match the pages array.');const asset=(path)=>{if(typeof path!=='string'||!path.trim())throw Error('Each page needs an image and thumbnail.');const u=new URL(path,url);if(!['http:','https:','blob:','file:'].includes(u.protocol))throw Error('Unsupported image URL.');return u.href;};return {...value,title:String(value.title||'Untitled magazine'),pageCount:value.pages.length,pages:value.pages.map((p,i)=>{if(p.index!=null&&p.index!==i+1)throw Error('Page indexes must begin at 1 and be consecutive.');if(p.layout!=null&&!['auto','single','spread','foldout','cover','cover-spread'].includes(p.layout))throw Error('Page layout must be single, spread, foldout, cover, or cover-spread.');if(p.layout==='cover-spread'&&i!==0)throw Error('A cover spread must be the first image.');if(p.layout==='cover'&&i!==0&&i!==value.pages.length-1)throw Error('Only the first or last image can be a cover.');const detected=p.layout==='auto'?inferPageLayout(p.width,p.height):p.layout;const layout=i===0&&detected==='spread'?'cover-spread':detected;return {...p,layout,index:i+1,image:asset(p.image),thumbnail:asset(p.thumbnail)};})};}

/** Expand source images into physical pages so two-page artwork turns one half at a time. */
function expandPages(manifest) {
  const pages=[];let coverSpread=null;
  const blank=()=>pages.push({index:pages.length+1,sourceIndex:null,layout:'single',sheetWidth:1,crop:0,blank:true});
  for(const source of manifest.pages){
    const layout=source.layout||'single';
    if(layout==='cover-spread'){coverSpread=source;pages.push({...source,index:1,sourceIndex:source.index,sourceLayout:layout,layout:'single',sheetWidth:2,crop:1});continue;}
    if(layout==='spread'&&(pages.length+1)%2===1)blank();
    if(layout==='cover'&&source.index===manifest.pages.length&&source.index>1&&(pages.length+1)%2===1)blank();
    const count=layout==='spread'?2:1;
    for(let half=0;half<count;half++){
      const index=pages.length+1;
      pages.push({...source,index,sourceIndex:source.index,sourceLayout:layout,layout:layout==='foldout'?'foldout':'single',sheetWidth:layout==='spread'||layout==='foldout'?2:1,crop:layout==='spread'?half:layout==='foldout'?(index%2===0?1:0):0});
    }
  }
  if(coverSpread){if((pages.length+1)%2===1)blank();pages.push({...coverSpread,index:pages.length+1,sourceIndex:coverSpread.index,sourceLayout:'cover-spread',layout:'single',sheetWidth:2,crop:0});}
  return {...manifest,sourcePageCount:manifest.pages.length,pageCount:pages.length,pages};
}

/** Center artwork on white paper without cropping, stretching, or reducing source resolution. */
function artworkBox(width,height,paperAspect) {
  if(!(width>0&&height>0&&paperAspect>0))throw new TypeError('Artwork and paper dimensions must be positive.');
  const paperWidth=Math.max(width,Math.ceil(height*paperAspect));
  const paperHeight=Math.max(height,Math.ceil(width/paperAspect));
  return {width:paperWidth,height:paperHeight,x:(paperWidth-width)/2,y:(paperHeight-height)/2};
}

/** Prepare a native-resolution paper surface, including the same white borders shown at rest. */
function pageSurface(image,page,aspect) {
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(page.sheetWidth===1&&Math.abs(width/height/aspect-1)<.0001)return image;
  const box=artworkBox(width,height,aspect*page.sheetWidth);
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(box.width/page.sheetWidth);canvas.height=box.height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,box.x-page.crop*canvas.width,box.y);
  return canvas;
}

/** Integrate a flat, cylindrical, then folded-back paper profile without stretching its length. */
function curlProfile(distance, fold, radius) {
  const angle = Math.max(0, Math.min(Math.PI, (distance - fold) / radius));
  const flat = Math.min(distance, fold);
  const reflected = Math.max(0, distance - fold - Math.PI * radius);
  return {x: flat + radius * Math.sin(angle) - reflected, z: radius * (1 - Math.cos(angle)), angle};
}

/** A rolling paper curl with a pinned spine, moving fold, and pointer-selected corner tilt. */
function paperPoint(u, v, progress, direction, aspect, corner = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const lift = Math.sin(Math.PI * p);
  const radius = .12 + .12 * lift;
  const fold = 1 - p * (1 + Math.PI * radius) + .22 * lift * corner * (v - .5);
  const anchor = curlProfile(0, fold, radius);
  const profile = curlProfile(u, fold, radius);
  const worldX = direction * (profile.x - anchor.x);
  const z = Math.max(0, profile.z - anchor.z);
  const y = (v - .5) / aspect;
  const perspective = 6 / (6 - z);
  return {x: worldX * perspective, y: y * perspective, z, worldX, angle: profile.angle};
}
/** Compute a source-to-destination affine texture transform for one mesh triangle. */
function triangleTransform(source,destination){const [s0,s1,s2]=source,[d0,d1,d2]=destination;const det=(s1.x-s0.x)*(s2.y-s0.y)-(s2.x-s0.x)*(s1.y-s0.y);if(Math.abs(det)<1e-9)return null;const a=((d1.x-d0.x)*(s2.y-s0.y)-(d2.x-d0.x)*(s1.y-s0.y))/det;const c=((s1.x-s0.x)*(d2.x-d0.x)-(s2.x-s0.x)*(d1.x-d0.x))/det;const b=((d1.y-d0.y)*(s2.y-s0.y)-(d2.y-d0.y)*(s1.y-s0.y))/det;const d=((s1.x-s0.x)*(d2.y-d0.y)-(s2.x-s0.x)*(d1.y-d0.y))/det;return [a,b,c,d,d0.x-a*s0.x-c*s0.y,d0.y-b*s0.x-d*s0.y];}


/** Project a shared mesh once. Canvas and WebGL use the exact same paper geometry. */
function paperMesh(config, progress, corner, columns=80, rows=8) {
  const points=[];
  for(let x=0;x<=columns;x++)for(let y=0;y<=rows;y++){
    const u=x/columns,v=y/rows;
    points.push({...paperPoint(u,v,progress,config.direction,config.aspect,corner),u,v});
  }
  const triangles=[];
  for(let x=0;x<columns;x++)for(let y=0;y<rows;y++){
    const a=x*(rows+1)+y,b=a+rows+1;
    triangles.push([points[a],points[b],points[b+1]],[points[a],points[b+1],points[a+1]]);
  }
  return triangles;
}

/** Render a continuously deforming, two-sided page with original-resolution GPU textures. */
class PaperRenderer {
  constructor(canvas) {
    this.canvas=canvas;this.textures=[];
    const gl=this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
    if(!gl)throw Error('WebGL unavailable');
    const vertex=`
      attribute vec2 texcoord;
      uniform vec2 scale;
      uniform float spine, progress, corner, aspect;
      uniform mediump float direction;
      varying highp vec2 uv;
      varying highp float shade;
      vec3 profile(float distance,float fold,float radius){
        float angle=clamp((distance-fold)/radius,0.0,3.14159265359);
        return vec3(min(distance,fold)+radius*sin(angle)-max(0.0,distance-fold-3.14159265359*radius),radius*(1.0-cos(angle)),angle);
      }
      void main(){
        uv=texcoord;
        float lift=sin(3.14159265359*progress);
        float radius=.12+.12*lift;
        float fold=1.0-progress*(1.0+3.14159265359*radius)+.22*lift*corner*(uv.y-.5);
        vec3 anchor=profile(0.0,fold,radius),p=profile(uv.x,fold,radius);
        float z=max(0.0,p.y-anchor.y),perspective=6.0/(6.0-z);
        float x=direction*(p.x-anchor.x)*perspective,y=(uv.y-.5)/aspect*perspective;
        shade=.22*sin(p.z)*sin(p.z);
        gl_Position=vec4((x+spine)*scale.x,y*scale.y,-z/6.0,1.0);
      }`;

    const fragment=`precision mediump float;uniform sampler2D frontTex;uniform sampler2D backTex;uniform float direction;uniform float bleed;varying highp vec2 uv;varying highp float shade;void main(){bool front=direction>0.0?gl_FrontFacing:!gl_FrontFacing;vec2 f=vec2(direction>0.0?uv.x:1.0-uv.x,uv.y);vec2 b=vec2(1.0-f.x,uv.y);vec4 color=front?texture2D(frontTex,f):texture2D(backTex,b);if(!front&&bleed>0.0)color.rgb*=mix(vec3(1.0),texture2D(frontTex,f).rgb,bleed);gl_FragColor=vec4(color.rgb*(1.0-shade),1.0);}`;
    const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    // Upload immutable UV topology once. The vertex shader bends the sheet each frame.
    const uv=gl.getAttribLocation(this.program,'texcoord');
    const mesh=paperMesh({direction:1,aspect:1},0,0);
    const vertices=new Float32Array(mesh.length*6);let index=0;
    for(const triangle of mesh)for(const p of triangle){vertices[index++]=p.u;vertices[index++]=p.v;}
    this.vertexCount=mesh.length*3;gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,8,0);
    this.uniforms={};for(const key of ['scale','spine','direction','bleed','frontTex','backTex','progress','corner','aspect'])this.uniforms[key]=gl.getUniformLocation(this.program,key);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  }
  /** Upload an original page, downscaling only when the GPU's size limit requires it. */
  texture(image,unit){
    const gl=this.gl,texture=gl.createTexture();this.textures.push(texture);
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);let source=image;
    if(image.width>limit||image.height>limit){source=document.createElement('canvas');const factor=Math.min(limit/image.width,limit/image.height);source.width=Math.round(image.width*factor);source.height=Math.round(image.height*factor);source.getContext('2d').drawImage(image,0,0,source.width,source.height);}
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.uniforms[unit?'backTex':'frontTex'],unit);
  }
  /** Prepare exactly the two sides of the moving sheet. */
  prepare(front,back,config){this.clear();this.config=config;this.texture(front,0);this.texture(back,1);const dpr=Math.min(window.devicePixelRatio||1,3);this.canvas.width=Math.round(config.canvasWidth*dpr);this.canvas.height=Math.round(config.canvasHeight*dpr);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);}
  /** Animate by changing uniforms; geometry and full-resolution textures stay on the GPU. */
  draw(progress,corner=0){
    const gl=this.gl,c=this.config;
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(this.uniforms.scale,c.pageWidth*2/c.canvasWidth,c.pageWidth*2/c.canvasHeight);
    gl.uniform1f(this.uniforms.spine,c.spine||0);gl.uniform1f(this.uniforms.direction,c.direction);
    gl.uniform1f(this.uniforms.bleed,c.bleed?.08:0);gl.uniform1f(this.uniforms.progress,progress);
    gl.uniform1f(this.uniforms.corner,corner);gl.uniform1f(this.uniforms.aspect,c.aspect);
    gl.drawArrays(gl.TRIANGLES,0,this.vertexCount);
  }
  clear(){for(const texture of this.textures)this.gl.deleteTexture(texture);this.textures=[];this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT);}
  destroy(){this.clear();this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}
}

/** Offset triangle boundaries just enough to cover antialiasing seams. */
function clipTriangle(ctx,points,area){
  ctx.beginPath();points.forEach((p,i)=>{
    const prev=points[(i+2)%3],next=points[(i+1)%3],sign=area>0?1:-1;
    const l1=Math.hypot(p.x-prev.x,p.y-prev.y),l2=Math.hypot(next.x-p.x,next.y-p.y);
    const n1={x:sign*(p.y-prev.y)/l1,y:-sign*(p.x-prev.x)/l1},n2={x:sign*(next.y-p.y)/l2,y:-sign*(next.x-p.x)/l2};
    const amount=.8/Math.max(.00001,1+n1.x*n2.x+n1.y*n2.y);
    const x=p.x+(n1.x+n2.x)*amount,y=p.y+(n1.y+n2.y)*amount;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  });ctx.closePath();ctx.clip();
}

/** Draw a rolling curl from small, full-resolution tiles when GPU rendering is unavailable. */
class CanvasPaperRenderer {
  constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d');if(!this.context)throw Error('Canvas unavailable');}
  /** Prepare immutable source coordinates and small texture tiles once per turn. */
  prepare(front,back,config){
    this.clear();this.config=config;
    if(config.bleed){const reverse=document.createElement('canvas');reverse.width=back.width;reverse.height=back.height;const ctx=reverse.getContext('2d');ctx.drawImage(back,0,0);ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.08;ctx.translate(reverse.width,0);ctx.scale(-1,1);ctx.drawImage(front,0,0,reverse.width,reverse.height);back=reverse;}
    this.dpr=Math.min(window.devicePixelRatio||1,2);this.canvas.width=Math.round(config.canvasWidth*this.dpr);this.canvas.height=Math.round(config.canvasHeight*this.dpr);
    this.mesh=paperMesh(config,0,0,32,4);
    this.points=[...new Set(this.mesh.flat())];
    const padding=Math.min(64,Math.ceil(3*front.width/(config.pageWidth*this.dpr)));
    const makeTile=(texture,source)=>{
      const x=Math.max(0,Math.floor(Math.min(...source.map(p=>p.x))-padding));
      const y=Math.max(0,Math.floor(Math.min(...source.map(p=>p.y))-padding));
      const w=Math.min(texture.width,Math.ceil(Math.max(...source.map(p=>p.x))+padding))-x;
      const h=Math.min(texture.height,Math.ceil(Math.max(...source.map(p=>p.y))+padding))-y;
      const image=document.createElement('canvas');image.width=w;image.height=h;
      image.getContext('2d').drawImage(texture,x,y,w,h,0,0,w,h);
      return {image,x,y};
    };
    for(let i=0;i<this.mesh.length;i++){
      const tri=this.mesh[i];tri.sources=[front,back].map((texture,side)=>tri.map(p=>{let u=config.direction>0?p.u:1-p.u;if(side)u=1-u;return {x:u*texture.width,y:(1-p.v)*texture.height};}));
      // Each cell's two triangles share the same rectangular source tile.
      tri.tiles=i%2?this.mesh[i-1].tiles:[makeTile(front,tri.sources[0]),makeTile(back,tri.sources[1])];
    }
    this.ordered=[...this.mesh];
  }
  /** Update existing vertices and draw depth-sorted tiles without resampling a whole page per triangle. */
  draw(progress,corner=0){
    const c=this.config,ctx=this.context,dpr=this.dpr;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    for(const p of this.points){const q=paperPoint(p.u,p.v,progress,c.direction,c.aspect,corner);p.x=((q.x+(c.spine||0))*c.pageWidth+c.canvasWidth/2)*dpr;p.y=(c.canvasHeight/2-q.y*c.pageWidth)*dpr;p.z=q.z;p.shade=Math.sin(q.angle)**2;}
    for(const tri of this.mesh)tri.depth=tri[0].z+tri[1].z+tri[2].z;
    this.ordered.sort((a,b)=>a.depth-b.depth);
    for(const tri of this.ordered){
      const [a,b,e]=tri,area=(b.x-a.x)*(e.y-a.y)-(b.y-a.y)*(e.x-a.x);if(Math.abs(area)<.001)continue;
      const side=(c.direction>0?area<0:area>0)?0:1;
      const matrix=triangleTransform(tri.sources[side],tri);if(!matrix)continue;
      const tile=tri.tiles[side];
      ctx.save();clipTriangle(ctx,tri,area);ctx.setTransform(...matrix);ctx.drawImage(tile.image,tile.x,tile.y);
      const shade=(a.shade+b.shade+e.shade)/3*.22;
      if(shade>.001){ctx.fillStyle=`rgba(20,17,12,${shade})`;ctx.fillRect(tile.x,tile.y,tile.image.width,tile.image.height);}
      ctx.restore();
    }
  }
  /** Release the current sheet's tiles; the viewer retains its bounded original-image cache. */
  clear(){this.context.setTransform(1,0,0,1,0,0);this.context.clearRect(0,0,this.canvas.width,this.canvas.height);if(this.mesh)for(let i=0;i<this.mesh.length;i+=2)for(const t of this.mesh[i].tiles||[]){t.image.width=0;t.image.height=0;}this.mesh=null;this.points=null;this.ordered=null;}
  destroy(){this.clear();}
}





const ICONS={single:'M6 3h12v18H6z',spread:'M3 4h18v16H3zM12 4v16',motion:'M3 8h5M2 12h6M3 16h5M11 5l10 7-10 7z',still:'M8 4v16M16 4v16',book:'M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5z',first:'M5 5v14M18 5l-7 7 7 7',previous:'m15 5-7 7 7 7',next:'m9 5 7 7-7 7',last:'M19 5v14M6 5l7 7-7 7',minus:'M5 12h14',plus:'M5 12h14M12 5v14',grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',play:'m8 4 12 8-12 8z',pause:'M8 4v16M16 4v16',close:'m6 6 12 12M6 18 18 6',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4v.2'};
/** Build a consistent, accessible interface icon. */
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]||ICONS.book}"/></svg>`;
/** Bound full-resolution decoded image retention independently of thumbnail DOM. */
class ImageCache{
  constructor(manifest){this.manifest=manifest;this.items=new Map();this.originals=new Map();this.destroyed=false;}
  /** Decode each source once even when it supplies two physical pages. */
  original(url){
    if(this.originals.has(url))return this.originals.get(url);
    const promise=new Promise(resolve=>{
      const image=new Image();if(/^https?:/.test(url))image.crossOrigin='anonymous';
      const finish=value=>{clearTimeout(timer);image.onload=image.onerror=null;resolve(value);};
      const timer=setTimeout(()=>finish(null),15000);image.onload=()=>finish(image);image.onerror=()=>finish(null);image.src=url;
    });this.originals.set(url,promise);return promise;
  }
  /** Fit artwork to the paper once, using full-resolution crops for two-page source images. */
  get(page,retry=false){
    const spec=this.manifest.pages[page-1];
    if(retry){this.items.delete(page);this.originals.delete(spec.image);}
    if(this.items.has(page))return this.items.get(page);
    const promise=(async()=>{
      const image=spec.blank?null:await this.original(spec.image);
      if(image)return {image:pageSurface(image,spec,this.manifest.pageWidth/this.manifest.pageHeight),failed:false};
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=Math.round(900*this.manifest.pageHeight/this.manifest.pageWidth);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      if(!spec.blank){ctx.fillStyle='#595b55';ctx.textAlign='center';ctx.font='26px sans-serif';ctx.fillText(`Page ${page}`,450,canvas.height/2-30);ctx.font='20px sans-serif';ctx.fillText('Image unavailable',450,canvas.height/2+10);}
      return {image:canvas,failed:!spec.blank};
    })();this.items.set(page,promise);return promise;
  }
  /** Bound both fitted page surfaces and decoded originals to nearby physical pages. */
  preload(page,distance=4){const keep=new Set(),urls=new Set();for(let p=Math.max(1,page-distance);p<=Math.min(this.manifest.pageCount,page+distance);p++){keep.add(p);urls.add(this.manifest.pages[p-1].image);this.get(p);}for(const key of this.items.keys())if(!keep.has(key))this.items.delete(key);for(const key of this.originals.keys())if(!urls.has(key))this.originals.delete(key);}
  destroy(){this.destroyed=true;this.items.clear();this.originals.clear();}
}
/** Create a self-contained, framework-independent magazine viewer. */
function createMagazineViewer(element,options={}){return new MagazineViewer(element,options);}
class MagazineViewer{
  /** Construct controls immediately; ready resolves after the manifest and opening pages load. */
  constructor(element,options={}){if(!(element instanceof HTMLElement))throw new TypeError('Pass an HTML element to createMagazineViewer.');this.root=element;this.original={class:element.getAttribute('class'),style:element.getAttribute('style'),label:element.getAttribute('aria-label')};this.options={manifestUrl:'./manifest.json',showHeader:false,initialPage:1,spreadMode:'auto',minSpreadPageWidth:250,showToolbar:true,showThumbnails:false,enableFullscreen:true,enableAutoFlip:true,animatePageTurns:true,autoFlipIntervalMs:5000,maxZoom:3,pageTurnDurationMs:450,navigationTurnDurationMs:1000,pageTurnThreshold:.4,preloadDistance:4,showPageThickness:true,showBacksideBleed:true,globalArrowKeys:false,...options};this.state={pageIndex:1,mode:'spread',turnState:'idle',turnDirection:null,turnProgress:0,zoomMode:'fit',zoom:1,panX:0,panY:0,thumbnailsOpen:!!this.options.showThumbnails,searchOpen:false,fullscreen:false,autoFlip:false};this.openFoldouts=new Set();this.foldoutBusy=false;this.listeners=new Map();this.abort=new AbortController();this.fetchAbort=new AbortController();this.pointers=new Map();this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.renderToken=0;this.root.classList.add('ff-viewer');this.root.setAttribute('aria-label','Magazine reader');if(options.background)this.root.style.background=options.background;this.createUI();this.bind();this.ready=this.load();this.ready.catch(()=>{});}
  /** Mount the reader shell without inserting untrusted manifest HTML. */
  createUI(){const button=(action,label,glyph=action,extra='')=>`<button type="button" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(glyph)}</button>`;this.root.innerHTML=`<header class="ff-header"><div class="ff-brand"><span class="ff-mark">${icon('book')}</span><strong>Flippy Flapper</strong></div><div class="ff-document"><span class="ff-title">Loading magazine</span><span class="ff-edition">THE READING ROOM</span></div>${button('help','Keyboard shortcuts','help','class="ff-help-button"')}</header><div class="ff-stage"><div class="ff-hint">DRAG A CORNER. TURN THE PAGE.</div><div class="ff-viewport" tabindex="0" aria-label="Magazine pages. Use left and right arrow keys to turn."><div class="ff-book"><div class="ff-thickness ff-thickness-left"></div><div class="ff-thickness ff-thickness-right"></div><div class="ff-page-stack"></div><div class="ff-gutter"></div><div class="ff-cast"></div><canvas class="ff-paper" aria-hidden="true"></canvas><div class="ff-fallback" aria-hidden="true"></div></div></div>${button('previous','Previous page','previous','class="ff-edge ff-edge-left"')}${button('next','Next page','next','class="ff-edge ff-edge-right"')}<div class="ff-status" role="status"><span class="ff-spinner"></span>Opening your magazine…</div><div class="ff-page-caption" aria-hidden="true"></div></div><footer class="ff-footer"><div class="ff-toolbar" role="toolbar" aria-label="Reader controls"><div class="ff-tools">${button('thumbnails','Show thumbnails','grid','aria-expanded="false"')}</div><span class="ff-divider"></span><div class="ff-navigation">${button('first','First page')}${button('previous','Previous page')}<form class="ff-location"><input aria-label="Go to page" inputmode="numeric" autocomplete="off" value="1"><span class="ff-page-total">/ 0</span></form>${button('next','Next page')}${button('last','Last page')}</div><span class="ff-divider"></span><div class="ff-zoom">${button('zoomOut','Zoom out','minus')}<button type="button" data-action="fit" class="ff-fit" title="Reset to fit (0)">Fit</button>${button('zoomIn','Zoom in','plus')}</div><span class="ff-divider ff-optional-divider"></span><div class="ff-tools">${button('readingMode','Show single page','spread','aria-pressed="true"')}${button('animation','Disable page-turn animation','motion','aria-pressed="true"')}${button('autoflip','Start auto flip','play','aria-pressed="false"')}${button('fullscreen','Enter fullscreen','expand','aria-pressed="false"')}</div></div><div class="ff-footer-note"><span class="ff-mode">Facing pages</span><span class="ff-footer-dot">·</span><span>Made for taking your time.</span></div></footer><section class="ff-tray" aria-label="Page thumbnails" hidden><div class="ff-tray-head"><span>Contents <small class="ff-tray-count"></small></span>${button('closeThumbnails','Close thumbnails','close')}</div><div class="ff-thumbnails"></div></section><dialog class="ff-help"><div class="ff-dialog-title"><h2>Make yourself at home.</h2>${button('closeHelp','Close shortcuts','close')}</div><p>Drag the outer edge to turn a page. Zoom in to look closer, then drag to move around.</p><dl><dt>Previous / next</dt><dd>← / →</dd><dt>First / last page</dt><dd>Home / End</dd><dt>Zoom in / out</dt><dd>+ / −</dd><dt>Fit to screen</dt><dd>0</dd><dt>Thumbnails</dt><dd>T</dd><dt>Fullscreen</dt><dd>F</dd><dt>Next page</dt><dd>Space</dd><dt>Close panels / reset zoom</dt><dd>Esc</dd></dl></dialog><div class="ff-announcement" aria-live="polite" aria-atomic="true"></div>`;this.$=s=>this.root.querySelector(s);this.book=this.$('.ff-book');this.viewport=this.$('.ff-viewport');this.stack=this.$('.ff-page-stack');this.canvas=this.$('.ff-paper');this.cast=this.$('.ff-cast');this.status=this.$('.ff-status');this.input=this.$('.ff-location input');this.fallback=this.$('.ff-fallback');this.canvas.hidden=true;this.fallback.hidden=true;this.$('.ff-header').hidden=!this.options.showHeader;this.$('.ff-footer').hidden=!this.options.showToolbar;this.$('[data-action=fullscreen]').hidden=!this.options.enableFullscreen||!document.fullscreenEnabled;this.$('[data-action=autoflip]').hidden=!this.options.enableAutoFlip;try{this.renderer=new PaperRenderer(this.canvas);this.book.dataset.renderer='webgl';}catch(error){try{this.useCanvasRenderer();}catch{this.renderer=null;this.book.dataset.renderer='css';}}this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.cancelTurn();try{this.useCanvasRenderer();}catch{this.renderer=null;}},{signal:this.abort.signal});}
  /** Attach scoped controls and pointer handlers; all listeners are removable. */
  bind(){const on=(target,event,handler,extra={})=>target.addEventListener(event,handler,{signal:this.abort.signal,...extra});on(this.root,'click',e=>{const target=e.target.closest('[data-action]');if(!target||target.disabled)return;const a=target.dataset.action;if(a==='help'){this.stopAutoFlip();this.$('.ff-help').showModal();}else if(a==='closeHelp')this.$('.ff-help').close();else if(a==='thumbnails')this.state.thumbnailsOpen?this.closeThumbnails():this.openThumbnails();else if(a==='fullscreen')this.state.fullscreen?this.exitFullscreen():this.enterFullscreen();else if(a==='readingMode')this.setSpreadMode(this.state.mode==='single'?'always':'never');else if(a==='animation')this.setPageTurnAnimation(!this.options.animatePageTurns);else if(a==='autoflip')this.state.autoFlip?this.stopAutoFlip():this.startAutoFlip();else this[a]?.();});on(this.$('.ff-help'),'click',e=>{if(e.target===this.$('.ff-help'))this.$('.ff-help').close();});on(this.$('.ff-location'),'submit',e=>{e.preventDefault();if(!/^\d+$/.test(this.input.value.trim())){this.announce('Enter a whole page number.');this.updateControls();return;}this.goToPage(Number(this.input.value));this.viewport.focus({preventScroll:true});});on(this.input,'focus',()=>{this.stopAutoFlip();this.input.value=String(this.state.pageIndex);this.input.select();});on(this.input,'blur',()=>this.updateControls());on(this.root,'keydown',e=>this.keyboard(e));if(this.options.globalArrowKeys)on(document,'keydown',e=>{if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!e.target.closest('.ff-viewer'))this.keyboard(e);});on(this.viewport,'pointerdown',e=>this.pointerDown(e));on(this.viewport,'pointermove',e=>this.pointerMove(e));on(document,'pointerup',e=>this.pointerUp(e));on(document,'pointercancel',e=>this.pointerUp(e,true));on(this.viewport,'dragstart',e=>e.preventDefault());on(window,'blur',()=>this.cancelTurn());on(this.viewport,'lostpointercapture',e=>{if(this.pointers.has(e.pointerId))this.pointerUp(e,true);});on(this.viewport,'wheel',e=>{if(e.ctrlKey){e.preventDefault();this.stopAutoFlip();this.setZoom(this.state.zoom-e.deltaY*.006);}else if(this.state.zoom>1){e.preventDefault();this.stopAutoFlip();this.state.panX-=e.deltaX;this.state.panY-=e.deltaY;this.boundPan();this.transform();}},{passive:false});on(document,'fullscreenchange',()=>{this.state.fullscreen=document.fullscreenElement===this.root;this.emit('fullscreenchange');this.resize();this.updateControls();});on(document,'visibilitychange',()=>{if(document.hidden){this.clearAutoTimer();this.cancelTurn();}else if(this.state.autoFlip)this.scheduleAuto();});on(this.root,'pointermove',()=>this.wake());on(this.root,'focusin',()=>this.wake());on(this.reduced,'change',()=>this.cancelTurn());this.observer=new ResizeObserver(()=>{clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>this.resize(),70);});this.observer.observe(this.viewport);this.wake();}
  /** Fetch and validate the manifest before exposing ready controls. */
  async load(){try{const url=new URL(this.options.manifest?this.options.baseUrl||document.baseURI:this.options.manifestUrl,document.baseURI);let manifest=this.options.manifest;if(!manifest){const response=await fetch(url,{signal:this.fetchAbort.signal});if(!response.ok)throw Error(`Magazine could not be loaded (${response.status}).`);manifest=await response.json();}this.manifest=expandPages(validateManifest(manifest,url));this.cache=new ImageCache(this.manifest);this.state.pageIndex=clampPage(this.options.initialPage,this.manifest.pageCount);if(this.options.initialSourceIndex)this.state.pageIndex=this.manifest.pages.find(p=>p.sourceIndex===this.options.initialSourceIndex)?.index||this.state.pageIndex;this.$('.ff-title').textContent=this.manifest.title;this.$('.ff-edition').textContent=this.manifest.subtitle||'THE READING ROOM';this.$('.ff-tray-count').textContent=`${this.manifest.pageCount} pages`;this.resize();await this.renderPages();if(this.destroyed)return;this.status.classList.remove('ff-error');this.status.hidden=true;this.loaded=true;this.updateControls();if(this.state.thumbnailsOpen)this.openThumbnails();this.cache.preload(this.state.pageIndex,this.options.preloadDistance);return this;}catch(error){if(this.destroyed)return;this.status.replaceChildren();const message=document.createElement('span');message.textContent=error.message;const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>{this.status.textContent='Opening your magazine…';this.ready=this.load();this.ready.catch(()=>{});};this.status.append(message,retry);this.status.classList.add('ff-error');this.announce(error.message);throw error;}}
  /** Resize once per burst and preserve the focused logical page. */
  resize(){if(!this.manifest||this.destroyed)return;this.cancelFoldoutTransition();this.cancelTurn(!!this.pinch);const r=this.viewport.getBoundingClientRect();this.viewportSize={width:r.width,height:r.height};const fitted=fitBook(r.width-(r.width<700?48:96),Math.min(r.height-42,(r.height-8)/1.09),this.manifest.pageWidth/this.manifest.pageHeight,this.options);const modeChanged=this.state.mode!==fitted.mode;Object.assign(this.state,{mode:fitted.mode});this.openFoldouts=new Set([...this.openFoldouts].filter(p=>this.group().includes(p)));this.pageWidth=fitted.pageWidth;this.pageHeight=fitted.pageHeight;this.book.style.width=`${this.pageWidth*(this.state.mode==='spread'?2:1)}px`;this.book.style.height=`${this.pageHeight}px`;this.book.classList.toggle('ff-single',this.state.mode==='single');this.book.style.setProperty('--page-width',`${this.pageWidth}px`);this.canvas.style.width=`${this.pageWidth*3}px`;this.canvas.style.height=`${this.pageHeight*1.5}px`;this.canvas.style.left=`${-this.pageWidth*(this.state.mode==='single'?1:.5)}px`;this.canvas.style.top=`${-this.pageHeight*.25}px`;this.boundPan();this.transform();this.renderPages();this.updateControls();if(modeChanged)this.renderThumbnails();}
  /** Choose automatic, facing-page, or single-page layout without losing the current page. */
  setSpreadMode(mode){if(!['auto','always','never'].includes(mode))throw new TypeError('Use auto, always, or never.');this.options.spreadMode=mode;this.resize();}
  /** Get the currently visible one-based page numbers. */
  group(page=this.state.pageIndex){return groupFor(page,this.manifest.pageCount,this.state.mode);}
  /** Center solitary covers and the complete interior spread. */
  offset(group=this.group()){return this.state.mode==='single'||group.length===2?0:group[0]===1?-this.pageWidth/2:this.pageWidth/2;}
  /** Determine extension widths and the scale needed to show an open gatefold. */
  foldoutMetrics(){
    let left=0,right=0;for(const page of this.openFoldouts){if(page%2===0)left++;else right++;}
    const span=this.group().length+left+right;
    const scale=left+right?Math.min(1,Math.max(1,this.viewportSize.width-48)/(span*this.pageWidth)):1;
    return {left,right,scale};
  }
  /** Center the visible paper, including an unfolded wing, with a single book transform. */
  transform(offset){if(!this.manifest)return;const m=this.foldoutMetrics(),zoom=this.state.zoom*m.scale;this.book.style.transform=`translate(-50%, -50%) translate3d(${this.state.panX+((offset??this.offset())+(m.left-m.right)*this.pageWidth/2)*zoom}px,${this.state.panY}px,0) scale(${zoom})`;}
  /** Keep all visible panels reachable when zooming a fold-out. */
  boundPan(){if(!this.viewportSize)return;const m=this.foldoutMetrics(),width=this.pageWidth*(this.group().length+m.left+m.right)*this.state.zoom*m.scale,height=this.pageHeight*this.state.zoom*m.scale;const x=Math.max(0,(width-this.viewportSize.width)/2+48),y=Math.max(0,(height-this.viewportSize.height)/2+48);this.state.panX=Math.max(-x,Math.min(x,this.state.panX));this.state.panY=Math.max(-y,Math.min(y,this.state.panY));}
  /** Create a clipped paper panel; wide source art remains continuous across adjoining panels. */
  artwork(page,crop=page.crop){
    const panel=document.createElement('div');panel.className='ff-art-panel';
    if(page.blank){panel.setAttribute('aria-label','Blank page');return panel;}
    const sheet=document.createElement('div');sheet.className='ff-art-sheet';sheet.style.width=`${page.sheetWidth*100}%`;sheet.style.left=`${-crop*100}%`;
    const image=document.createElement('img');image.src=page.image;image.alt=`${this.manifest.title}, page ${page.index}`;image.draggable=false;sheet.append(image);panel.append(sheet);return panel;
  }
  /** Make normal paper, a spread half, or a hinged two-panel fold-out. */
  async pageElement(page,side){
    const node=document.createElement('div');node.className=`ff-page ff-page-${side}`;node.dataset.page=page;
    const spec=this.manifest.pages[page-1],data=await this.cache.get(page);if(this.destroyed)return node;
    node.append(this.artwork(spec));
    if(spec.layout==='foldout'&&!data.failed){
      node.classList.add('ff-foldout',page%2===0?'ff-foldout-left':'ff-foldout-right');node.classList.toggle('ff-foldout-open',this.openFoldouts.has(page));
      const flap=document.createElement('div');flap.className='ff-flap';
      const front=this.artwork(spec,1-spec.crop),back=this.artwork(spec);front.classList.add('ff-flap-front');back.classList.add('ff-flap-back');back.setAttribute('aria-hidden','true');
      flap.append(front,back);node.append(flap);
      const toggle=document.createElement('button');toggle.type='button';toggle.className='ff-foldout-toggle';toggle.dataset.foldout=page;
      toggle.onclick=e=>{e.stopPropagation();this.openFoldouts.has(page)?this.closeFoldout(page):this.openFoldout(page);};node.append(toggle);this.updateFoldoutButton(toggle,page);
    }
    if(data.failed){
      node.replaceChildren();const placeholder=document.createElement('canvas');placeholder.width=data.image.width;placeholder.height=data.image.height;placeholder.getContext('2d').drawImage(data.image,0,0);node.append(placeholder);
      const button=document.createElement('button');button.type='button';button.className='ff-retry';button.textContent=`Retry page ${page}`;button.onclick=async e=>{e.stopPropagation();button.disabled=true;await this.cache.get(page,true);if(!this.turn)this.renderPages();};node.append(button);
    }
    return node;
  }
  /** Keep the gatefold's accessible control synchronized with its panel. */
  updateFoldoutButton(button,page){const open=this.openFoldouts.has(page);button.textContent=open?'Close fold-out':'Open fold-out';button.setAttribute('aria-label',`${open?'Close':'Open'} fold-out page ${page}`);button.setAttribute('aria-expanded',String(open));button.disabled=!!this.turn||this.foldoutBusy;}
  /** End an interrupted fold-out transition without leaving navigation locked. */
  cancelFoldoutTransition(){clearTimeout(this.foldoutTimer);this.foldoutResolve?.();this.foldoutResolve=null;this.foldoutBusy=false;this.book?.classList.remove('ff-foldout-adjusting');}
  /** Animate the outer hinge and fit all expanded panels before allowing another action. */
  async changeFoldouts(pages,open){
    if(!this.loaded||this.turn||this.foldoutBusy||this.destroyed)return false;
    const targets=pages.filter(p=>this.group().includes(p)&&this.manifest.pages[p-1]?.layout==='foldout'&&this.openFoldouts.has(p)!==open);if(!targets.length)return false;
    this.stopAutoFlip();this.fit();this.foldoutBusy=true;this.book.classList.add('ff-foldout-adjusting');
    for(const page of targets){open?this.openFoldouts.add(page):this.openFoldouts.delete(page);this.stack.querySelector(`[data-page="${page}"]`)?.classList.toggle('ff-foldout-open',open);}
    this.transform();this.updateControls();
    await new Promise(resolve=>{this.foldoutResolve=resolve;this.foldoutTimer=setTimeout(resolve,this.reduced.matches?110:700);});
    this.foldoutResolve=null;this.foldoutBusy=false;this.book.classList.remove('ff-foldout-adjusting');if(this.destroyed)return false;
    this.updateControls();this.emit('foldoutchange');this.announce(open?'Fold-out opened.':'Fold-out closed.');return true;
  }
  /** Open a visible fold-out; defaults to the first closed fold-out in this spread. */
  openFoldout(page){if(page==null&&this.manifest)page=this.group().find(p=>this.manifest.pages[p-1].layout==='foldout'&&!this.openFoldouts.has(p));return this.changeFoldouts([page],true);}
  /** Close one fold-out, or every open fold-out when no page is supplied. */
  closeFoldout(page){return this.changeFoldouts(page==null?[...this.openFoldouts]:[page],false);}
  /** Replace only the active and revealed pages, never the full magazine DOM. */
  async renderPages(group=this.group(),turn=null){const token=++this.renderToken;const entries=[];if(this.state.mode==='single'){entries.push([turn?turn.target[0]:group[0],'single']);}else{let left=group.length===2?group[0]:group[0]===1?null:group[0],right=group.length===2?group[1]:group[0]===1?1:null;if(turn){if(turn.direction===1)right=turn.target.length===2?turn.target[1]:null;else left=turn.target.length===2?turn.target[0]:null;}if(left)entries.push([left,'left']);if(right)entries.push([right,'right']);}if(!turn){this.stack.replaceChildren(...entries.map(([page,side])=>{const paper=document.createElement('div');paper.className=`ff-page ff-page-${side}`;paper.setAttribute('aria-label',`Loading page ${page}`);return paper;}));}const nodes=await Promise.all(entries.map(([p,s])=>this.pageElement(p,s)));if(this.destroyed||token!==this.renderToken)return;this.stack.replaceChildren(...nodes);const open=this.state.mode==='spread'&&(group.length===2||turn);this.$('.ff-gutter').hidden=!open;const t=thickness(this.state.pageIndex,this.manifest.pageCount);for(const side of ['left','right']){const node=this.$(`.ff-thickness-${side}`);node.hidden=!this.options.showPageThickness||this.state.mode==='single'||!entries.some(([,pageSide])=>pageSide===side);node.style.width=`${Math.max(1,t[side])}px`;node.style[side]=`${-t[side]}px`;}this.book.classList.add('ff-book-ready');this.book.classList.toggle('ff-foldouts',nodes.some(n=>n.classList.contains('ff-foldout')));}
  /** Replace a failed GPU surface with a fresh canvas so its context type cannot stay locked. */
  useCanvasRenderer(){
    this.renderer?.destroy();
    const canvas=this.canvas.cloneNode(false);
    this.canvas.replaceWith(canvas);this.canvas=canvas;
    this.renderer=new CanvasPaperRenderer(canvas);this.book.dataset.renderer='canvas';
  }
  /** Switch page-turn animation without interrupting zoom or changing the reading position. */
  setPageTurnAnimation(enabled){
    if(typeof enabled!=='boolean')throw new TypeError('Use true or false for page-turn animation.');
    this.options.animatePageTurns=enabled;
    if(!enabled)this.cancelTurn();
    this.updateControls();
  }
  /** Begin one curved sheet in either layout, rejecting overlapping turns. */
  begin(direction,drag=false){
    if(!this.options.animatePageTurns||!this.loaded||this.turn||this.foldoutBusy||this.openFoldouts.size||this.destroyed)return null;
    const target=adjacent(this.state.pageIndex,this.manifest.pageCount,this.state.mode,direction);
    if(!target)return null;
    const from=this.group(),single=this.state.mode==='single';
    const frontPage=single?from[0]:direction===1?from.at(-1):from[0];
    const backPage=single?target[0]:direction===1?target[0]:target.at(-1);
    const turn={direction,target,from,progress:0,corner:-.7,drag,single,frontPage,backPage};
    this.turn=turn;this.state.turnState='loading';this.state.turnDirection=direction===1?'forward':'backward';this.updateControls();
    turn.ready=(async()=>{
      const [front,back]=await Promise.all([this.cache.get(frontPage),this.cache.get(backPage)]);
      if(this.turn!==turn||this.destroyed)return false;
      await this.renderPages(from,turn);if(this.turn!==turn)return false;
      turn.simple=this.reduced.matches||!this.renderer;
      const config={direction,aspect:this.manifest.pageWidth/this.manifest.pageHeight,pageWidth:this.pageWidth,canvasWidth:this.pageWidth*3,canvasHeight:this.pageHeight*1.5,spine:single?-.5*direction:0,bleed:this.options.showBacksideBleed};
      if(!turn.simple){
        try{this.renderer.prepare(front.image,back.image,config);}
        catch{try{this.useCanvasRenderer();this.renderer.prepare(front.image,back.image,config);}catch{turn.simple=true;}}
      }
      this.canvas.hidden=turn.simple;this.fallback.hidden=!turn.simple;
      if(turn.simple){
        const img=document.createElement('img');img.draggable=false;img.src=front.image instanceof HTMLCanvasElement?front.image.toDataURL():front.image.src;
        this.fallback.replaceChildren(img);this.fallback.style.width=`${this.pageWidth}px`;this.fallback.style.left=single?'0':direction===1?`${this.pageWidth}px`:'0';
      }
      this.state.turnState=drag?'dragging':'completing';this.book.classList.add('ff-turning');this.emit('turnstart');this.draw(turn.progress);return true;
    })();return turn;
  }
  /** Update the mesh, local fold shading, destination shadow and book centering together. */
  draw(progress){const t=this.turn;if(!t)return;t.progress=Math.max(0,Math.min(1,progress));this.state.turnProgress=t.progress;if(this.state.turnState==='loading')return;const p=t.progress,s=Math.sin(Math.PI*p);if(t.simple){this.fallback.style.transform=this.reduced.matches?`translateX(${-t.direction*p*18}px)`:`translateX(${-t.direction*p*this.pageWidth}px)`;if(this.reduced.matches)this.fallback.style.opacity=String(1-p);}else this.renderer.draw(p,t.corner);const edge=paperPoint(1,.5,p,t.direction,this.manifest.pageWidth/this.manifest.pageHeight,t.corner).x*this.pageWidth;this.cast.style.opacity=String(s*.26);this.cast.style.width=`${22+s*90}px`;this.cast.style.transform=`translateX(${edge-(22+s*90)/2}px)`;this.cast.style.left=this.state.mode==='single'?(t.direction===1?'0':`${this.pageWidth}px`):`${this.pageWidth}px`;this.$('.ff-gutter').style.opacity=String(.48+s*.38);this.transform(this.offset(t.from)+(this.offset(t.target)-this.offset(t.from))*p);}
  /** Settle with easing; update page indexes only when a committed turn finishes. */
  async settle(commit){const t=this.turn;if(!t||t.settling)return;t.settling=true;const ready=await t.ready;if(!ready||this.turn!==t)return;this.state.turnState=commit?'completing':'canceling';const start=t.progress,end=commit?1:0,duration=this.reduced.matches?110:Math.max(160,(t.drag?this.options.pageTurnDurationMs:this.options.navigationTurnDurationMs)*Math.abs(end-start));const startTime=performance.now();await new Promise(resolve=>{this.animationResolve=resolve;const frame=now=>{if(this.turn!==t){resolve();return;}const elapsed=Math.min(1,(now-startTime)/duration);const eased=t.drag?1-Math.pow(1-elapsed,3):elapsed*elapsed*(3-2*elapsed);this.draw(start+(end-start)*eased);if(elapsed<1)this.animation=requestAnimationFrame(frame);else resolve();};this.animation=requestAnimationFrame(frame);});this.animationResolve=null;if(this.turn!==t)return;if(commit)this.state.pageIndex=t.direction===1?t.target[0]:t.target.at(-1);await this.renderPages();if(this.turn!==t||this.destroyed)return;this.turn=null;Object.assign(this.state,{turnState:'idle',turnDirection:null,turnProgress:0});this.cleanupTurn();this.transform();this.updateControls();this.cache.preload(this.state.pageIndex,this.options.preloadDistance);if(commit){this.emit('pagechange');this.announce(`Page ${this.group().join(' and ')} of ${this.manifest.pageCount}`);this.selectThumbnail();}this.emit('turnend',{committed:commit});if(!adjacent(this.state.pageIndex,this.manifest.pageCount,this.state.mode,1))this.stopAutoFlip();}
  /** Remove transient turning layers without changing the committed location. */
  cleanupTurn(preservePointers=false){if(!preservePointers)this.resetPointers();this.canvas.hidden=true;this.fallback.hidden=true;this.fallback.style.opacity='1';this.fallback.replaceChildren();this.cast.style.opacity='0';this.book.classList.remove('ff-turning');this.renderer?.clear();}
  /** Cancel an interrupted turn during resize, pinch or teardown. */
  cancelTurn(preservePointers=false){if(!preservePointers)this.resetPointers();if(!this.turn)return;this.turn=null;cancelAnimationFrame(this.animation);this.animationResolve?.();this.animationResolve=null;Object.assign(this.state,{turnState:'idle',turnDirection:null,turnProgress:0});this.cleanupTurn(preservePointers);this.renderPages();this.transform();this.updateControls();}
  /** Navigate one sheet; manual actions pause autoplay. */
  async navigate(direction,automatic=false){
    if(!this.loaded||this.destroyed||this.turn||this.foldoutBusy)return;
    if(this.openFoldouts.size)await this.closeFoldout();
    if(this.destroyed)return;
    if(!automatic)this.stopAutoFlip();
    if(this.state.zoom>1)this.fit();
    if(!this.options.animatePageTurns){
      const target=adjacent(this.state.pageIndex,this.manifest.pageCount,this.state.mode,direction);
      if(target){
        const wasAuto=this.state.autoFlip;
        this.goToPage(direction===1?target[0]:target.at(-1));
        if(automatic&&wasAuto&&adjacent(this.state.pageIndex,this.manifest.pageCount,this.state.mode,1)){this.state.autoFlip=true;this.updateControls();}
      }
      return;
    }
    if(this.begin(direction))return this.settle(true);
  }
  next(){return this.navigate(1);}
  previous(){return this.navigate(-1);}
  first(){this.goToPage(1);}
  last(){if(this.manifest)this.goToPage(this.manifest.pageCount);}
  /** Jump directly without animating all intervening sheets. */
  goToPage(page){this.stopAutoFlip();if(!this.loaded||this.turn||this.foldoutBusy)return;this.openFoldouts.clear();this.state.pageIndex=clampPage(page,this.manifest.pageCount);this.fit();this.renderPages();this.updateControls();this.selectThumbnail();this.cache.preload(this.state.pageIndex,this.options.preloadDistance);this.emit('pagechange');this.announce(`Page ${this.group().join(' and ')}`);}
  /** Release capture and gesture state before the next mouse interaction. */
  releasePointer(id){try{if(this.viewport.hasPointerCapture(id))this.viewport.releasePointerCapture(id);}catch{/* The browser may already have released an interrupted pointer. */}}
  resetPointers(){const ids=[...this.pointers.keys()];this.pointers.clear();this.gesture=null;this.pinch=null;cancelAnimationFrame(this.dragFrame);for(const id of ids)this.releasePointer(id);}
  /** Track one gesture from cached bounds; only two touch contacts can pinch. */
  pointerDown(e){
    if(!this.loaded||this.destroyed||this.foldoutBusy||e.button!==0||e.target.closest('button,input,select,textarea,a'))return;
    e.preventDefault();
    if(this.openFoldouts.size){this.closeFoldout();return;}
    // A new mouse press cannot belong to an old contact or unfinished mouse drag.
    if(e.pointerType==='mouse'){if(this.gesture&&this.turn?.drag&&!this.turn.settling)this.cancelTurn();else this.resetPointers();}
    if(this.turn&&(!this.turn.drag||this.turn.settling||e.pointerType!=='touch'))return;
    const bounds=this.book.getBoundingClientRect(),local=e.clientX-bounds.left;
    if(local<0||local>bounds.width||e.clientY<bounds.top||e.clientY>bounds.bottom)return;
    this.stopAutoFlip();this.wake();this.viewport.focus({preventScroll:true});
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
    try{this.viewport.setPointerCapture(e.pointerId);}catch{/* Document release handlers still finish the gesture. */}
    if(this.pointers.size===2&&[...this.pointers.values()].every(p=>p.type==='touch')){
      this.cancelTurn(true);this.gesture=null;const points=[...this.pointers.values()];
      this.pinch={distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),zoom:this.state.zoom};return;
    }
    if(this.turn||this.pointers.size!==1)return;
    let direction=0;
    if(this.state.mode==='single'){if(local<bounds.width*.5)direction=-1;else direction=1;}
    else{const group=this.group();if(local<=this.pageWidth*.6*this.state.zoom&&group[0]!==1)direction=-1;else if(local>=bounds.width-this.pageWidth*.6*this.state.zoom&&adjacent(this.state.pageIndex,this.manifest.pageCount,this.state.mode,1))direction=1;}
    this.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastTime:performance.now(),velocity:0,panX:this.state.panX,panY:this.state.panY,direction,width:this.pageWidth*(this.state.mode==='spread'?2:1)*this.state.zoom,corner:(e.clientY-bounds.top)/bounds.height>.5?-1:1,moved:false};
  }
  /** Separate horizontal page drags from zoom panning and two-pointer pinch. */
  pointerMove(e){if(e.pointerType==='mouse'&&(e.buttons&1)===0){if(this.pointers.has(e.pointerId))this.pointerUp(e,true);return;}if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});if(this.pinch&&this.pointers.size===2){const points=[...this.pointers.values()];const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);this.setZoom(this.pinch.zoom*distance/Math.max(1,this.pinch.distance));return;}const g=this.gesture;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(this.state.zoom>1){this.state.panX=g.panX+dx;this.state.panY=g.panY+dy;this.boundPan();this.transform();return;}if(!g.moved){if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy))return;g.moved=true;if(!g.direction)return;const t=this.begin(g.direction,true);if(t){t.corner=g.corner;g.turn=t;}}if(!g.turn||this.turn!==g.turn||g.turn.settling)return;const now=performance.now();g.velocity=(g.lastX-e.clientX)*g.direction/Math.max(1,now-g.lastTime);g.lastX=e.clientX;g.lastTime=now;const progress=-dx*g.direction/g.width;this.turn.progress=Math.max(0,Math.min(1,progress));cancelAnimationFrame(this.dragFrame);this.dragFrame=requestAnimationFrame(()=>this.draw(progress));}
  /** Commit by distance or flick, or spring back after a canceled gesture. */
  pointerUp(e,canceled=false){this.pointers.delete(e.pointerId);this.releasePointer(e.pointerId);if(this.pinch){if(this.pointers.size<2)this.pinch=null;this.gesture=null;return;}const g=this.gesture;if(!g||g.id!==e.pointerId)return;this.gesture=null;cancelAnimationFrame(this.dragFrame);if(g.turn&&this.turn===g.turn&&!g.turn.settling){const velocity=performance.now()-g.lastTime<100?g.velocity:0;this.settle(!canceled&&shouldCommit(this.turn.progress,velocity,this.options.pageTurnThreshold));}}
  /** Set zoom relative to the fitted page dimensions. */
  setZoom(value){if(!this.loaded||this.turn||this.foldoutBusy)return;const max=Math.max(1,this.options.maxZoom);this.state.zoom=Math.max(1,Math.min(max,value));this.state.zoomMode=this.state.zoom===1?'fit':'manual';if(this.state.zoom===1){this.state.panX=0;this.state.panY=0;}this.boundPan();this.transform();this.updateControls();this.emit('zoomchange');}
  zoomIn(){this.stopAutoFlip();this.setZoom(this.state.zoom+.25);}
  zoomOut(){this.stopAutoFlip();this.setZoom(this.state.zoom-.25);}
  fit(){this.stopAutoFlip();this.setZoom(1);}
  /** Populate low-resolution thumbnails only, grouped by the current layout. */
  renderThumbnails(){if(!this.manifest)return;const container=this.$('.ff-thumbnails'),scroll=container.scrollLeft;container.replaceChildren();const groups=this.state.mode==='single'?this.manifest.pages.map(p=>[p.index]):spreads(this.manifest.pageCount);for(const group of groups){const button=document.createElement('button');button.className='ff-thumbnail';button.dataset.pages=group.join(',');button.setAttribute('aria-label',`Go to page ${group.join(' and ')}`);const pair=document.createElement('span');pair.className='ff-thumb-pair';for(const page of group){const spec=this.manifest.pages[page-1],panel=document.createElement('span');panel.className='ff-thumb-panel';panel.style.aspectRatio=`${this.manifest.pageWidth} / ${this.manifest.pageHeight}`;if(spec.layout==='foldout')panel.classList.add('ff-thumb-foldout');const art=this.artwork({...spec,image:spec.thumbnail});const img=art.querySelector('img');if(img){img.loading='lazy';img.alt=`Page ${page}${spec.layout==='foldout'?', fold-out':''}`;}panel.append(art);pair.append(panel);}const label=document.createElement('span');label.textContent=group.join('–');button.append(pair,label);button.onclick=()=>this.goToPage(group[0]);container.append(button);}container.scrollLeft=scroll;this.selectThumbnail();}
  /** Highlight and reveal the selected spread without scrolling the document. */
  selectThumbnail(){const container=this.$('.ff-thumbnails');for(const button of container.children){const selected=button.dataset.pages.split(',').map(Number).includes(this.state.pageIndex);button.classList.toggle('ff-selected',selected);button.setAttribute('aria-current',selected?'page':'false');if(selected&&this.state.thumbnailsOpen){const left=button.offsetLeft,right=left+button.offsetWidth;if(left<container.scrollLeft||right>container.scrollLeft+container.clientWidth)container.scrollTo({left:Math.max(0,left-container.clientWidth/2+button.offsetWidth/2),behavior:this.reduced.matches?'instant':'smooth'});}}}
  openThumbnails(){this.stopAutoFlip();this.state.thumbnailsOpen=true;this.$('.ff-tray').hidden=false;this.root.classList.add('ff-tray-open');if(!this.$('.ff-thumbnails').children.length)this.renderThumbnails();this.selectThumbnail();this.updateControls();}
  closeThumbnails(){this.state.thumbnailsOpen=false;this.$('.ff-tray').hidden=true;this.root.classList.remove('ff-tray-open');this.updateControls();this.$('[data-action=thumbnails]').focus({preventScroll:true});}
  async enterFullscreen(){if(!this.options.enableFullscreen||!document.fullscreenEnabled)return;this.stopAutoFlip();try{await this.root.requestFullscreen();}catch{this.announce('Fullscreen is not available in this browser context.');}}
  async exitFullscreen(){if(document.fullscreenElement===this.root)await document.exitFullscreen();}
  clearAutoTimer(){clearTimeout(this.autoTimer);}
  /** Use a single timeout so hidden tabs and interactions never accumulate turns. */
  scheduleAuto(){this.clearAutoTimer();if(!this.state.autoFlip||document.hidden)return;this.autoTimer=setTimeout(async()=>{if(!this.state.autoFlip||document.hidden)return;if(!this.turn)await this.navigate(1,true);if(this.state.autoFlip)this.scheduleAuto();},Math.max(500,this.options.autoFlipIntervalMs));}
  startAutoFlip(){if(!this.loaded||!this.options.enableAutoFlip||!adjacent(this.state.pageIndex,this.manifest.pageCount,this.state.mode,1))return;this.fit();this.state.autoFlip=true;this.updateControls();this.scheduleAuto();}
  stopAutoFlip(){this.clearAutoTimer();this.state.autoFlip=false;this.updateControls();}
  /** Respect editable elements and dialogs when dispatching keyboard shortcuts. */
  keyboard(e){if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])')||document.querySelector('dialog[open]'))return;const actions={ArrowLeft:'previous',ArrowRight:'next',Home:'first',End:'last','+':'zoomIn','=':'zoomIn','-':'zoomOut','0':'fit',f:'fullscreen',t:'thumbnails',' ':'next',Escape:'escape'};const a=actions[e.key]||actions[e.key.toLowerCase()];if(!a)return;if(e.key===' '&&e.target.closest('button'))return;e.preventDefault();this.wake();if(a==='fullscreen')this.state.fullscreen?this.exitFullscreen():this.enterFullscreen();else if(a==='thumbnails')this.state.thumbnailsOpen?this.closeThumbnails():this.openThumbnails();else if(a==='escape'){if(this.openFoldouts.size)this.closeFoldout();if(this.state.thumbnailsOpen)this.closeThumbnails();this.fit();}else this[a]();}
  /** Keep all duplicate navigation buttons and accessible state synchronized. */
  updateControls(){const ready=!!this.loaded,busy=!!this.turn||this.foldoutBusy;for(const button of this.root.querySelectorAll('[data-foldout]'))this.updateFoldoutButton(button,Number(button.dataset.foldout));for(const action of ['first','previous','next','last'])for(const button of this.root.querySelectorAll(`[data-action=${action}]`)){const backwards=action==='first'||action==='previous';button.disabled=!ready||busy||!adjacent(this.state.pageIndex,this.manifest?.pageCount||1,this.state.mode,backwards?-1:1);if(button.classList.contains('ff-edge'))button.style.visibility=!ready||!adjacent(this.state.pageIndex,this.manifest?.pageCount||1,this.state.mode,backwards?-1:1)?'hidden':'visible';}const modeButton=this.$('[data-action=readingMode]'),animationButton=this.$('[data-action=animation]');
    for(const [button,enabled,label,glyph] of [[modeButton,this.state.mode==='spread',this.state.mode==='single'?'Show two pages':'Show single page',this.state.mode==='single'?'single':'spread'],[animationButton,this.options.animatePageTurns,this.options.animatePageTurns?'Disable page-turn animation':'Enable page-turn animation',this.options.animatePageTurns?'motion':'still']]){
      button.disabled=!ready||busy;button.innerHTML=icon(glyph);button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',label);button.title=label;button.classList.toggle('ff-active',enabled);
    }
    this.$('.ff-hint').textContent=this.state.fullscreen?'To exit fullscreen, click the [ ] box in the bottom right of this page.':'DRAG A CORNER. TURN THE PAGE.';
    this.root.classList.toggle('ff-fullscreen',this.state.fullscreen);
    if(!this.manifest)return;const group=this.group();if(document.activeElement!==this.input)this.input.value=group.join('–');this.input.disabled=!ready||busy;this.$('.ff-page-total').textContent=`/ ${this.manifest.pageCount}`;this.$('.ff-page-caption').textContent=group[0]===1?'FRONT COVER':group.length===1&&group[0]===this.manifest.pageCount?'BACK COVER':`PAGE${group.length>1?'S':''} ${group.join('–')}`;this.$('.ff-mode').textContent=this.state.mode==='spread'?'Facing pages':'Single page';this.$('.ff-fit').textContent=this.state.zoom===1?'Fit':`${Math.round(this.state.zoom*100)}%`;this.$('[data-action=zoomOut]').disabled=!ready||busy||this.state.zoom<=1;this.$('[data-action=zoomIn]').disabled=!ready||busy||this.state.zoom>=this.options.maxZoom;this.$('[data-action=thumbnails]').setAttribute('aria-expanded',String(this.state.thumbnailsOpen));this.$('[data-action=thumbnails]').classList.toggle('ff-active',this.state.thumbnailsOpen);const auto=this.$('[data-action=autoflip]');auto.innerHTML=icon(this.state.autoFlip?'pause':'play');auto.setAttribute('aria-pressed',String(this.state.autoFlip));auto.setAttribute('aria-label',this.state.autoFlip?'Stop auto flip':'Start auto flip');auto.title=this.state.autoFlip?'Stop auto flip':'Start auto flip';auto.classList.toggle('ff-active',this.state.autoFlip);const full=this.$('[data-action=fullscreen]');full.setAttribute('aria-pressed',String(this.state.fullscreen));full.setAttribute('aria-label',this.state.fullscreen?'Exit fullscreen':'Enter fullscreen');full.title=this.state.fullscreen?'Exit fullscreen':'Enter fullscreen';this.viewport.classList.toggle('ff-pannable',this.state.zoom>1);}
  /** Fade secondary controls after inactivity while preserving focus and edge controls. */
  wake(){this.root.classList.remove('ff-idle');clearTimeout(this.idleTimer);this.idleTimer=setTimeout(()=>{if(!this.turn&&!this.state.thumbnailsOpen&&!this.root.contains(document.activeElement))this.root.classList.add('ff-idle');},4500);}
  announce(message){this.$('.ff-announcement').textContent=message;}
  /** Subscribe to immutable viewer event snapshots; returns an unsubscribe callback. */
  on(name,callback){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(callback);return()=>this.listeners.get(name)?.delete(callback);}
  emit(name,detail={}){const event={...detail,state:this.getState()};for(const callback of this.listeners.get(name)||[])callback(event);}
  /** Return reading-page counts and visible source mappings without exposing internal manifests. */
  getState(){
    const manifest=this.manifest;
    return {...this.state,
      sourceIndex:manifest?.pages[this.state.pageIndex-1]?.sourceIndex??null,
      pageCount:manifest?.pageCount??0,
      sourcePageCount:manifest?.sourcePageCount??0,
      visiblePages:manifest?this.group().map(pageIndex=>({pageIndex,sourceIndex:manifest.pages[pageIndex-1].sourceIndex??null})):[],
      foldoutsOpen:[...this.openFoldouts]};
  }
  /** Fully detach a reusable viewer, releasing animation, observers and GPU resources. */
  destroy(){this.destroyed=true;this.cancelFoldoutTransition();this.cancelTurn();this.abort.abort();this.fetchAbort.abort();this.observer.disconnect();this.clearAutoTimer();clearTimeout(this.resizeTimer);clearTimeout(this.idleTimer);cancelAnimationFrame(this.dragFrame);this.renderer?.destroy();this.cache?.destroy();this.listeners.clear();this.root.replaceChildren();for(const [key,value] of Object.entries(this.original)){const attr=key==='label'?'aria-label':key;value===null?this.root.removeAttribute(attr):this.root.setAttribute(attr,value);}}
}

window.FlippyFlapper=Object.freeze({create:createMagazineViewer,createMagazineViewer,MagazineViewer,inferPageLayout});
})(window);
