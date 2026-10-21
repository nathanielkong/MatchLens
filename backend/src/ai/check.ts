import {FoundryClient,foundryStatus,readFoundryConfig} from './foundry.js';
import {AIError,ProjectAgentClient,projectConfig,projectStatus} from './project.js';
import {postgresBudget} from './budget.js';
import {connect} from '../db/connection.js';
if(process.env.AI_PROVIDER==='foundry-agent'){
 const status=projectStatus();console.log(JSON.stringify(status,null,2));
 if(!status.configured)process.exitCode=1;
 else if(process.argv.includes('--auth')||process.argv.includes('--live')){
  const pool=connect('app');
  try{
   const client=new ProjectAgentClient(projectConfig(),postgresBudget(pool));
   await client.authenticate();console.log('Azure authentication and pinned agent configuration verified.');
   if(process.argv.includes('--live')){
    const result=await client.run('Reply with only: CONNECTED','local-cli',text=>{if(text!=='CONNECTED')throw new Error('Unexpected connection reply');return {text};},'connection-probe-v1');
    console.log(JSON.stringify({liveRequestCompleted:true,...result}));
   }
  }catch(error){
   console.error(error instanceof AIError?error.code:'Foundry check failed. Check database access and Azure sign-in. No credentials were printed.');
   if(error instanceof AIError&&error.cause&&typeof error.cause==='object'){
    const detail=error.cause as {status?:number;code?:string;param?:string};
    console.error(JSON.stringify({status:detail.status,code:detail.code,param:detail.param}));
   }
   process.exitCode=1;
  }
  finally{await pool.end();}
 }else console.log('Local check only: no Azure request sent.');
}else{
const status=foundryStatus();console.log(JSON.stringify(status,null,2));
if(!status.configured)process.exitCode=1;
else if(process.argv.includes('--live')){
 // A live probe is opt-in and consumes tokens. No match or user data is sent.
 try{const client=new FoundryClient(readFoundryConfig());const result=await client.generate('Reply with the single word CONNECTED.');console.log(JSON.stringify({liveRequestCompleted:true,...result},null,2));}
 catch(error){console.error(error instanceof Error?error.message:'Foundry check failed');process.exitCode=1;}
}else console.log('Local check only: no request was sent to Microsoft Foundry.');
}
