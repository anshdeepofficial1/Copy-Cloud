import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
export default function CodePreview({value}:{value:string}){
  const result=useMemo(()=>value.length>100000?null:hljs.highlightAuto(value),[value]);
  return <div className="ts-code-preview"><div>{result?.language?"Detected language: "+result.language:"Plain text"}</div><pre>{result?<code dangerouslySetInnerHTML={{__html:result.value}}/>:<code>{value}</code>}</pre></div>;
}
