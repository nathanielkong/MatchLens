import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {RequestHandler} from 'express';
export function sessionMiddleware(secret:string,secure=false):RequestHandler{
 const sign=(id:string)=>createHmac('sha256',secret).update(id).digest('hex');
 return (req,res,next)=>{
  const value=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ml_session='))?.slice(11),[candidate,signature]=value?.split('.')??[];
  const valid=!!candidate&&/^[a-f0-9]{48}$/.test(candidate)&&!!signature&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(sign(candidate)));
  const id=valid?candidate:randomBytes(24).toString('hex');
  if(!valid)res.appendHeader('Set-Cookie',`ml_session=${id}.${sign(id)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${secure?'; Secure':''}`);
  res.locals.clientId=createHmac('sha256',secret).update('owner:'+id).digest('hex');next();
 };
}
