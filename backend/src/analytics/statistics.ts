export type ReplayEvent = {
 sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;
 player_id:string|null;possession_id:number;outcome:string|null;details:Record<string,unknown>;
 home_score:number;away_score:number;
};
export type PressingSequence={team_id:string;start_sequence:number;last_sequence:number;raw_pressure_records:number};
export function calculateStatistics(events:ReplayEvent[],teamIds:string[],pressing:PressingSequence[]) {
 const teams=teamIds.map(teamId=>({teamId,shots:0,shotsOnTarget:0,xg:0,passes:0,completedPasses:0,
  passAccuracy:null as number|null,actionSeconds:0,possessionEstimate:null as number|null,
  pressingSequences:0,pressureObservations:0,yellowCards:0,redCards:0}));
 const byId=new Map(teams.map(t=>[t.teamId,t]));
 for(const e of events){
  const team=byId.get(e.team_id??'');
  if(team){
   if(e.type==='pass'){team.passes++;if(e.outcome==='complete')team.completedPasses++;}
   if(e.type==='shot'){
    team.shots++;if(['goal','saved'].includes(e.outcome??''))team.shotsOnTarget++;
    const xg=e.details.xg;if(typeof xg==='number'&&Number.isFinite(xg)&&xg>=0&&xg<=1)team.xg+=xg;
   }
   if(e.type==='yellow_card')team.yellowCards++;
   if(e.type==='red_card')team.redCards++;
  }
  // Duration describes a completed action. Credit the team in control, not the
  // defender who committed a foul. Never infer an unseen action's duration.
  if(['pass','carry','shot','foul'].includes(e.type)){
   const controller=byId.get(String(e.details.possessionTeamId));
   const seconds=e.details.durationSeconds;
   if(controller&&typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>0)controller.actionSeconds+=seconds;
  }
 }
 for(const sequence of pressing){const team=byId.get(sequence.team_id);if(team){team.pressingSequences++;team.pressureObservations+=sequence.raw_pressure_records;}}
 const total=teams.reduce((sum,t)=>sum+t.actionSeconds,0);
 for(const t of teams){t.xg=Math.round(t.xg*1000)/1000;t.passAccuracy=t.passes?Math.round(t.completedPasses/t.passes*1000)/10:null;
  t.possessionEstimate=total?Math.round(t.actionSeconds/total*1000)/10:null;}
 const last=events.at(-1);
 return {calculationVersion:'match-stats-v1',score:{home:last?.home_score??0,away:last?.away_score??0},
  possessionTeamId:last?.details.possessionTeamId??null,teams,
  definitions:{possessionEstimate:'Share of recorded action duration; excludes restarts and stoppages. Not official time-in-possession.',
   xg:'Sum of synthetic shot xG; not calibrated on real matches.',pressingSequences:'press-v1: same team, possession and period, no more than 10 seconds between pressure observations.'}};
}
