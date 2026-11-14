import {useEffect,useRef,useState} from "react";
import {Link} from "react-router";
import {motion,useScroll,useSpring,useTransform,useReducedMotion} from "motion/react";
import {ArrowUpRight,ArrowDown,ArrowRight,Send,Download,FileText,ScanLine,Monitor,Smartphone,Clock,Paperclip,Cloud,Menu,X,Shield} from "lucide-react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

const vertex="attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const fragment=`precision highp float;
uniform vec2 res;uniform float t;uniform float progress;uniform vec2 pointer;
#define PI 3.14159265
mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
float sm(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sph(vec3 p,vec3 c,float r){return length(p-c)-r;}
float tor(vec3 p,float r,float w){return length(vec2(length(p.xy)-r,p.z))-w;}
float shape(vec3 p){
 p.xy=rot(.13*sin(t*.32)+progress*.65)*p.xy;p.xz=rot(.2*sin(t*.25)+pointer.x*.12)*p.xz;p.yz=rot(-.15+pointer.y*.1)*p.yz;
 float a=t*.32;vec3 q=p;
 float b=sph(q,vec3(-.48,-.04,.03),.55);
 b=sm(b,sph(q,vec3(.02,.34+.055*sin(a),.02),.75),.42);
 b=sm(b,sph(q,vec3(.58,-.04,.02),.57),.4);
 b=sm(b,sph(q,vec3(.05,-.37,.05),.49),.36);
 float ripple=.021*sin(q.x*8.+q.y*5.+t*.8)*sin(q.z*7.-q.y*3.-t*.45);
 b+=ripple;
 vec3 r=p; r.xy=rot(t*.1)*r.xy; r.z+=.18*sin(2.5*atan(r.y,r.x)+t*.4);
 float loop=tor(r, .87,.27);loop=sm(loop,tor(vec3(r.x,r.z,r.y),.75,.105),.17);
 vec3 e=p;e.xz=rot(.5)*e.xz;e.z+=.14*sin(e.x*5.+t*.7);
 float portal=tor(e,1.,.18);portal=sm(portal,tor(e*vec3(1.,1.,1.4),.65,.07),.12);
 float k=smoothstep(.08,.46,progress),m=smoothstep(.49,.94,progress);
 return mix(mix(b,loop,k),portal,m);
}
vec3 normal(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(shape(p+e.xyy)-shape(p-e.xyy),shape(p+e.yxy)-shape(p-e.yxy),shape(p+e.yyx)-shape(p-e.yyx)));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*res)/res.y;
 float aspect=res.x/res.y;float scale=mix(1.28,1.02,smoothstep(.7,1.4,aspect));uv*=scale;
 uv.y+=.025;uv.x-=pointer.x*.025;
 vec3 ro=vec3(0.,0.,4.1),rd=normalize(vec3(uv*1.95,-1.55));
 float d=0.,hit=0.,nearD=8.;
 for(int i=0;i<64;i++){vec3 p=ro+rd*d;float h=shape(p);nearD=min(nearD,abs(h));if(h<.002){hit=1.;break;}d+=max(.003,h*.82);if(d>8.)break;}
 float rad=length(uv*vec2(.9,1.));vec3 bg=vec3(.018,.027,.058)+vec3(.023,.055,.13)*exp(-rad*rad*2.8);
 bg+=vec3(.02,.04,.12)*exp(-pow((uv.x+.35)*1.6,2.)-pow((uv.y+.25)*2.1,2.));
 vec2 star=gl_FragCoord.xy/res.y*100.;float spark=step(.997,hash(floor(star)))*(1.-smoothstep(0.,.14,length(fract(star)-.5)));bg+=spark*.19;
 vec3 col=bg+vec3(.04,.10,.38)*exp(-nearD*8.)*.34;
 if(hit>.5){vec3 p=ro+rd*d,n=normal(p),v=-rd;float f=pow(1.-max(0.,dot(n,v)),2.2);vec3 refl=reflect(rd,n);
 float light=max(0.,dot(n,normalize(vec3(-.8,1.2,1.4))));
 float rim=pow(max(0.,dot(n,normalize(vec3(1.,.25,-.45)))),2.);
 float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.8,1.2,1.4)),n),v)),30.);
 float soft=pow(max(0.,dot(reflect(-normalize(vec3(.85,-.45,1.)),n),v)),7.);
 float bands=smoothstep(.15,.9,sin(refl.y*8.+refl.x*3.+.5*sin(refl.z*6.)));
 vec3 blue=mix(vec3(.055,.09,.35),vec3(.22,.45,.92),light);
 vec3 iridescent=mix(vec3(.27,.36,.92),vec3(.45,.91,1.),.5+.5*sin(p.y*2.4+p.x*2.+t*.25));
 col=blue*.7+iridescent*(f*.8+rim*.23)+vec3(.85,.95,1.)*spec*1.5+vec3(.16,.39,.9)*soft*.7+vec3(.17,.26,.46)*bands*.38;
 col+=vec3(.66,.85,1.)*pow(f,5.)*.55;col=mix(col,bg,.08);
 }
 float vign=1.-.32*smoothstep(.28,1.1,rad);col*=vign;col+=.008*(hash(gl_FragCoord.xy)-.5);
 gl_FragColor=vec4(pow(max(col,0.),vec3(.88)),1.);
}`;

function Sculpture({progress}:{progress:ReturnType<typeof useSpring>}){const ref=useRef<HTMLCanvasElement>(null);const [ok,setOk]=useState(false);useEffect(()=>{const cv=ref.current;if(!cv||matchMedia("(prefers-reduced-motion: reduce)").matches)return;const gl=cv.getContext("webgl",{alpha:false,antialias:false,powerPreference:"high-performance"});if(!gl)return;let program:WebGLProgram|null=null,buf:WebGLBuffer|null=null,vs:WebGLShader|null=null,fs:WebGLShader|null=null,raf=0,alive=true;let px=0,py=0,x=0,y=0,quality=1,slow=0,frames=0,last=0,visible=true;const start=performance.now();const compile=(type:number,src:string)=>{const s=gl.createShader(type);if(!s)throw Error("shader");gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw Error("shader compile");}return s;};const cleanup=()=>{cancelAnimationFrame(raf);if(program)gl.deleteProgram(program);if(buf)gl.deleteBuffer(buf);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);};try{vs=compile(gl.VERTEX_SHADER,vertex);fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();if(!program)throw Error("program");gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error("link");gl.useProgram(program);buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,"a");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);const u={r:gl.getUniformLocation(program,"res"),t:gl.getUniformLocation(program,"t"),p:gl.getUniformLocation(program,"progress"),m:gl.getUniformLocation(program,"pointer")};
const resize=()=>{const d=Math.min(devicePixelRatio||1,innerWidth<700?1:1.35)*quality;cv.width=Math.max(2,Math.round(cv.clientWidth*d));cv.height=Math.max(2,Math.round(cv.clientHeight*d));gl.viewport(0,0,cv.width,cv.height);};resize();const ro=new ResizeObserver(resize);ro.observe(cv);const io=new IntersectionObserver(es=>{visible=es[0].isIntersecting;},{threshold:0});io.observe(cv);const move=(e:PointerEvent)=>{px=(e.clientX/innerWidth-.5)*2;py=(e.clientY/innerHeight-.5)*2;};window.addEventListener("pointermove",move,{passive:true});const lost=(e:Event)=>{e.preventDefault();alive=false;setOk(false);};cv.addEventListener("webglcontextlost",lost);const frame=(now:number)=>{if(!alive)return;raf=requestAnimationFrame(frame);if(!visible||document.hidden){last=0;return;}const dt=last?now-last:16;last=now;frames++;if(frames>20){slow=dt>33?slow+1:Math.max(0,slow-1);if(slow>24&&quality>.55){quality*=.78;slow=0;resize();}if(slow>65&&quality<=.55){alive=false;setOk(false);return;}}x+=(px-x)*.04;y+=(py-y)*.04;gl.uniform2f(u.r,cv.width,cv.height);gl.uniform1f(u.t,(now-start)*.001);gl.uniform1f(u.p,progress.get());gl.uniform2f(u.m,x,y);gl.drawArrays(gl.TRIANGLES,0,3);if(frames===1)setOk(true);};raf=requestAnimationFrame(frame);return()=>{alive=false;ro.disconnect();io.disconnect();window.removeEventListener("pointermove",move);cv.removeEventListener("webglcontextlost",lost);cleanup();};}catch{cleanup();setOk(false);}},[progress]);return <div className="cc3-sculpture" aria-hidden="true"><div className="cc3-fallback"><div/><div/><div/></div><canvas ref={ref} className={ok?"is-live":""}/><div className="cc3-sculpture-vignette"/></div>}
function Brand(){return <Link to="/" className="cc3-brand"><img src="/logo.png" alt=""/><span>CopyCloud<span>.</span></span></Link>}
function Button({to="/home",children="Open CopyCloud"}:{to?:string,children?:React.ReactNode}){return <Link to={to} className="cc3-button">{children}<span><ArrowUpRight size={19}/></span></Link>}
const chapters=[{k:"01 / THE ORIGIN",title:"Your world, connected.",desc:"A little less friction between the devices you use every day.",icon:Cloud},{k:"02 / IN MOTION",title:"Make the move.",desc:"Text, files and links travel together. One transfer. One short code.",icon:Send},{k:"03 / THE ARRIVAL",title:"Right where you need it.",desc:"Open the link, scan the QR or enter the code on another device.",icon:Download}];
function Chapter({i,p}:{i:number,p:ReturnType<typeof useSpring>}){const c=chapters[i];const opacity=useTransform(p,i===0?[0,.18,.31]:i===1?[.22,.38,.56,.66]:[.57,.72,1],i===0?[1,1,0]:i===1?[0,1,1,0]:[0,1,1]);const y=useTransform(p,i===0?[0,.3]:i===1?[.2,.65]:[.56,1],[0,-24]);return <motion.div className={"cc3-chapter cc3-chapter-"+i} style={{opacity,y}}><span><c.icon size={15}/>{c.k}</span><h1>{c.title}</h1><p>{c.desc}</p></motion.div>}
function Reveal({children,className=""}:{children:React.ReactNode,className?:string}){return <motion.div className={className} initial={{opacity:0,y:32,filter:"blur(7px)"}} whileInView={{opacity:1,y:0,filter:"blur(0px)"}} viewport={{once:true,amount:.12}} transition={{duration:.85,ease:[.16,1,.3,1]}}>{children}</motion.div>}
export default function CinematicLanding(){const track=useRef<HTMLDivElement>(null);const {scrollYProgress}=useScroll({target:track,offset:["start start","end end"]});const p=useSpring(scrollYProgress,{stiffness:110,damping:28,mass:.5});const reduce=useReducedMotion();const [intro,setIntro]=useState(()=>!sessionStorage.getItem("cc3_intro"));const [menu,setMenu]=useState(false);useEffect(()=>{if(!intro)return;sessionStorage.setItem("cc3_intro","1");const t=setTimeout(()=>setIntro(false),reduce?0:1400);return()=>clearTimeout(t);},[intro,reduce]);useEffect(()=>{if(reduce)return;const lenis=new Lenis({lerp:.095,autoRaf:true,anchors:{offset:-100}});return()=>lenis.destroy()},[reduce]);const bar=useTransform(p,[0,1],["0%","100%"]);const sub=useTransform(p,[0,.12,.25],[1,1,0]);return <div className="cc3-site"><div className={"cc3-intro "+(intro?"show":"")} aria-hidden="true"><img src="/logo.png" alt=""/><span>CopyCloud</span><i/></div><header className="cc3-nav"><Brand/><nav className={menu?"open":""}><a href="#experience" onClick={()=>setMenu(false)}>Experience</a><a href="#how" onClick={()=>setMenu(false)}>How it works</a><a href="#features" onClick={()=>setMenu(false)}>Features</a><Link to="/about">About</Link></nav><Button/><button className="cc3-menu" onClick={()=>setMenu(v=>!v)} aria-label="Toggle menu">{menu?<X/>:<Menu/>}</button></header><main><div ref={track} id="experience" className="cc3-track"><section className="cc3-stage"><Sculpture progress={p}/><div className="cc3-stage-ui"><div className="cc3-stage-top"><span><i/> INDEPENDENT DIGITAL UTILITY</span><span>DESIGNED FOR EVERY DEVICE</span></div><motion.div className="cc3-center-tag" style={{opacity:sub}}>A CLOUD THAT MOVES WITH YOU</motion.div><div className="cc3-chapters">{chapters.map((_,i)=><Chapter key={i} i={i} p={p}/>)}</div><div className="cc3-stage-bottom"><div className="cc3-scroll-cue"><ArrowDown size={19}/><span>SCROLL TO EXPLORE</span></div><div className="cc3-progress"><motion.i style={{width:bar}}/></div><Button to="/share">Start sharing</Button></div></div></section></div><section id="how" className="cc3-how"><Reveal className="cc3-section-head"><span className="cc3-eyebrow"><i/> THE PROCESS</span><h2>Everything flows.<br/><em>Nothing gets in the way.</em></h2><p>Send from one device. Receive on another. No account or extra software required.</p></Reveal><div className="cc3-flow-grid">{[{icon:FileText,n:"01",title:"Drop it in",text:"Paste text or add the files you want to move.",route:"/share"},{icon:ScanLine,n:"02",title:"Create a code",text:"Get your unique six-character code and QR link.",route:"/share"},{icon:Download,n:"03",title:"Make it yours",text:"Retrieve the content on the other device.",route:"/retrieve"}].map((s,i)=><Reveal key={s.n} className="cc3-flow-card"><div className="cc3-card-top"><span>{s.n} / 03</span><s.icon size={21}/></div><div className={"cc3-card-visual v"+i}>{i===0?<><div className="cc3-mini-file"><FileText/>notes.txt</div><div className="cc3-mini-file"><Paperclip/>document.pdf</div></>:i===1?<div className="cc3-code">{["A","7","K","3","M","9"].map(v=><b key={v}>{v}</b>)}</div>:<><Smartphone size={60}/><span className="cc3-connection"><i/><i/><i/></span><Monitor size={80}/></>}</div><div className="cc3-card-copy"><h3>{s.title}</h3><p>{s.text}</p><Link to={s.route} aria-label={s.title}><ArrowUpRight/></Link></div></Reveal>)}</div></section><section id="features" className="cc3-feature-section"><Reveal className="cc3-section-head"><span className="cc3-eyebrow"><i/> BUILT FOR REAL LIFE</span><h2>Small details.<br/><em>Big difference.</em></h2></Reveal><div className="cc3-feature-grid">{[{icon:Paperclip,title:"Text and files",body:"Share links, notes, code and multiple files up to 40 MB."},{icon:Shield,title:"No account",body:"Start transferring without creating a profile."},{icon:Clock,title:"Temporary by design",body:"Transfers are designed to expire after 24 hours."},{icon:Monitor,title:"Every device",body:"Use your browser on phone, tablet or desktop."}].map((f,i)=><Reveal key={f.title} className="cc3-feature-card"><f.icon size={26}/><div><h3>{f.title}</h3><p>{f.body}</p></div><span>0{i+1}</span></Reveal>)}</div></section><section className="cc3-end"><div className="cc3-end-orb" aria-hidden="true"/><Reveal><span className="cc3-eyebrow"><i/> YOUR NEXT MOVE</span><h2>Between devices.<br/><em>Beyond boundaries.</em></h2><p>Make your first transfer in seconds.</p><Button/></Reveal></section></main><footer className="cc3-footer"><Brand/><span>Designed for the space between.</span><Link to="/about">About <ArrowUpRight size={15}/></Link><span>© 2026 CopyCloud</span></footer></div>}
