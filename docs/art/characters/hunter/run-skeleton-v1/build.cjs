// Independent vector motion study. Does not load or deform character artwork.
const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
const ankles=[[246,310],[220,310],[180,310],[148,292],[158,276],[180,286],[218,296],[248,300]];
const heights=[200,208,198,188,200,208,198,188];
const labels=['左脚接触','左腿承重','左腿蹬离','腾空 / 右脚前送','右脚接触','右腿承重','右腿蹬离','腾空 / 左脚前送'];
function solve(hip,ankle){
 const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.hypot(dx,dy),a=60,b=65;
 if(d>=a+b||d<=Math.abs(a-b))throw Error('Unreachable ankle');
 const along=(a*a-b*b+d*d)/(2*d),off=Math.sqrt(a*a-along*along);
 const knee=[hip[0]+along*dx/d+off*dy/d,hip[1]+along*dy/d-off*dx/d];
 return {hip,knee,ankle,thigh:a,shin:b};
}
const frames=heights.map((y,i)=>({index:i,label:labels[i],durationMs:80,hip:[200,y],left:solve([204,y],ankles[i]),right:solve([196,y],ankles[(i+4)%8]),grounded:i%4!==3,support:i%4===3?null:i<4?'left':'right'}));
const manifest={version:1,stage:'skeleton-review',facing:'right',left:{color:'#58caff',depth:'near',ornamentOwner:true},right:{color:'#ffad66',depth:'far',ornamentOwner:false},groundY:320,thighLength:60,shinLength:65,frames};
fs.writeFileSync(path.join(dir,'motion.json'),JSON.stringify(manifest,null,2)+'\n');
function leg(p,color,ring){const pts=[p.hip,p.knee,p.ankle];const [x,y]=p.ankle;const rx=p.hip[0]*.64+p.knee[0]*.36,ry=p.hip[1]*.64+p.knee[1]*.36;
 return `<g fill="${color}" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><polyline fill="none" points="${pts.map(p=>p.join(',')).join(' ')}"/><path d="M ${x-5} ${y+3} L ${x+17} ${y+10}"/>${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="5"/>`).join('')}</g>${ring?`<circle cx="${rx}" cy="${ry}" r="7" fill="#13212b" stroke="#f5d55e" stroke-width="3"/>`:''}`;
}
function figure(f){const y=f.hip[1],s=2*Math.sin(f.index*Math.PI/4);return `<path d="M 65 320 H 335" stroke="#526575" stroke-dasharray="5 5"/><path d="M 200 ${y} L 220 ${y-70}" stroke="#c9d7df" stroke-width="12" stroke-linecap="round"/><circle cx="228" cy="${y-98}" r="20" fill="#c9d7df"/><path d="M 241 ${y-99} l 8 4 -8 4" fill="#c9d7df"/><path d="M 216 ${y-64} l ${-30-s*5} 28 28 14 M 216 ${y-64} l ${25+s*5} 24 20 -15" stroke="#91a4b5" fill="none" stroke-width="7" stroke-linecap="round"/>${leg(f.right,'#ffad66',false)}${leg(f.left,'#58caff',true)}<path d="M 196 ${y} L 204 ${y}" stroke="#e4ecf1" stroke-width="6"/><text x="20" y="28" fill="#e0e9ee" font-size="18">${f.index+1}. ${f.label}</text>`;}
const groups=frames.map(f=>figure(f));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="720" viewBox="0 0 1600 720"><rect width="1600" height="720" fill="#13212b"/>${groups.map((g,i)=>`<g transform="translate(${i%4*400},${Math.floor(i/4)*360})">${g}</g>`).join('')}</svg>`;
fs.writeFileSync(path.join(dir,'contact-sheet.svg'),svg);
const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><title>猎人 · 8帧跑动骨架</title><style>body{background:#101a22;color:#e0e9ee;font:16px/1.7 system-ui;max-width:1100px;margin:30px auto;padding:0 20px}button,select,input{font:inherit;margin:8px;padding:5px}svg{background:#13212b;width:min(100%,480px)}img{width:100%}.legend span{margin-right:20px}#phase{min-height:30px}</style><h1>猎人 · 8帧双色跑动骨架</h1><p class="legend"><span style="color:#58caff">蓝色＝角色左腿 / 近侧</span><span style="color:#ffad66">橙色＝角色右腿 / 远侧</span><span style="color:#f5d55e">金圈＝固定在左大腿36%处的追踪标记</span></p><p>本页仅检查骨架。所有帧共用60/65的大小腿长度；近腿始终覆盖远腿；双脚离地帧为4、8。金圈由同一条腿的关节坐标计算，不单独摆放。</p><button id="play">暂停</button><button id="prev">上一帧</button><button id="next">下一帧</button><label>速度<select id="speed"><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></label><input id="frame" type="range" min="0" max="7" value="0" aria-label="逐帧"><div id="phase"></div><svg id="stage" viewBox="0 0 400 360" aria-label="跑动骨架"></svg><h2>完整循环接触表</h2><img src="contact-sheet.svg" alt="8帧双色骨架接触表"><p>按每帧80ms制作640ms循环，尚未套回人物。检查重点：交替承重、后脚高度、膝盖经过、首尾衔接。</p><script>
const frames=${JSON.stringify(frames)},groups=${JSON.stringify(groups)};let index=0,playing=true,speed=1,elapsed=0,last;
const stage=document.getElementById('stage'),phase=document.getElementById('phase'),slider=document.getElementById('frame');
function draw(){stage.innerHTML=groups[index];slider.value=index;phase.textContent=(index+1)+'/8 · '+frames[index].label;}
function pause(){playing=false;document.getElementById('play').textContent='播放';}
document.getElementById('play').onclick=()=>{playing=!playing;document.getElementById('play').textContent=playing?'暂停':'播放';};
document.getElementById('prev').onclick=()=>{pause();index=(index+7)%8;elapsed=index*80;draw();};document.getElementById('next').onclick=()=>{pause();index=(index+1)%8;elapsed=index*80;draw();};slider.oninput=()=>{pause();index=+slider.value;elapsed=index*80;draw();};document.getElementById('speed').onchange=e=>speed=+e.target.value;
function tick(t){if(last!==undefined&&playing){elapsed=(elapsed+(t-last)*speed)%640;index=Math.floor(elapsed/80);draw();}last=t;requestAnimationFrame(tick);}draw();requestAnimationFrame(tick);
window.motionStudy={frames,get index(){return index;},seek:i=>{pause();index=i;elapsed=i*80;draw();}};
</script></html>`;
fs.writeFileSync(path.join(dir,'preview.html'),html);
// Numeric invariants catch length changes and accidental ornament reassignment.
for(const f of frames)for(const key of ['left','right']){const p=f[key];for(const [a,b,length] of [[p.hip,p.knee,60],[p.knee,p.ankle,65]])if(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-length)>1e-8)throw Error('Bone length drift');if(p.knee[1]<p.hip[1])throw Error('High knee');}
console.log('8 frames; fixed 60/65 bone lengths; knees below hips; left-only procedural marker.');
