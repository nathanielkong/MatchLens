import { random } from './random.js';
export const VERSION = '2.0.0';
export const teams = ['MatchLens Velora','MatchLens Orvian','MatchLens Talvex','MatchLens Nuvora','MatchLens Kirevo','MatchLens Zenvik','MatchLens Elvora','MatchLens Rovexa'].map((name,i)=>({id:`team-${i+1}`,name,color:['#2563eb','#ef4444','#16a34a','#a855f7','#f59e0b','#06b6d4','#ec4899','#64748b'][i]}));
const first=['Alex','Morgan','Taylor','Jordan','Casey','Riley','Jamie','Sam','Charlie','Robin','Avery','Finley','Drew','Quinn','Reese','Blake','Ellis','Cameron','Hayden','Skyler'];
const last=['Vale','Brook','Ashford','Marsh','Fenwick','Hale','Reed','Alder'];
export type Position='GK'|'DF'|'MF'|'FW';
export type Player={id:string;teamId:string;name:string;position:Position;shirt:number};
export const players:Player[]=teams.flatMap((t,i)=>first.map((name,j)=>({id:`${t.id}-p${j+1}`,teamId:t.id,name:`${name} ${last[i]}`,shirt:j+1,position:j===0||j===11?'GK':j<5||j===12||j===16?'DF':j<8||j===13||j===17||j===18?'MF':'FW'})));
export type Skills={passing:number;finishing:number;defending:number;keeping:number;pace:number;stamina:number};
export const abilities=new Map(players.map((p,i)=>{
 const r=random(710000+i);const base=()=>.42+r()*.45;
 return [p.id,{passing:base()+(p.position==='MF'?.08:0),finishing:base()+(p.position==='FW'?.1:-.12),defending:base()+(p.position==='DF'?.1:-.1),keeping:p.position==='GK'?.55+r()*.35:.1,pace:6.2+r()*2.1,stamina:.65+r()*.3}] as const;
}));
export const styles=['possession','high_press','counterattack','direct'] as const;
export const teamProfiles=teams.map((t,i)=>({teamId:t.id,style:styles[i%4],strength:.88+i%3*.09,pressing:[.40,.85,.38,.58][i%4],directness:[.35,.55,.75,.9][i%4],formation:i%2?'4-2-3-1':'4-3-3'}));
export const scenarios=['balanced','home_pressure','away_pressure','open_game','second_half_shift','red_card','low_block','counterattack'] as const;
export type Scenario=typeof scenarios[number];
export type Split='showcase'|'train'|'validation'|'evaluation';
export const datasetPlans=[{split:'showcase',count:16,seed:2000000},{split:'train',count:1000,seed:3000000},{split:'validation',count:200,seed:4000000},{split:'evaluation',count:300,seed:5000000}] as const;

export function roleForSlot(formation:string,slot:number):string {
 const roles=formation==='4-2-3-1'?['GK','LB','LCB','RCB','RB','LDM','RDM','AM','LW','ST','RW']:['GK','LB','LCB','RCB','RB','LCM','DM','RCM','LW','ST','RW'];
 return roles[slot]??'BENCH';
}
