// Reusable cutout parts bound to the user-approved skeleton; no per-frame pose generation.
const fs=require('node:fs'),path=require('node:path');const root=__dirname;
const motion=JSON.parse(fs.readFileSync(path.join(root,'motion.json')));
const parts={
 torso:{rect:[0,0,550,450],anchor:[225,410],scale:.336,angle:-.22},
 hair:{rect:[550,0,340,450],anchor:[825,55],scale:.19},
 skirt:{rect:[890,25,500,420],anchor:[1240,80],scale:.20},
 leftThigh:{rect:[1490,10,250,435],a:[1590,48],b:[1645,419],widthScale:.72},
 rightThigh:{rect:[100,460,215,405],a:[225,485],b:[155,835],widthScale:.72},
 leftShin:{rect:[590,450,220,270],a:[656,470],b:[660,816],widthScale:.84},
 rightShin:{rect:[1040,450,225,270],a:[1107,470],b:[1113,816],widthScale:.84},
 leftBoot:{rect:[590,665,220,215],anchor:[660,816],scale:65/Math.hypot(4,346)},
 rightBoot:{rect:[1040,665,225,215],anchor:[1113,816],scale:65/Math.hypot(6,346)},
 shorts:{rect:[1400,555,345,195],anchor:[1555,594],scale:.14}
};
fs.writeFileSync(path.join(root,'rig.json'),JSON.stringify({skeleton:'../run-skeleton-v1/motion.json',parts,drawOrder:['hair','skirt','rightShin','rightBoot','rightThigh','leftShin','leftBoot','leftThigh','torso','shorts'],ornamentOwner:'leftThigh',notes:['Part anchors use full source image pixels.','Skinning follows approved joint positions; no independently generated frame poses.','Boots have separate ankle rotation to keep support soles horizontal.']},null,2)+'\n');
const manifest={version:5,stage:'cutout-animation-review',cellSize:416,anchorX:208,anchorY:352,clips:[{name:'run',source:'rig-rendered.png',columns:4,rows:2,output:'run-atlas.png',gif:'run-preview.gif',slowGif:'run-slow.gif',scale:1,baselineByRow:[352,352],frames:motion.frames.map((f,i)=>({sourceIndex:i,durationMs:f.durationMs}))}],notes:['Uses exact approved eight-frame joint coordinates.','Ornament exists only in reusable left thigh texture.','Upper-body/bow assembly is currently rigid; hair and cloth secondary motion.']};
fs.writeFileSync(path.join(root,'animation.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'preview.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><title>猎人跑动 v5 · 骨架绑定</title><style>body{background:#101a22;color:#deebef;font:16px/1.7 system-ui;max-width:1160px;margin:24px auto;padding:0 18px}button,select,input{font:inherit;margin:6px;padding:5px}canvas{max-width:100%;background:repeating-conic-gradient(#172630 0% 25%,#1c2c36 0% 50%) 0 0/20px 20px}#stage{width:520px}.row{display:flex;gap:22px;flex-wrap:wrap}.note{color:#aabecb}#phase{min-height:30px}</style><h1>猎人跑动 v5 · 8帧骨架绑定</h1><p>同一套部件复用8帧。蓝色＝左腿，橙色＝右腿；腿环只存在于左大腿部件。</p><button id="play">暂停</button><button id="prev">上一帧</button><button id="next">下一帧</button><label>速度<select id="speed"><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></label><label><input id="overlay" type="checkbox" checked>叠加已确认骨架</label><input id="frame" aria-label="逐帧" type="range" min="0" max="7" value="0"><div id="phase"></div><div class="row"><canvas id="stage" width="416" height="416"></canvas><div><p>近腿始终覆盖远腿，金色关节标记固定在左大腿。</p><p class="note">当前为分层动画审阅稿；上身和持弓手臂为整体部件。<br>先检查步态与装饰连续性，再精修关节接缝与上身动作。</p><p><a href="run-preview.gif">正常GIF</a> · <a href="run-slow.gif">慢放GIF</a></p><pre id="error"></pre></div></div><h2>完整8帧</h2><canvas id="sheet" width="1664" height="832"></canvas><script>
const motion=${JSON.stringify(motion)},parts=${JSON.stringify(parts)};const image=new Image;let ready=false,index=0,elapsed=0,speed=1,playing=true,last;
function texture(ctx,p){const [x,y,w,h]=p.rect;ctx.drawImage(image,x,y,w,h,x,y,w,h);}
function placed(ctx,key,target,angle=0){const p=parts[key];ctx.save();ctx.translate(...target);ctx.rotate((p.angle||0)+angle);ctx.scale(p.scale,p.scale);ctx.translate(-p.anchor[0],-p.anchor[1]);texture(ctx,p);ctx.restore();}
function limb(ctx,key,a,b){const p=parts[key],dx=p.b[0]-p.a[0],dy=p.b[1]-p.a[1],sx=b[0]-a[0],sy=b[1]-a[1],scale=Math.hypot(sx,sy)/Math.hypot(dx,dy);ctx.save();ctx.translate(...a);ctx.rotate(Math.atan2(sy,sx));ctx.scale(scale,scale*p.widthScale);ctx.rotate(-Math.atan2(dy,dx));ctx.translate(-p.a[0],-p.a[1]);texture(ctx,p);ctx.restore();}
function chain(ctx,p,color){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...p.hip);ctx.lineTo(...p.knee);ctx.lineTo(...p.ankle);ctx.stroke();for(const q of [p.hip,p.knee,p.ankle]){ctx.beginPath();ctx.arc(...q,3,0,Math.PI*2);ctx.fill();}}
function draw(ctx,i,overlay=false){ctx.clearRect(0,0,416,416);ctx.save();ctx.translate(8,32);const f=motion.frames[i],y=f.hip[1],wave=Math.sin(i*Math.PI/2);
placed(ctx,'hair',[213,y-99],.8+wave*.07);placed(ctx,'skirt',[200,y-7],.25-wave*.08);
const footAngles=[0,0,-.2,.15,.45,.3,.1,0];
limb(ctx,'rightShin',f.right.knee,f.right.ankle);placed(ctx,'rightBoot',f.right.ankle,footAngles[(i+4)%8]);limb(ctx,'rightThigh',f.right.hip,f.right.knee);
limb(ctx,'leftShin',f.left.knee,f.left.ankle);placed(ctx,'leftBoot',f.left.ankle,footAngles[i]);limb(ctx,'leftThigh',f.left.hip,f.left.knee);
placed(ctx,'torso',[200,y]);placed(ctx,'shorts',[200,y-10]);
if(overlay){chain(ctx,f.right,'#ffad66');chain(ctx,f.left,'#58caff');ctx.strokeStyle='#f5d55e';ctx.beginPath();ctx.arc(f.left.hip[0]*.64+f.left.knee[0]*.36,f.left.hip[1]*.64+f.left.knee[1]*.36,6,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#748692';ctx.beginPath();ctx.moveTo(60,320);ctx.lineTo(340,320);ctx.stroke();}ctx.restore();}
const stage=document.getElementById('stage'),sheet=document.getElementById('sheet'),slider=document.getElementById('frame');
function redraw(){if(!ready)return;draw(stage.getContext('2d'),index,document.getElementById('overlay').checked);slider.value=index;document.getElementById('phase').textContent=(index+1)+'/8 · '+motion.frames[index].label;}
function pause(){playing=false;document.getElementById('play').textContent='播放';}
function seek(i){pause();index=(i+8)%8;elapsed=index*80;redraw();}
document.getElementById('play').onclick=()=>{playing=!playing;document.getElementById('play').textContent=playing?'暂停':'播放';};document.getElementById('prev').onclick=()=>seek(index-1);document.getElementById('next').onclick=()=>seek(index+1);slider.oninput=()=>seek(+slider.value);document.getElementById('speed').onchange=e=>speed=+e.target.value;document.getElementById('overlay').onchange=redraw;
function tick(t){if(last!==undefined&&playing){elapsed=(elapsed+(t-last)*speed)%640;index=Math.floor(elapsed/80);redraw();}last=t;requestAnimationFrame(tick);}
image.onload=()=>{ready=true;const c=document.createElement('canvas');c.width=c.height=416;for(let i=0;i<8;i++){draw(c.getContext('2d'),i);sheet.getContext('2d').drawImage(c,i%4*416,Math.floor(i/4)*416);}redraw();requestAnimationFrame(tick);};image.onerror=()=>document.getElementById('error').textContent='部件源图加载失败';image.src='parts-source.png';window.hunterRig={motion,parts,draw,seek,get ready(){return ready;},get index(){return index;}};
</script></html>`);
console.log('Built rig manifest and interactive preview from approved skeleton.');
