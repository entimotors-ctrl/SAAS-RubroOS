// SQL functions use an in-memory cache: they never query SQLite recursively.
const zones=new Map();
const defaultZone='America/Tegucigalpa';
function setZone(id,zone){zones.set(Number(id),zone);}
function day(id,instant=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:zones.get(Number(id))||defaultZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
 const get=k=>p.find(v=>v.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
function install(db){
 for(const r of db.prepare("SELECT tenant_id,settings FROM tenant_settings WHERE section='operations'").all())setZone(r.tenant_id,JSON.parse(r.settings).timezone||defaultZone);
 db.function('business_today',id=>day(id));
 db.function('business_day',(value,id)=>{if(!value)return null;if(value.length===10)return value;const d=new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value)?value:value.replace(' ','T')+'Z');return Number.isFinite(d.getTime())?day(id,d):null;});
}
module.exports={install,setZone,day};
