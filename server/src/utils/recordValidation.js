const { number, date } = require('../services/validation');
const enums={ganaderia_animales:{sexo:['hembra','macho'],estado:['activo','vendido','fallecido']},ganaderia_reproduccion:{tipo:['monta','inseminacion','parto','diagnostico']}};
function validateRecord(table,data){
  try{
    for(const field of ['precio','stock','peso_kg','comision_porcentaje','duracion_min']) if(data[field]!==undefined&&data[field]!==null&&data[field]!=='') {
      const n=number(data[field],field);if(field==='comision_porcentaje'&&n>100)throw new Error('La comisión debe estar entre 0 y 100');
      if(field==='duracion_min'&&(!Number.isInteger(n)||n<1||n>1440))throw new Error('Duración inválida');
    }
    for(const field of ['fecha','fecha_nacimiento','proxima_fecha','fecha_probable_parto'])if(data[field])date(data[field],field);
    for(const [field,values] of Object.entries(enums[table]||{}))if(data[field]!==undefined&&!values.includes(data[field]))throw new Error(`${field} inválido`);
  }catch(e){return e.message;}
  return null;
}
module.exports={validateRecord};
