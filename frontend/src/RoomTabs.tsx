export const roomViews=[['overview','Overview'],['analysis','Analysis'],['chat','Ask MatchLens'],['producer','Producer desk'],['events','Events']] as const;
export type RoomView=typeof roomViews[number][0];
export function RoomTabs({value,onChange}:{value:RoomView;onChange:(view:RoomView)=>void}){
 return <div className="room-tabs" role="tablist" aria-label="Match room tools">{roomViews.map(([id,label],index)=><button key={id} id={`room-tab-${id}`} type="button" role="tab" aria-selected={value===id} aria-controls={`room-panel-${id}`} tabIndex={value===id?0:-1} onClick={()=>onChange(id)} onKeyDown={e=>{
  const next=e.key==='Home'?0:e.key==='End'?roomViews.length-1:e.key==='ArrowRight'?(index+1)%roomViews.length:e.key==='ArrowLeft'?(index+roomViews.length-1)%roomViews.length:null;
  if(next!==null){e.preventDefault();onChange(roomViews[next][0]);document.getElementById(`room-tab-${roomViews[next][0]}`)?.focus();}
 }}>{label}</button>)}</div>;
}
