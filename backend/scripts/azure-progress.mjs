import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const a=dotenv.parse(await fs.readFile(path.join(root,'backend/.env.azure')));
const c=new pg.Client({host:a.AZURE_PG_HOST,user:a.AZURE_PG_USER,password:a.AZURE_PG_PASSWORD,database:'matchlens',ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{
 await c.connect();
 console.log('Data transfer',(await c.query(`SELECT CASE WHEN a.query LIKE 'COPY public.events %' THEN 'events' WHEN a.query LIKE 'COPY public.tracking_frames %' THEN 'tracking_frames' ELSE 'other table' END AS table_name,p.bytes_processed::text,p.tuples_processed::text FROM pg_stat_progress_copy p JOIN pg_stat_activity a ON a.pid=p.pid`)).rows);
 console.log('Index stage',(await c.query('SELECT command,phase,blocks_done::text,blocks_total::text FROM pg_stat_progress_create_index')).rows);
}finally{await c.end();}
