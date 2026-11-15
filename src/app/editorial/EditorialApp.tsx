import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowDownLeft, ArrowUpRight, ArrowRight, Clock3, Copy, Download, FileText, Github, Globe2, History, Instagram, Laptop, Linkedin, Menu, Moon, QrCode, Send, Smartphone, Sun, X } from "lucide-react";
import { Toaster } from "sonner";
import { SendStudio, ReceiveStudio, HistoryStudio } from "./TransferStudio";
import { Chatbot } from "../components/Chatbot";
import "../../styles/editorial.css";

type Tab = "send" | "retrieve" | "history" | "about";
const socials = [
  { label:"GitHub", url:"https://github.com/anshdeepofficial1", Icon:Github },
  { label:"LinkedIn", url:"https://www.linkedin.com/in/anshdeepofficial1/", Icon:Linkedin },
  { label:"Instagram", url:"https://www.instagram.com/anshdeepofficial1/", Icon:Instagram },
  { label:"Portfolio", url:"https://anshdeepofficial1.vercel.app/", Icon:ArrowUpRight },
];
const pageRoutes: Record<Tab,string> = {send:"/workspace",retrieve:"/receive",history:"/history",about:"/about"};
const faqs = [
  ["How do I send something?", "Choose text or files, generate a six-character code, and share the code, link or QR. The recipient enters the code in Receive."],
  ["Can I send several files?", "Yes. Select or drop multiple files, up to 40 MB total per transfer. Recipients can download individual files or a ZIP."],
  ["Do both devices need to be online at once?", "No. CopyCloud temporarily stores your transfer in its cloud backend, so the recipient can retrieve it later within the 24-hour window."],
  ["Do I need an account?", "No. Use the website directly on a modern browser. Transfer history is stored locally on the device."],
  ["Can I share confidential information?", "Transfers use HTTPS, but this version does not provide end-to-end encryption or password protection. Do not use it for highly sensitive data."],
];
function readCode(search: string) {
  const params = new URLSearchParams(search);
  const value = (params.get("code") || params.get("retrieve") || "").toUpperCase().replace(/[^A-Z0-9]/g,"");
  return value.length === 6 ? value : undefined;
}
export default function EditorialApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname.replace(/\/$/,"") || "/";
  const prefill = readCode(location.search);
  const tab: Tab | undefined = pathname==="/workspace" || pathname==="/send" ? "send" : pathname==="/receive" || pathname==="/retrieve" ? "retrieve" : pathname==="/history" ? "history" : pathname==="/about" ? "about" : undefined;
  const home = pathname === "/";
  const [menu,setMenu] = useState(false);
  const [dark,setDark] = useState(()=>localStorage.getItem("cc_editorial_theme")==="dark");
  const [progress,setProgress] = useState(0);
  const reduced = useReducedMotion();
  useEffect(()=>{
    if(home && prefill) navigate("/receive?code="+encodeURIComponent(prefill),{replace:true});
  },[home,prefill,navigate]);
  useEffect(()=>{window.scrollTo(0,0);setMenu(false);},[pathname]);
  useEffect(()=>{
    localStorage.setItem("cc_editorial_theme",dark?"dark":"light");
    const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if(meta) meta.content=dark?"#121210":"#f2eee7";
  },[dark]);
  useEffect(()=>{
    const update=()=>setProgress(window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight));
    update();window.addEventListener("scroll",update,{passive:true});
    window.addEventListener("resize",update);
    return()=>{window.removeEventListener("scroll",update);window.removeEventListener("resize",update);};
  },[]);
  const open = (next:Tab,code?:string) => {
    setMenu(false);
    navigate(pageRoutes[next]+(code?"?code="+encodeURIComponent(code):""));
  };
  const reveal = reduced ? {} : {initial:{opacity:0,y:24},whileInView:{opacity:1,y:0},viewport:{once:true,amount:0.15},transition:{duration:0.65,ease:"easeOut" as const}};
  return <div className="cc-editorial" data-dark={dark?"true":"false"}>
    <Toaster position="top-right" richColors />
    <div className="ed-scroll-progress" style={{transform:"scaleX("+progress+")"}} />
    <header className="ed-header">
      <Link className="ed-brand" to="/" onClick={()=>setMenu(false)}><img src="/logo.png" alt="" /><span>CopyCloud<span className="ed-brand-dot">.</span></span></Link>
      <nav className={menu?"ed-nav is-open":"ed-nav"} aria-label="Main navigation">
        <Link to="/workspace" aria-current={tab==="send"?"page":undefined}>Workspace</Link><Link to="/receive" aria-current={tab==="retrieve"?"page":undefined}>Receive</Link><Link to="/history" aria-current={tab==="history"?"page":undefined}>History</Link><Link to="/features">Features</Link><Link to="/how-it-works">How it works</Link><Link to="/faq">FAQ</Link><Link to="/about">About</Link>
      </nav>
      <div className="ed-header-actions"><button className="ed-icon" aria-label={dark?"Light theme":"Dark theme"} onClick={()=>setDark(!dark)}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><button className="ed-button ed-header-cta" onClick={()=>open("send")}>Start sharing <ArrowUpRight size={17}/></button><button className="ed-icon ed-menu" aria-expanded={menu} aria-label="Toggle navigation" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div>
    </header>
    <main id="top">
      {home && <><section className="ed-hero ed-width"><div className="ed-stream" aria-hidden="true">{Array.from({length:26},(_,i)=><i key={i} style={{left:((i*37+11)%100)+"%",top:((i*19+17)%100)+"%",animationDelay:-(i%9)*.7+"s",animationDuration:(5+i%6)+"s"}}/>)}<span className="ed-stream-file ed-stream-file-a"><FileText size={15}/> document.pdf</span><span className="ed-stream-file ed-stream-file-b"><Copy size={15}/> clipboard.txt</span><span className="ed-stream-file ed-stream-file-c"><Download size={15}/> ready to receive</span></div>
        <div className="ed-hero-copy">
          <motion.div {...reveal} className="ed-eyebrow"><i/> INSTANT CROSS-DEVICE SHARING</motion.div>
          <motion.h1 {...reveal}>Share across devices.<br/><span className="ed-script">Without the hassle.</span></motion.h1>
          <motion.p {...reveal}>Move what matters between your phone, laptop and tablet. One short code connects them all — no account, no app to download.</motion.p>
          <div className="ed-hero-actions"><button className="ed-button" onClick={()=>open("send")}>Open workspace <ArrowUpRight size={20}/></button><button className="ed-outline" onClick={()=>open("retrieve")}>Receive content <ArrowDownLeft size={19}/></button></div>
          <div className="ed-trust"><span><i/> No sign-up</span><span>40 MB / transfer</span><span>24-hour window</span></div>
        </div>
      </section>
      <section className="ed-home-preview ed-width"><div className="ed-preview-caption"><span className="ed-label">A LOOK AT THE WORKSPACE</span><h2>One code.<br/><span className="ed-script">Every device.</span></h2><p>Send text or multiple files, then access them from any browser using the code or QR.</p><button className="ed-button" onClick={()=>open("send")}>Open workspace <ArrowUpRight size={19}/></button></div>        <motion.div {...reveal} className="ed-hero-visual">
          <div className="ed-window"><div className="ed-window-bar"><span className="ed-window-dots"><i/><i/><i/></span><span>copycloud.me / workspace</span><span>01 — 03</span></div>
            <div className="ed-diagram"><div className="ed-diagram-label">A SIMPLE HANDOFF <span>01 / 03</span></div><div className="ed-device-row"><div className="ed-device"><Laptop size={43} strokeWidth={1.5}/><span>Send</span></div><div className="ed-route"><div className="ed-packet"><Copy size={19}/></div><i/><ArrowRight size={16}/></div><div className="ed-device"><Smartphone size={43} strokeWidth={1.5}/><span>Receive</span></div></div><div className="ed-diagram-caption">Text, files and links. From here to there.</div></div>
            <div className="ed-window-bottom"><span><FileText size={16}/> Text & files</span><span><QrCode size={16}/> Code & QR</span><span><Clock3 size={16}/> 24 hours</span></div>
          </div>
          <div className="ed-float-tag"><QrCode size={22}/><div><strong>Share a code.</strong><small>Skip the email to yourself.</small></div><ArrowUpRight size={16}/></div>
        </motion.div>
</section>
      <div className="ed-strip"><div className="ed-width"><span>BUILT FOR EVERY DEVICE</span><span>PHONE <i/> TABLET <i/> LAPTOP <i/> DESKTOP</span><Link to="/workspace" aria-label="Open workspace"><ArrowUpRight size={19}/></Link></div></div><section className="ed-home-statement ed-width"><span className="ed-label">SHARING WITHOUT THE DETOURS</span><h2>From here <span className="ed-script">to there.</span></h2><p>CopyCloud connects your devices through a short code. Send on one device, receive on another, and get back to what you were doing.</p><div className="ed-hero-actions"><Link className="ed-outline" to="/features">Explore features <ArrowUpRight size={17}/></Link><Link className="ed-outline" to="/how-it-works">See how it works <ArrowUpRight size={17}/></Link></div></section></>}
      {tab==="send"&&<SendStudio/>}
      {tab==="retrieve"&&<ReceiveStudio prefill={prefill}/>}
      {tab==="history"&&<HistoryStudio/>}
      {tab==="about"&&<section className="ed-width ts-page"><div className="ts-heading"><div><span className="ed-label">ABOUT THE PROJECT</span><h1>Meet <span className="ed-script">CopyCloud.</span></h1><p>Sharing across devices, without an account.</p></div></div><div className="ed-about-panel"><span className="ed-label">INDEPENDENT DEVELOPMENT</span><h3>Sharing, simplified.</h3><p>CopyCloud is a project by Anshdeep Singh. It helps you move text and files between devices using a short transfer code.</p><a href="https://github.com/anshdeepofficial1/Copy-Cloud" target="_blank" rel="noreferrer">Explore the source <ArrowUpRight size={15}/></a><div className="ed-socials">{socials.map(({label,url,Icon})=><a key={label} aria-label={label} href={url} target="_blank" rel="noreferrer"><Icon size={19}/></a>)}</div></div></section>}
      {(pathname==="/how-it-works" || pathname==="/getting-started") && <section id="how" className="ed-how ed-width"><motion.div {...reveal} className="ed-section-head"><div><span className="ed-label">{pathname==="/getting-started"?"GET STARTED":"HOW IT WORKS"}</span><h2>{pathname==="/getting-started"?"Your first transfer.":"Three simple steps."}<br/><span className="ed-script">Ready to go.</span></h2></div><p>From your current device to the next, without unnecessary steps.</p></motion.div><div className="ed-steps">{[{n:"01",Icon:FileText,title:"Add.",desc:"Paste a note, link or code snippet, or choose one or more files."},{n:"02",Icon:QrCode,title:"Share.",desc:"Generate your transfer code and share it as text, a link or a QR."},{n:"03",Icon:Download,title:"Receive.",desc:"Enter the code on another device, then copy the text or download the files."}].map(({n,Icon,title,desc})=><motion.article {...reveal} key={n}><span>{n} / STEP</span><div className="ed-step-icon"><Icon size={39} strokeWidth={1.5}/></div><h3>{title}</h3><p>{desc}</p></motion.article>)}</div><div className="ed-page-actions"><button className="ed-button" onClick={()=>open("send")}>Start sharing <ArrowUpRight size={18}/></button><button className="ed-outline" onClick={()=>open("retrieve")}>Receive a transfer <ArrowUpRight size={18}/></button></div></section>}
      {pathname==="/features" && <section id="features" className="ed-features"><div className="ed-width"><motion.div {...reveal} className="ed-section-head"><div><span className="ed-label">03 / MADE FOR REAL LIFE</span><h2>Small details.<br/>Big difference<span>.</span></h2></div><p>Designed around the everyday things you need to move between devices.</p></motion.div><div className="ed-feature-grid">{[{Icon:Globe2,title:"Any modern browser",text:"Share between Android, iOS, Windows, macOS and Linux."},{Icon:Clock3,title:"Send now. Retrieve later.",text:"Your recipient can open the transfer within its 24-hour window."},{Icon:QrCode,title:"Skip the typing",text:"Scan the generated QR code or open the shared link to retrieve."},{Icon:History,title:"Local history",text:"Revisit recent transfers on the same device, or clear your history."}].map(({Icon,title,text})=><motion.article {...reveal} key={title}><Icon size={28} strokeWidth={1.5}/><h3>{title}</h3><p>{text}</p></motion.article>)}</div></div></section>}
      {pathname==="/faq" && <section id="faq" className="ed-faq ed-width"><div><span className="ed-label">04 / GOOD TO KNOW</span><h2>Questions<span>?</span></h2><p>The essentials before your next transfer.</p></div><div>{faqs.map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>}
      {!tab && <section className="ed-final"><div className="ed-width"><div><span className="ed-label">THE NEXT MOVE IS YOURS.</span><h2>Send it<span>.</span></h2></div><button className="ed-button" onClick={()=>open("send")}>Start a transfer <ArrowUpRight size={22}/></button></div></section>}
    </main>
    <footer className="ed-footer ed-width"><div><Link className="ed-brand" to="/"><img src="/logo.png" alt=""/><span>CopyCloud.</span></Link><p>Independent project by Anshdeep Singh.</p></div><div className="ed-footer-links"><Link to="/features">Features</Link><Link to="/how-it-works">How it works</Link><Link to="/faq">FAQ</Link><a href="/?view=classic">Classic UI</a><a href="/?view=glass">Glass UI</a><a href="https://github.com/anshdeepofficial1/Copy-Cloud" target="_blank" rel="noreferrer">Source code</a><div className="ed-socials">{socials.map(({label,url,Icon})=><a key={label} aria-label={label} href={url} target="_blank" rel="noreferrer"><Icon size={18}/></a>)}</div></div><small>© 2026 CopyCloud</small></footer>
    <Chatbot/>
  </div>;
}
