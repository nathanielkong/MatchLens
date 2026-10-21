// CPU-only lookup benchmark, not a browser FPS measurement.
import {performance} from 'node:perf_hooks';
import {anchoredPositionsAt,playerKeyframes,type Frame} from '../src/motion.ts';
const frames:Frame[]=Array.from({length:750},(_,i)=>({through_sequence:i+1,clock_seconds:i*8,period:i<375?1:2,ball:{x:50,y:50},positions:Array.from({length:22},(_,p)=>({playerId:String(p),teamId:p<11?'home':'away',x:10+(p*7+i)%80,y:10+(p*13+i)%80}))}));
const paths=playerKeyframes(frames,[]);let total=0;
for(let i=0;i<500;i++)anchoredPositionsAt({time:i*7},frames,[],paths);
const batches=[];
for(let batch=0;batch<5;batch++){const start=performance.now();for(let i=0;i<2000;i++)total+=anchoredPositionsAt({time:(i*7)%5992},frames,[],paths).length;batches.push((performance.now()-start)/2000);}
batches.sort((a,b)=>a-b);
console.log(JSON.stringify({frames:750,players:22,lookups:10000,medianMillisecondsPerLookup:Number(batches[2].toFixed(4)),positionsRead:total},null,2));
