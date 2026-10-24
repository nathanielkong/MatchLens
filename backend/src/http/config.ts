import {randomBytes} from 'node:crypto';
export function runtimeConfig(env:NodeJS.ProcessEnv=process.env){
 const production=env.NODE_ENV==='production',secret=env.SESSION_SECRET??(production?'':randomBytes(32).toString('hex'));
 if(secret.length<32||/^replace/i.test(secret))throw new Error('SESSION_SECRET must be at least 32 characters; use a generated secret in production.');
 const publicAI=env.PUBLIC_AI_ENABLED==='true';
 const origins=(env.AI_ALLOWED_ORIGINS??'http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim());
 if(production&&publicAI&&(!env.AI_ALLOWED_ORIGINS||origins.some(o=>{try{const u=new URL(o);return u.protocol!=='https:'||u.origin!==o;}catch{return true;}})))throw new Error('Public AI requires explicit HTTPS origins.');
 return {production,secret,publicAI,origins};
}
