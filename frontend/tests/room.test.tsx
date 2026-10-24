import test,{after} from 'node:test';import assert from 'node:assert/strict';import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/match-room?preview=sample',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Element:dom.window.Element,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true,getComputedStyle:dom.window.getComputedStyle});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
dom.window.scrollTo=()=>{};
dom.window.matchMedia=(query:string)=>({matches:query.includes(': reduce)'),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}) as never;
class Observer{observe(){}disconnect(){}unobserve(){}}
Object.assign(globalThis,{IntersectionObserver:Observer,ResizeObserver:Observer,requestAnimationFrame:(cb:FrameRequestCallback)=>setTimeout(()=>cb(performance.now()),16),cancelAnimationFrame:clearTimeout});
dom.window.HTMLCanvasElement.prototype.getContext=(()=>null) as never;
const {default:MatchRoom}=await import('../src/MatchRoom');
const {AIJobs,useAIJobs}=await import('../src/AIJobs');
after(async()=>{(await import('../src/StudioMotion')).ScrollTrigger.disable();(await import('gsap')).gsap.ticker.sleep();dom.window.close();});
test('the sample puts replay before tools, switches accessible tabs and preserves mounted chat',async()=>{
 const root=createRoot(document.getElementById('root')!);try{await act(async()=>{root.render(<MatchRoom/>);});}catch(e){console.error('Mount failed',e);await act(async()=>root.unmount());throw e;}
 for(let n=0;n<30&&!document.querySelector('[role=tablist]');n++)await act(async()=>{await new Promise(r=>setTimeout(r,20));});
 try{
  const pitch=document.querySelector('[aria-label="Pitch and replay controls"]')!,tabs=document.querySelector('[role=tablist]')!;assert.ok(pitch&&tabs);assert.ok(pitch.compareDocumentPosition(tabs)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  const chat=document.querySelector('#room-tab-chat') as HTMLButtonElement;await act(async()=>chat.click());assert.equal(chat.getAttribute('aria-selected'),'true');assert.equal((document.querySelector('#room-panel-chat') as HTMLElement).hidden,false);
  const input=document.querySelector('#match-question');await act(async()=>(document.querySelector('#room-tab-producer') as HTMLButtonElement).click());assert.equal((document.querySelector('#room-panel-chat') as HTMLElement).hidden,true);assert.equal(document.querySelector('#match-question'),input);
  await act(async()=>{document.querySelector('#room-tab-producer')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});assert.equal(document.activeElement?.id,'room-tab-events');
 }finally{await act(async()=>root.unmount());}
});
test('the shared AI slot disables other tools and releases after the complete job',async()=>{
 let finish:(()=>void)|null=null,starts=0;
 function Harness(){const jobs=useAIJobs();return <>{['Summary','Recap'].map(label=><button key={label} disabled={!!jobs.active} onClick={()=>{const done=jobs.begin(label);if(done){starts++;finish=done;}}}>{label}</button>)}</>;}
 const root=createRoot(document.getElementById('root')!);await act(async()=>root.render(<AIJobs><Harness/></AIJobs>));
 try{const buttons=[...document.querySelectorAll('button')];await act(async()=>{buttons[0].click();buttons[1].click();});assert.equal(starts,1);assert.ok(buttons.every(b=>b.disabled));await act(async()=>{(finish as unknown as ()=>void)();});assert.ok(buttons.every(b=>!b.disabled));}finally{await act(async()=>root.unmount());}
});
