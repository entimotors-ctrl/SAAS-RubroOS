const db=require('../db');
const {ServiceError}=require('./errors');
const {money}=require('./validation');
const defaults={timezone:'America/Tegucigalpa',fumigacion:350,fertilizacion:300,mapeo:250,minimo_dron:500,material_cerca:15,mano_obra_cerca:8};
function get(tid){const row=db.prepare("SELECT settings FROM tenant_settings WHERE tenant_id=? AND section='operations'").get(tid);return {...defaults,...(row?JSON.parse(row.settings):{})};}
function save(tid,data,actor){const next=get(tid);for(const key of Object.keys(defaults))if(Object.hasOwn(data,key)){if(key==='timezone'){if(typeof data[key]!=='string'||!data[key].trim())throw new ServiceError('Zona horaria inválida');try{new Intl.DateTimeFormat('en',{timeZone:data[key]}).format();}catch{throw new ServiceError('Zona horaria inválida');}next[key]=data[key];}else next[key]=money(data[key],key)/100;}
const saved=db.transaction(()=>{db.prepare("INSERT INTO tenant_settings(tenant_id,section,settings) VALUES(?,'operations',?) ON CONFLICT(tenant_id,section) DO UPDATE SET settings=excluded.settings").run(tid,JSON.stringify(next));db.prepare('INSERT INTO business_events(tenant_id,user_id,event,detail) VALUES(?,?,?,?)').run(tid,actor,'configuracion.actualizada',JSON.stringify(next));return next;}).immediate();require('./businessClock').setZone(tid,saved.timezone);return saved;}
function day(tid,instant=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:get(tid).timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);const v=k=>parts.find(p=>p.type===k).value;return `${v('year')}-${v('month')}-${v('day')}`;}
module.exports={get,save,day};
