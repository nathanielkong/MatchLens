import { abilities, players, teams, teamProfiles, roleForSlot, VERSION, type Player, type Scenario } from './catalog.js';
import { random } from './random.js';
export { teams,players,VERSION,scenarios } from './catalog.js';
export {random} from './random.js';
export type {Scenario} from './catalog.js';
type Point={x:number;y:number};
export type Event={sequence:number;clock:number;period:number;type:string;teamId:string|null;playerId:string|null;possession:number;x:number|null;y:number|null;endX:number|null;endY:number|null;outcome:string|null;details:Record<string,unknown>;homeScore:number;awayScore:number};
export type Frame={sequence:number;clock:number;period:number;ball:Point;positions:{playerId:string;teamId:string;x:number;y:number;speedMps:number;distanceMetres:number}[]};
export type Options={tracking?:boolean;trackingIntervalSeconds?:number;regime?:'standard'|'stress'};
const round=(n:number)=>Math.round(n*1000)/1000;
const clamp=(n:number,lo=0,hi=100)=>Math.max(lo,Math.min(hi,n));
const metres=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*1.05,(a.y-b.y)*.68);
export function generate(seed:number,scenario:Scenario,homeIndex=0,awayIndex=1,options:Options={}) {
 const rng=random(seed), pick=<T>(xs:T[])=>xs[Math.floor(rng()*xs.length)];
 const home=teams[homeIndex],away=teams[awayIndex];
 if(!home||!away||home.id===away.id)throw new Error('Two distinct teams required');
 const roster=[home,away].map(t=>players.filter(p=>p.teamId===t.id));
 const active=roster.map(r=>r.slice(0,11));
 const profiles=[teamProfiles[homeIndex],teamProfiles[awayIndex]].map(p=>({...p}));
 if(scenario==='low_block')profiles[1].pressing=.22;
 if(scenario==='home_pressure')profiles[0].pressing=.9;
 if(scenario==='away_pressure')profiles[1].pressing=.9;
 if(scenario==='counterattack'){profiles[1].directness=.92;profiles[1].pressing=.32;}
 const stress=options.regime==='stress';
 const strength=profiles.map(p=>p.strength);
 const events:Event[]=[],frames:Frame[]=[];
 const added=[60+Math.floor(rng()*4)*60,120+Math.floor(rng()*5)*60];
 const firstEnd=2700+added[0],duration=firstEnd+2700+added[1];
 let period=1,clock=0,side=0,possession=1,score=[0,0],ball:Point={x:50,y:50};
 let holder=active[0][9],previousPass:{playerId:string;sequence:number}|null=null;
 const slots=new Map(roster.flatMap(r=>r.map((p,i)=>[p.id,i] as const)));
 const enteredAt=new Map<string,number>(roster.flatMap(r=>r.slice(0,11).map(p=>[p.id,0] as const)));
 const positions=new Map<string,Point>(),speeds=new Map<string,number>(),distance=new Map<string,number>();
 const yellows=new Set<string>(),substituted=new Set<string>();
 const tactics=['balanced',scenario==='low_block'?'protect_lead':'balanced'];const subs=[0,0],nextSub=[firstEnd+700+rng()*600,firstEnd+700+rng()*600];
 const cardSide=rng()<.5?0:1,redTime=firstEnd+300+Math.floor(rng()*1400);let redDone=false,shiftDone=false;
 const direction=(s:number)=>s===0?(period===1?1:-1):(period===1?-1:1);
 const local=(pt:Point,s:number):Point=>direction(s)===1?{...pt}:{x:100-pt.x,y:100-pt.y};
 const global=(pt:Point,s:number)=>local(pt,s);
 const teamSide=(p:Player)=>p.teamId===home.id?0:1;
 const outfield=(s:number)=>active[s].filter(p=>p.position!=='GK');
 const weighted=<T>(xs:T[],weight:(x:T)=>number)=>{let n=rng()*xs.reduce((sum,x)=>sum+weight(x),0);return xs.find(x=>(n-=weight(x))<=0)??xs.at(-1)!;};
 const anchor=(p:Player,s:number):Point=>{
   const idx=slots.get(p.id)!;
   const anchors=profiles[s].formation==='4-3-3'?[[7,50],[27,12],[25,38],[25,62],[27,88],[48,24],[43,50],[48,76],[69,15],[74,50],[69,85]]:[[7,50],[27,12],[25,38],[25,62],[27,88],[43,33],[43,67],[62,50],[65,15],[77,50],[65,85]];
   const [ax,ay]=anchors[idx];
   const target={x:clamp(ax+(local(ball,s).x-50)*(p.position==='GK'?.05:.30)+(tactics[s]==='attack'?8:(tactics[s]==='protect_lead'||tactics[s]==='compact')?-8:0),3,95),y:ay};
   return global(target,s);
 };
 const resetPositions=()=>{for(const s of [0,1])for(const p of active[s]){positions.set(p.id,anchor(p,s));speeds.set(p.id,0);}};
 resetPositions();
 const emit=(type:string,outcome:string|null=null,details:Record<string,unknown>={},actor:Player|null=holder,end:Point|null=null,at:Point=ball)=>{
   const s=actor?teamSide(actor):side,a=local(at,s),b=end?local(end,s):null;
   const event:Event={sequence:events.length+1,clock,period,type,teamId:actor?.teamId??null,playerId:actor?.id??null,possession,
    x:actor?round(a.x):null,y:actor?round(a.y):null,endX:b?round(b.x):null,endY:b?round(b.y):null,outcome,
    details:{...details,possessionTeamId:[home.id,away.id][side],attackDirection:direction(s),periodClockSeconds:clock-(period===1?0:firstEnd)},homeScore:score[0],awayScore:score[1]};
   events.push(event);return event.sequence;
 };
 let lastFrameClock=-Infinity;
 const sample=()=>{if(!options.tracking)return;if(clock-lastFrameClock<(options.trackingIntervalSeconds??0)&&!['halftime','fulltime','kickoff'].includes(events.at(-1)!.type))return;lastFrameClock=clock;frames.push({sequence:events.length,clock,period,ball:{x:round(ball.x),y:round(ball.y)},positions:[0,1].flatMap(s=>active[s].map(p=>({playerId:p.id,teamId:p.teamId,x:round(positions.get(p.id)!.x),y:round(positions.get(p.id)!.y),speedMps:round(speeds.get(p.id)??0),distanceMetres:round(distance.get(p.id)??0)})))});};
 const advance=(seconds:number,dead=false)=>{
   const end=period===1?firstEnd:duration,dt=Math.min(seconds,end-clock);if(dt<=0)return false;
   clock+=dt;
   for(const s of [0,1])for(const p of active[s]) {
    const old=positions.get(p.id)??anchor(p,s);let target=anchor(p,s);
    const defender=s!==side&&p.position!=='GK';
    if(defender&&metres(old,ball)<(profiles[s].pressing*16+8))target={...ball};
    if(p.id===holder.id&&!dead)target={...ball};
    target={x:clamp(target.x+(rng()-.5)*5),y:clamp(target.y+(rng()-.5)*5)};
    const fatigue=1-((clock-(enteredAt.get(p.id)??0))/duration)*(.22*(1-abilities.get(p.id)!.stamina));
    const max=abilities.get(p.id)!.pace*fatigue*(dead?.25:.75)*dt,d=metres(old,target),fraction=d?Math.min(1,max/d):0;
    const next={x:old.x+(target.x-old.x)*fraction,y:old.y+(target.y-old.y)*fraction};
    const moved=metres(old,next);positions.set(p.id,next);speeds.set(p.id,moved/dt);distance.set(p.id,(distance.get(p.id)??0)+moved);
   }
   return clock<end;
 };
 const changePossession=(newSide:number,at:Point,newHolder?:Player)=>{
   side=newSide;possession++;ball={...at};holder=newHolder??weighted(outfield(side),p=>1/(4+metres(positions.get(p.id)!,ball)));
   previousPass=null;
 };
 const restart=(type:string,s:number,pt:Point,cause:number)=>{
   changePossession(s,global(pt,s),type==='goal_kick'?active[s].find(p=>p.position==='GK'):undefined);
   advance(type==='kickoff'?25:12+Math.floor(rng()*12),true);
   emit(type,'restart',{relatedEventSequence:cause});
 };
 const tacticalChange=(s:number,tactic:string,reason:string)=>{
   tactics[s]=tactic;emit('tactic_change',null,{tactic,reason,formation:profiles[s].formation},active[s].find(p=>p.position==='MF')!);
 };
 const pressureOnBall=()=>{
   const defenders=outfield(1-side),defender=defenders.reduce((a,b)=>metres(positions.get(a.id)!,ball)<metres(positions.get(b.id)!,ball)?a:b);
   const gap=metres(positions.get(defender.id)!,ball);
   const intensity=clamp((1-gap/22)*(.55+profiles[1-side].pressing*.5),0,1);
   return {defender,gap,intensity};
 };
 emit('kickoff','restart');sample();
 for(period=1;period<=2;period++) {
   const end=period===1?firstEnd:duration;
   if(period===2){clock=firstEnd;side=1;possession++;ball={x:50,y:50};holder=pick(outfield(1).filter(p=>p.position==='FW'));previousPass=null;resetPositions();emit('kickoff','restart');sample();}
   while(clock<end-35) {
    for(const s of [0,1]) {
     if(period===2&&subs[s]<3&&clock>=nextSub[s]) {
      const candidates=outfield(s).filter(p=>!substituted.has(p.id));
      const outgoing=weighted(candidates,p=>p.position==='FW'?(score[s]<score[1-s]?3:1):p.position==='DF'?(score[s]>score[1-s]?3:1):2);
      const incoming=pick(roster[s].filter(p=>p.position===outgoing.position&&!active[s].includes(p)&&!substituted.has(p.id)));
      if(incoming){emit('substitution',null,{outPlayerId:outgoing.id,inPlayerId:incoming.id,reason:'fresh_legs',role:roleForSlot(profiles[s].formation,slots.get(outgoing.id)!)},outgoing);substituted.add(outgoing.id);active[s][active[s].indexOf(outgoing)]=incoming;enteredAt.set(incoming.id,clock);slots.set(incoming.id,slots.get(outgoing.id)!);positions.set(incoming.id,positions.get(outgoing.id)!);speeds.set(incoming.id,0);if(holder.id===outgoing.id)holder=incoming;previousPass=null;subs[s]++;}
      nextSub[s]=clock+400+rng()*500;
     }
     if(clock>firstEnd+900) {
      const desired=score[s]<score[1-s]?'attack':score[s]>score[1-s]?'protect_lead':'balanced';
      if(tactics[s]!==desired)tacticalChange(s,desired,'score_and_time');
     }
    }
    if(scenario==='second_half_shift'&&period===2&&!shiftDone){tacticalChange(1,'attack','halftime_adjustment');shiftDone=true;}
    if(scenario==='red_card'&&!redDone&&clock>=redTime) {
      const offender=pick(outfield(cardSide));const victim=pick(outfield(1-cardSide));
      const f=emit('foul','committed',{victimId:victim.id},offender);
      emit('red_card','sent_off',{relatedEventSequence:f,reason:'serious_foul'},offender);
      active[cardSide]=active[cardSide].filter(p=>p.id!==offender.id);substituted.add(offender.id);redDone=true;
      restart('free_kick',1-cardSide,{x:55,y:45},f);tacticalChange(cardSide,'compact','player_sent_off');sample();continue;
    }
    const skill=abilities.get(holder.id)!,a=local(ball,side),p=pressureOnBall();
    const pressureSeq=p.intensity>.25?emit('pressure','applied',{targetPlayerId:holder.id,distanceMetres:round(p.gap),intensity:round(p.intensity),targetX:round(local(ball,1-side).x),targetY:round(local(ball,1-side).y)},p.defender,null,positions.get(p.defender.id)!):null;
    const profile=profiles[side];
    const direct=clamp(profile.directness+(tactics[side]==='attack'?.18:tactics[side]==='protect_lead'?-.15:0)+(scenario==='open_game'?.15:0),.1,.95);
    const attackBoost=(scenario==='home_pressure'&&side===0||scenario==='away_pressure'&&side===1?1.15:1)*(active[side].length/11)*(1+(strength[side]-1)*.3);
    const action=rng(),dt=(stress?4:3)+Math.floor(rng()*6);if(!advance(dt))break;
    const context={pressure:round(p.intensity),pressureEventSequence:pressureSeq,durationSeconds:dt};
    if(a.x>67&&Math.abs(a.y-50)<34&&action<.12*attackBoost) {
      const dist=metres(a,{x:100,y:50}), angle=Math.atan2(7.32*Math.max(.1,(100-a.x)*1.05),dist*dist-3.66**2);
      const xg=clamp(.36*Math.exp(-dist/19)*(1-p.intensity*.3)*(1+angle*.45),.012,.65);
      const keeper=active[1-side].find(p=>p.position==='GK')!;
      const goal=rng()<clamp(xg*(.8+skill.finishing*.35)*(1.1-abilities.get(keeper.id)!.keeping*.15),.005,.85);
      const outcome=goal?'goal':rng()<.22?'blocked':rng()<.62?'saved':'off_target';
      if(goal)score[side]++;
      const keyPass=previousPass&&previousPass.playerId!==holder.id?previousPass:null;
      const shot=emit('shot',outcome,{...context,xg:round(xg),xgSource:'synthetic-geometry-pressure-v2',distanceMetres:round(dist),angleRadians:round(angle),bodyPart:rng()<.14?'head':'foot',shotSpeedKmh:round(65+rng()*45),goalkeeperId:keeper.id,
       ...(keyPass?{keyPassSequence:keyPass.sequence,keyPassPlayerId:keyPass.playerId,...(goal?{assistPlayerId:keyPass.playerId,assistEventSequence:keyPass.sequence}:{})}:{})},holder,global({x:outcome==='blocked'?Math.min(99,a.x+4):100,y:outcome==='off_target'?(rng()<.5?35+rng()*9:56+rng()*9):47+rng()*6},side));
      previousPass=null;
      if(goal){restart('kickoff',1-side,{x:50,y:50},shot);}
      else if(outcome==='saved') {
       const held=rng()<(stress?.60:.72);emit('save',held?'held':'parried',{shotSequence:shot},keeper,null,global({x:98,y:50},side));
       if(held){changePossession(1-side,global({x:6,y:50},1-side),keeper);}
       else if(rng()<.5){restart('corner',side,{x:99,y:rng()<.5?1:99},shot);}
       else {ball=global({x:88,y:40+rng()*20},side);holder=pick(outfield(side));emit('recovery','won',{relatedEventSequence:shot});}
      } else if(outcome==='blocked'){
       emit('block','blocked',{shotSequence:shot},p.defender);if(rng()<.45)restart('corner',side,{x:99,y:rng()<.5?1:99},shot);
       else{changePossession(1-side,ball,p.defender);emit('recovery','won',{relatedEventSequence:shot});}
      }else restart('goal_kick',1-side,{x:6,y:50},shot);
    } else if(action<.77||holder.position==='GK') {
      const receiver=weighted(active[side].filter(q=>q.id!==holder.id),q=>{
       const pos=local(positions.get(q.id)!,side),progress=pos.x-a.x;
       return Math.max(.04,(q.position==='GK'?.08:1)*(progress>0?1+direct*2:1.8-direct)/(1+Math.abs(pos.y-a.y)/45));
      });
      const receiverPos=local(positions.get(receiver.id)!,side);
      const target={x:clamp(receiverPos.x+(receiver.position==='FW'?direct*16:direct*5)+(rng()-.5)*8,2,98),y:clamp(receiverPos.y+(rng()-.5)*8,2,98)};
      const targetGlobal=global(target,side),dist=metres(ball,targetGlobal),difficulty=clamp(.06+dist/120+p.intensity*.28,.05,.9);
      const complete=rng()<clamp(.87+skill.passing*.19-difficulty*.4-(11-active[side].length)*.014-(stress?.035:0),.45,.98);
      const pass=emit('pass',complete?'complete':'incomplete',{...context,recipientId:receiver.id,difficulty:round(difficulty),distanceMetres:round(dist),progressiveMetres:round((target.x-a.x)*1.05),ballSpeedKmh:round(30+dist*.65),technique:dist>30?'long':'short'},holder,targetGlobal);
      ball=targetGlobal;
      if(complete){previousPass={playerId:holder.id,sequence:pass};holder=receiver;}
      else if(rng()<.22){restart('throw_in',1-side,{x:100-target.x,y:target.y<50?1:99},pass);}
      else {changePossession(1-side,ball,p.defender);emit('interception','won',{relatedEventSequence:pass,pressureEventSequence:pressureSeq});}
    } else if(action<.94) {
      const progress=Math.min((4+rng()*10)*attackBoost*(scenario==='counterattack'?1.3:1),skill.pace*dt/1.3),target=global({x:clamp(a.x+progress,2,98),y:clamp(a.y+(rng()-.5)*12,2,98)},side);
      const dist=metres(ball,target);const carry=emit('carry','complete',{...context,distanceMetres:round(dist),speedMps:round(dist/dt)},holder,target);ball=target;
      // The same player keeps the ball; a preceding pass can remain a key pass after a short carry.
      if(dist>12)previousPass=null;
      if(rng()<p.intensity*(.12+abilities.get(p.defender.id)!.defending*.18)){changePossession(1-side,ball,p.defender);emit('tackle','won',{relatedEventSequence:carry,pressureEventSequence:pressureSeq});}
    } else {
      const victim=holder,defender=p.defender;const foul=emit('foul','committed',{victimId:victim.id,...context},defender);
      if(rng()<(yellows.has(defender.id)?.018:.10)){
       emit('yellow_card','booked',{relatedEventSequence:foul},defender);
       if(yellows.has(defender.id)&&active[1-side].length>7){emit('red_card','sent_off',{relatedEventSequence:foul,reason:'second_yellow'},defender);active[1-side]=active[1-side].filter(q=>q.id!==defender.id);substituted.add(defender.id);}else yellows.add(defender.id);
      }
      restart('free_kick',side,a,foul);
    }
    sample();
   }
   advance(end-clock,true);clock=end;emit(period===1?'halftime':'fulltime',null,{addedSeconds:added[period-1]},null);sample();
 }
 return {home,away,roster,events,frames,strength,score,seed,scenario,duration,firstEnd,added,profiles,
  metadata:{coordinateFrame:'actor_attacking_left_to_right',trackingCoordinateFrame:'fixed_pitch_normalized_0_100',pitchLengthMetres:105,pitchWidthMetres:68,trackingKind:'synthetic_event_sampled',trackingIntervalSeconds:options.trackingIntervalSeconds??0,homeFormation:profiles[0].formation,awayFormation:profiles[1].formation,addedSeconds:added,weather:stress?'rain':'clear'},distance};
}
