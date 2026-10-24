import type {ReplayEvent} from '../analytics/statistics.js';
const clock=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
export function evidenceClock(event:Pick<ReplayEvent,'clock_seconds'|'period'|'details'>){
 const elapsed=`${clock(event.clock_seconds)} elapsed`,half=event.details.periodClockSeconds;
 // Total elapsed time includes previous-half added time. It cannot establish
 // whether a second-half event happened after that half's normal duration.
 if(typeof half!=='number'||!Number.isInteger(half)||half<0)return `${elapsed} (half clock unavailable)`;
 return `${elapsed} (${event.period===1?'first':'second'} half, ${clock(half)} half clock; ${half>2700?'added time':'regulation time'})`;
}
