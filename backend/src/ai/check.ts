import {FoundryClient,foundryStatus,readFoundryConfig} from './foundry.js';
const status=foundryStatus();console.log(JSON.stringify(status,null,2));
if(!status.configured)process.exitCode=1;
else if(process.argv.includes('--live')){
 // A live probe is opt-in and consumes tokens. No match or user data is sent.
 try{const client=new FoundryClient(readFoundryConfig());const result=await client.generate('Reply with the single word CONNECTED.');console.log(JSON.stringify({liveRequestCompleted:true,...result},null,2));}
 catch(error){console.error(error instanceof Error?error.message:'Foundry check failed');process.exitCode=1;}
}else console.log('Local check only: no request was sent to Microsoft Foundry.');
