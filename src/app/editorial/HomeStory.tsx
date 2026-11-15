import { useRef } from "react";
import { Link } from "react-router";
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, Clipboard, Clock3, Cloud, FileText, FolderOpen, Globe2, Laptop, Link2, QrCode, Smartphone, Download, Image, Paperclip } from "lucide-react";
import "../../styles/home-story.css";

function InView({children,className=""}:{children:React.ReactNode;className?:string}){
  const reduced=useReducedMotion();
  return <motion.div className={className} initial={reduced?false:{opacity:0,y:30}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.18}} transition={{duration:.65,ease:[.22,1,.36,1]}}>{children}</motion.div>;
}
const steps=[
  {number:"01",title:"Collect what matters.",description:"Write a note, paste a link, or attach multiple files in the same draft. No switching modes.",Icon:Paperclip},
  {number:"02",title:"Create one code.",description:"CopyCloud stores the transfer temporarily and creates a six-character code, a link and a QR.",Icon:QrCode},
  {number:"03",title:"Pick it up anywhere.",description:"Enter the code on another device. Copy the message and download the attached files, together or individually.",Icon:Download}
];
function HandoffStory(){
  const ref=useRef<HTMLElement>(null);
  const reduced=useReducedMotion();
  const {scrollYProgress}=useScroll({target:ref,offset:["start start","end end"]});
  const progress=useSpring(scrollYProgress,{stiffness:115,damping:30,restDelta:.001});
  const packetX=useTransform(progress,[0,.2,.65,1],[0,0,100,100]);
  const packetLeft=useTransform(packetX,v=>v+"%");
  const packetOpacity=useTransform(progress,[0,.12,.23,.65,.8,1],[0,0,1,1,0,0]);
  const leftOpacity=useTransform(progress,[0,.28,.65,1],[1,1,.55,.55]);
  const rightOpacity=useTransform(progress,[0,.28,.65,1],[.55,.55,1,1]);
  const messageY=useTransform(progress,[0,.22,.6,1],[18,0,0,0]);
  const receivedScale=useTransform(progress,[0,.58,.75,1],[.97,.97,1,1]);
  return <section ref={ref} className="hs-handoff">
    <div className="hs-sticky ed-width">
      <div className="hs-story-heading"><span className="ed-label">THE COPYCLOUD FLOW / ILLUSTRATION</span><h2>One small code.<br/><span className="ed-script">A whole handoff.</span></h2><p>Follow a transfer from draft to delivery as you scroll.</p></div>
      <div className="hs-story-layout">
        <div className="hs-step-list">{steps.map(({number,title,description,Icon})=><div key={number} className="hs-step"><div className="hs-step-icon"><Icon size={21} strokeWidth={1.6}/></div><div><span>{number} / STEP</span><h3>{title}</h3><p>{description}</p></div></div>)}</div>
        <div className="hs-flow-scene" aria-label="Illustration of a message and two files being sent using a code">
          <div className="hs-scene-top"><span><i/> COPYCLOUD TRANSFER</span><span>CONCEPT DEMO</span></div>
          <div className="hs-device-pair">
            <motion.div className="hs-source" style={reduced?{}:{opacity:leftOpacity}}><div className="hs-device-top"><Laptop size={18}/> Laptop <span>Sender</span></div><motion.div style={reduced?{}:{y:messageY}} className="hs-example-message"><Clipboard size={15}/><div><strong>Weekend plans</strong><small>Here are the photos and details.</small></div></motion.div><div className="hs-example-file"><Image size={16}/><span>photos.zip</span></div><div className="hs-example-file"><FileText size={16}/><span>notes.pdf</span></div><div className="hs-example-code">SAMPLE CODE</div></motion.div>
            <div className="hs-route"><i/><motion.div className="hs-moving-packet" style={reduced?{}:{left:packetLeft,opacity:packetOpacity}}><FileText size={17}/></motion.div><ArrowRight size={18}/></div>
            <motion.div className="hs-target" style={reduced?{}:{opacity:rightOpacity,scale:receivedScale}}><div className="hs-device-top"><Smartphone size={18}/> Phone <span>Receiver</span></div><div className="hs-received-check"><Check size={20}/></div><strong>Content received</strong><small>Message + 2 files</small><div className="hs-phone-lines"><i/><i/><i/></div><div className="hs-example-code">READY TO COPY</div></motion.div>
          </div>
          <div className="hs-scene-progress"><span>PREPARE</span><div><motion.i style={reduced?{scaleX:1}:{scaleX:progress}}/></div><span>RECEIVE</span></div>
        </div>
      </div>
    </div>
  </section>
}
export default function HomeStory(){
  const reduced=useReducedMotion();
  return <>
    <HandoffStory/>
    <section className="hs-manifest ed-width"><InView><span className="ed-label">01 / SHARE WITHOUT COMPROMISING THE FLOW</span><h2>It's not just a file.<br/>It's the <span className="ed-script">whole context.</span></h2><p>Send the screenshot and the explanation. The PDF and the instructions. A link and all the files that go with it. One transfer, no extra steps.</p></InView><div className="hs-manifest-art"><InView className="hs-manifest-card hs-manifest-text"><Clipboard size={27}/><span>MESSAGE</span><strong>Here's everything you need.</strong><div className="hs-lines"><i/><i/><i/></div></InView><InView className="hs-manifest-card hs-manifest-files"><FolderOpen size={27}/><span>ATTACHMENTS</span><strong>Project files</strong><div><FileText size={19}/> document.pdf</div><div><Image size={19}/> reference.png</div></InView><InView className="hs-manifest-join"><span>ONE TRANSFER</span><motion.div animate={reduced?{}:{rotate:[0,-5,5,0]}} transition={{duration:5,repeat:Infinity,repeatDelay:1}}><QrCode size={38}/></motion.div><strong>One code for both.</strong><Link to="/workspace">Try it <ArrowUpRight size={15}/></Link></InView></div></section>
    <section className="hs-devices"><div className="ed-width"><InView className="hs-device-heading"><span className="ed-label">02 / THE BROWSER IS THE BRIDGE</span><h2>Different screens.<br/><span className="ed-script">Same connection.</span></h2><p>From desktop to phone, tablet to laptop, and back again. A modern browser is all you need.</p></InView><div className="hs-device-cards">{[{Icon:Laptop,title:"Desktop",desc:"Prepare a message and drop files into the workspace."},{Icon:Smartphone,title:"Mobile",desc:"Receive a transfer, copy the message and download files."},{Icon:Globe2,title:"Any browser",desc:"Use a code, open a link or scan a QR from another device."}].map(({Icon,title,desc})=><InView key={title} className="hs-device-card"><Icon size={44} strokeWidth={1.3}/><h3>{title}</h3><p>{desc}</p></InView>)}</div></div></section>
    <section className="hs-time ed-width"><InView className="hs-clock"><Clock3 size={70} strokeWidth={1.05}/><div className="hs-clock-ring"/><span>24<span>H</span></span></InView><InView><span className="ed-label">03 / NOT ANOTHER PERMANENT DRIVE</span><h2>Send now.<br/><span className="ed-script">Receive later.</span></h2><p>The recipient doesn't have to be online at the same time. Transfers are available for a 24-hour window using CopyCloud's temporary cloud storage.</p><Link className="ed-outline" to="/how-it-works">How it works <ArrowUpRight size={17}/></Link></InView></section>
    <section className="hs-tools ed-width"><InView><span className="ed-label">04 / THE LITTLE THINGS MATTER</span><h2>Everything you need.<br/><span className="ed-script">Nothing in the way.</span></h2></InView><div className="hs-tool-grid">{[{Icon:Link2,title:"Share a link",desc:"Send one link instead of typing the code."},{Icon:QrCode,title:"Scan a QR",desc:"Open the generated link with your camera."},{Icon:FolderOpen,title:"Keep files together",desc:"Download all attachments, including the message, as a ZIP."},{Icon:Cloud,title:"No sign-up",desc:"Start a transfer without creating an account."}].map(({Icon,title,desc})=><InView key={title} className="hs-tool"><Icon size={26} strokeWidth={1.5}/><h3>{title}</h3><p>{desc}</p></InView>)}</div><Link className="ed-outline" to="/features">Explore all features <ArrowUpRight size={17}/></Link></section>
    <section className="hs-faq-teaser ed-width"><InView><span className="ed-label">05 / BEFORE YOU SEND</span><h2>Good to know.</h2></InView><div>{[["How large can a transfer be?","Up to 40 MB for attachments and an accompanying message."],["Can I send only text?","Yes. Attachments and messages are both optional, but a transfer needs at least one."],["Is this end-to-end encrypted?","No. CopyCloud uses HTTPS and temporary cloud storage; avoid highly sensitive content."]].map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<Link className="ts-link" to="/faq">All questions <ArrowUpRight size={17}/></Link></div></section>
  </>;
}
