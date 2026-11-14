export type Vec=[number,number,number];
type P=[number,number];
export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const segment=(p:number,a:number,b:number)=>clamp((p-a)/(b-a));
export const smooth=(p:number)=>p*p*(3-2*p);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const lerp=(a:Vec,b:Vec,t:number):Vec=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];
const rgb=(a:number[],b:number[],t:number)=>"rgb("+a.map((v,i)=>Math.round(mix(v,b[i],t))).join(",")+")";
export const MESSAGE="Good ideas travel further.";
export const CODE="K7M3Q9";
const sheet:Vec[]=[[-.86,-1.10,0],[0,-1.10,0],[.86,-1.10,0],[-.86,.12,0],[0,.12,0],[.86,.12,0],[-.86,1.10,0],[0,1.10,0],[.86,1.10,0]];
const dart:Vec[]=[[-.16,-1.23,.05],[0,-1.52,.04],[.16,-1.23,.05],[-1.22,.77,.10],[0,-.12,-.22],[1.22,.77,.10],[-.52,.50,.25],[0,.91,-.20],[.52,.50,.25]];
const faces=[{v:[0,1,4,3],shade:.95},{v:[1,2,5,4],shade:1},{v:[3,4,7,6],shade:.83},{v:[4,5,8,7],shade:.92}];
const rotate=(v:Vec,rx:number,ry:number,rz:number):Vec=>{let [x,y,z]=v;let a=Math.cos(rx),b=Math.sin(rx);[y,z]=[y*a-z*b,y*b+z*a];a=Math.cos(ry);b=Math.sin(ry);[x,z]=[x*a+z*b,-x*b+z*a];a=Math.cos(rz);b=Math.sin(rz);[x,y]=[x*a-y*b,x*b+y*a];return [x,y,z]};
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a:Vec,b:Vec):Vec=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
function bezier(t:number,points:P[]):P{const u=1-t;return [u*u*u*points[0][0]+3*u*u*t*points[1][0]+3*u*t*t*points[2][0]+t*t*t*points[3][0],u*u*u*points[0][1]+3*u*u*t*points[1][1]+3*u*t*t*points[2][1]+t*t*t*points[3][1]];}
function cloud(c:CanvasRenderingContext2D,x:number,y:number,r:number,alpha:number){c.save();c.globalAlpha=alpha;for(let i=0;i<5;i++){const dx=(i-2)*r*.46,dy=Math.sin(i*1.8)*r*.18,rr=r*(.65+.17*Math.sin(i*2+1));const g=c.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,rr);g.addColorStop(0,"rgba(255,255,255,.95)");g.addColorStop(.45,"rgba(247,252,255,.66)");g.addColorStop(1,"rgba(235,247,255,0)");c.fillStyle=g;c.fillRect(x+dx-rr,y+dy-rr,2*rr,2*rr)}c.restore()}
export function renderFlight(c:CanvasRenderingContext2D,w:number,h:number,p:number,time=0,mouse:P=[0,0],reduce=false){
 const mobile=w<700,flight=smooth(segment(p,.27,.79)),fold=smooth(segment(p,.17,.32)),unfold=smooth(segment(p,.79,.95)),morph=fold*(1-unfold),motion=reduce?0:Math.sin(time*.0016)*.018;
 const sky=smooth(segment(p,.22,.48))*(1-smooth(segment(p,.70,.99)));
 const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,rgb([245,249,255],[82,151,222],sky));g.addColorStop(.58,rgb([222,236,250],[170,211,246],sky));g.addColorStop(1,rgb([250,251,255],[246,250,255],sky));c.fillStyle=g;c.fillRect(0,0,w,h);
 for(let i=0;i<10;i++){const seed=(i*.61803398875)%1;const x=(((seed+flight*1.35*(.12+(i%3)*.08))%1.25)-.12)*w;const y=(.18+((i*7)%11)*.058)*h+Math.sin(i*2+flight*4)*h*.025;cloud(c,x,y,Math.min(w,h)*(.13+(i%4)*.045),.20+sky*.21)}
 for(let i=0;i<6;i++){const seed=(i*.371)%1;const x=(((seed-flight*.6)%1.5+1.5)%1.5-.25)*w;const y=h*(.68+(i%3)*.13);cloud(c,x,y,Math.min(w,h)*(.21+(i%3)*.07),.37+sky*.25)}
 const route:P[]=mobile?[[.50,.62],[.95,.40],[.04,.45],[.50,.63]]:[[.68,.52],[.94,.10],[.12,.18],[.35,.54]];
 const pos=bezier(flight,route);let cx=pos[0]*w,cy=pos[1]*h;
 const flying=smooth(segment(p,.25,.40))*(1-smooth(segment(p,.69,.84)));
 const yaw=(Math.sin(flight*Math.PI*2)*.83+.26)*flying+mouse[0]*.08*(1-flying);
 const pitch=(.18+Math.sin(flight*Math.PI*2+.8)*.52)*flying-.13*(1-flying)+motion;
 const roll=(.98+Math.sin(flight*Math.PI*2.8)*.78)*flying+.12*(1-flying)+mouse[1]*.04;
 const size=Math.min(w*(mobile?.30:.235),h*.25)*(1+flying*.55);
 const perspective=3.8;const vertices=sheet.map((v,i)=>{const d=lerp(v,dart[i],morph);if(fold>0&&fold<1)d[2]+=Math.sin(fold*Math.PI)*Math.abs(v[0])*.62*(i%3===0?1:-.7);return rotate(d,pitch,yaw,roll)});
 const project=(v:Vec):P=>{const k=perspective/(perspective+v[2]);return [cx+v[0]*size*k,cy+v[1]*size*k]};
 if(flying>.01){c.save();c.globalAlpha=flying*.58;c.beginPath();for(let j=0;j<=55;j++){const q=bezier(flight*j/55,route);if(j)c.lineTo(q[0]*w,q[1]*h);else c.moveTo(q[0]*w,q[1]*h)}c.setLineDash([5,13]);c.strokeStyle="#356eae";c.lineWidth=1.5;c.stroke();c.restore();}
 c.save();c.translate(cx,cy+size*.85);c.scale(1,.25);const shadow=c.createRadialGradient(0,0,0,0,0,size*1.15);shadow.addColorStop(0,"rgba(30,67,119,.22)");shadow.addColorStop(1,"rgba(30,67,119,0)");c.fillStyle=shadow;c.fillRect(-size*1.2,-size*1.2,size*2.4,size*2.4);c.restore();
 const ordered=faces.map(f=>({...f,z:f.v.reduce((a,i)=>a+vertices[i][2],0)/f.v.length})).sort((a,b)=>b.z-a.z);
 ordered.forEach(f=>{const v=f.v.map(i=>vertices[i]);const n=cross(sub(v[1],v[0]),sub(v[2],v[0]));const light=Math.abs((n[0]*-.3+n[1]*-.25+n[2]*.91)/(Math.hypot(...n)||1));const shade=mix(.69,.99,light)*f.shade;const points=v.map(project);const a=points[0],b=points[2];const grad=c.createLinearGradient(a[0],a[1],b[0]+.01,b[1]+.01);grad.addColorStop(0,rgb([150,181,230],[255,255,255],shade));grad.addColorStop(1,rgb([133,167,219],[248,251,255],shade*.94));c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=grad;c.fill();c.strokeStyle="rgba(82,126,181,.18)";c.lineWidth=.7;c.stroke()});
 const paperText=1-smooth(segment(morph,.05,.32));if(paperText>.01){c.save();c.globalAlpha=paperText;const a=project(vertices[0]),b=project(vertices[2]),d=project(vertices[6]);c.transform((b[0]-a[0])/300,(b[1]-a[1])/300,(d[0]-a[0])/380,(d[1]-a[1])/380,a[0],a[1]);c.fillStyle="#2b5590";c.font="600 12px system-ui";c.fillText(p>.79?"COPYCLOUD / INCOMING":"COPYCLOUD / OUTGOING",24,35);c.strokeStyle="#c5d6eb";c.lineWidth=.8;c.beginPath();c.moveTo(24,53);c.lineTo(276,53);c.stroke();c.font="500 24px system-ui";c.fillStyle="#203756";const count=p>.79?Math.floor(segment(p,.88,.98)*MESSAGE.length):Math.floor(segment(p,.018,.15)*MESSAGE.length);const msg=MESSAGE.slice(0,count);c.fillText(msg.slice(0,14),24,118);c.fillText(msg.slice(14),24,151);if(count<MESSAGE.length&&Math.floor(time/500)%2===0){const line=msg.length>14?msg.slice(14):msg;c.fillRect(25+c.measureText(line).width,msg.length>14?132:99,2,22)}c.font="11px monospace";c.fillStyle="#57769c";c.fillText(p>.79?"RECEIVED / "+CODE:"TEXT / READY TO SEND",24,346);c.restore()}
}
