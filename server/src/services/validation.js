const { ServiceError } = require('./errors');
function number(value, label, min = 0) {
  if (!['number','string'].includes(typeof value) || String(value).trim() === '') throw new ServiceError(`${label} inválido`);
  const n=Number(value);
  if (!Number.isFinite(n) || n<min || n>1e9) throw new ServiceError(`${label} inválido`);
  return n;
}
function money(value,label) {
  const n=number(value,label);const cents=Math.round(n*100);
  if(Math.abs(n*100-cents)>0.00001)throw new ServiceError(`${label}: usa como máximo dos decimales`);
  return cents;
}
function date(value,label='Fecha') {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new ServiceError(`${label} inválida`);
  return value;
}
function text(value,label,max=500) {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new ServiceError(`${label} inválido`);
  return value.trim();
}
module.exports={number,money,date,text};
