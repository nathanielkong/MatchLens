import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Router,static as serveStatic} from 'express';
// One origin for the built UI and API. Dev continues to use Vite's proxy.
export function frontendRoutes(directory:string){
 const root=resolve(directory),index=join(root,'index.html');
 if(!existsSync(index))throw new Error('Build the frontend before starting production hosting.');
 const router=Router();
 router.use('/assets',serveStatic(join(root,'assets'),{immutable:true,maxAge:'1y',index:false,fallthrough:true}));
 router.use(serveStatic(root,{index:false,dotfiles:'deny',maxAge:0}));
 router.get(['/','/match-room','/match-room/'],(_req,res)=>{res.setHeader('Cache-Control','no-cache');res.sendFile(index);});
 return router;
}
