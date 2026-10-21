import type {Pool} from 'pg';
export interface BudgetStore {
 cached(key:string):Promise<unknown|null>;
 reserve(id:string,key:string,client:string,tokens:number):Promise<void>;
 finish(id:string,tokens:number,result:unknown|null):Promise<void>;
}
export function postgresBudget(db:Pick<Pool,'query'>):BudgetStore {
 return {
  async cached(key){return (await db.query('SELECT ai_cached($1) AS result',[key])).rows[0].result;},
  async reserve(id,key,client,tokens){await db.query('SELECT ai_reserve($1,$2,$3,$4)',[id,key,client,tokens]);},
  async finish(id,tokens,result){await db.query('SELECT ai_finish($1,$2,$3)',[id,tokens,result===null?null:JSON.stringify(result)]);}
 };
}
