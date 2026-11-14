import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function fleetDatabase(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table realtime.messages(id bigint generated always as identity,extension text,topic text);alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create table realtime.sent(payload jsonb,event text,topic text);
 create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.sent values($1,$2,$3)$$;
 grant usage on schema public,auth,realtime to authenticated;grant select,insert on realtime.messages to authenticated;`);
 const migrate=async file=>db.exec(await readFile(new URL('../../'+file,import.meta.url),'utf8'));
 await migrate('supabase/schema.sql');await migrate('supabase/migrations/001_trip_history.sql');
 const auth={},ids={};
 for(const [name,role] of [['admin','admin'],['driver','driver'],['replacement','driver'],['student','student'],['other','student'],['third','student']]){
  auth[name]=crypto.randomUUID();await db.query('insert into auth.users values($1)',[auth[name]]);
  ids[name]=(await db.query('insert into public.users(auth_id,name,role,student_code) values($1,$2,$3,$4) returning id',[auth[name],name,role,role==='student'?name.toUpperCase():null])).rows[0].id;
 }
 const login=async name=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[auth[name]]);await db.exec('set role authenticated');};
 const action=async(name,payload)=> (await db.query('select public.fleet_action($1,$2::jsonb) result',[name,JSON.stringify(payload)])).rows[0].result;
 const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
 const op=(payload={})=>({operation_id:crypto.randomUUID(),...payload});
 return {db,migrate,auth,ids,login,action,scalar,op};
}
