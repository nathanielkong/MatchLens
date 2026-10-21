// All inputs describe observed events. Labels and generator strengths are never runtime inputs.
export type Observation={time:number;period:number;periodClock:number;homeScore:number;awayScore:number;homeXg:number;awayXg:number;homeReds:number;awayReds:number;ended:boolean};
export type Model={version:string;homeGoals:number;awayGoals:number;meanDuration:number;priorSeconds:number;redEffect:number;temperature:number;firstAdded:number;secondAdded:number};
export type Chances={home:number;draw:number;away:number};
export const initialObservation=():Observation=>({time:0,period:1,periodClock:0,homeScore:0,awayScore:0,homeXg:0,awayXg:0,homeReds:0,awayReds:0,ended:false});
export type EvidenceEvent={sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;outcome:string|null;home_score:number;away_score:number;details:Record<string,unknown>};
export function observe(s:Observation,e:EvidenceEvent,homeId:string){
 s.time=e.clock_seconds;s.period=e.period;s.periodClock=Number(e.details.periodClockSeconds??e.clock_seconds);
 s.homeScore=e.home_score;s.awayScore=e.away_score;
 if(e.type==='shot'){const xg=Number(e.details.xg??0);if(Number.isFinite(xg)&&xg>=0&&xg<=1){if(e.team_id===homeId)s.homeXg+=xg;else s.awayXg+=xg;}}
 if(e.type==='red_card'){if(e.team_id===homeId)s.homeReds++;else s.awayReds++;}
 s.ended=e.type==='fulltime';
}
function poisson(mean:number){const values=[Math.exp(-mean)];for(let n=1;n<80;n++)values.push(values[n-1]*mean/n);return values;}
export function predict(s:Observation,m:Model):Chances{
 if(s.ended)return {home:Number(s.homeScore>s.awayScore),draw:Number(s.homeScore===s.awayScore),away:Number(s.homeScore<s.awayScore)};
 const remaining=Math.max(60,s.period===1?Math.max(0,2700+m.firstAdded-s.periodClock)+2700+m.secondAdded:Math.max(0,2700+m.secondAdded-s.periodClock));
 // A training-derived prior shrinks sparse observed xG. Cards adjust subsequent scoring rates.
 const rate=(goals:number,xg:number)=> (goals/m.meanDuration*m.priorSeconds+xg)/(m.priorSeconds+s.time);
 const homeMean=Math.min(30,Math.max(0,rate(m.homeGoals,s.homeXg)*remaining*Math.exp(m.redEffect*(s.awayReds-s.homeReds))));
 const awayMean=Math.min(30,Math.max(0,rate(m.awayGoals,s.awayXg)*remaining*Math.exp(m.redEffect*(s.homeReds-s.awayReds))));
 const h=poisson(homeMean),a=poisson(awayMean);let home=0,draw=0,away=0;
 for(let i=0;i<h.length;i++)for(let j=0;j<a.length;j++){const p=h[i]*a[j],diff=s.homeScore+i-s.awayScore-j;if(diff>0)home+=p;else if(diff<0)away+=p;else draw+=p;}
 const values=[home,draw,away].map(p=>Math.max(1e-12,p)**(1/m.temperature)),sum=values.reduce((a,b)=>a+b,0);
 return {home:values[0]/sum,draw:values[1]/sum,away:values[2]/sum};
}
