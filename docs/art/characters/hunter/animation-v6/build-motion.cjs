// Athletic stride revision: preserve limb identity/length, raise pelvis and extend push-off.
const fs=require('node:fs'),path=require('node:path');
const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../run-skeleton-v1/motion.json')));
const ankles=[[238,310],[210,310],[176,308],[148,294],[160,280],[190,282],[228,291],[244,296]],heights=[194,198,187,183,194,198,187,183];
function solve(hip,ankle){const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.hypot(dx,dy),a=60,b=65;if(d>=125||d<=5)throw Error('unreachable');const u=(a*a-b*b+d*d)/(2*d),v=Math.sqrt(a*a-u*u);return {hip,knee:[hip[0]+u*dx/d+v*dy/d,hip[1]+u*dy/d-v*dx/d],ankle,thigh:a,shin:b};}
const frames=heights.map((y,i)=>({...old.frames[i],durationMs:70,hip:[200,y],left:solve([204,y],ankles[i]),right:solve([196,y],ankles[(i+4)%8])}));
for(const f of frames)for(const leg of [f.left,f.right]){if(leg.knee[1]<leg.hip[1])throw Error('high knee');for(const [a,b,l] of [[leg.hip,leg.knee,60],[leg.knee,leg.ankle,65]])if(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-l)>1e-8)throw Error('bone length');}
const result={...old,version:2,stage:'athletic-stride-revision',frames,notes:['Revises approved skeleton after user rejected dressed motion as sneaking.','Pelvis raised, less persistent knee compression, extended push-off.','Identity and 60/65 bone lengths preserved.']};
fs.writeFileSync(path.join(__dirname,'motion.json'),JSON.stringify(result,null,2)+'\n');console.log('8 athletic stride poses; fixed bone lengths; 560ms.');
