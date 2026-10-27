const fs=require('fs'),path=require('path'),Database=require('better-sqlite3');
module.exports=async function restore(source,dest){
 source=path.resolve(source);dest=path.resolve(dest);
 if([dest,dest+'-wal',dest+'-shm'].some(p=>fs.existsSync(p)))throw Error('El destino ya existe. Elige una ruta nueva.');
 let db,created=false;
 try{
  db=new Database(source,{readonly:true,fileMustExist:true});
  if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('El respaldo está dañado');
  for(const table of ['tenants','users'])if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('El archivo no es una base RubroOS');
  fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});
  // Reserve the name exclusively; do not overwrite a database created during validation.
  fs.closeSync(fs.openSync(dest,'wx',0o600));created=true;
  await db.backup(dest);
  const check=new Database(dest);
  try{check.pragma('journal_mode=DELETE');if(check.pragma('quick_check',{simple:true})!=='ok')throw Error('Restauración inválida');}finally{check.close();}
  return dest;
 }catch(e){if(created)for(const p of [dest,dest+'-wal',dest+'-shm'])if(fs.existsSync(p))fs.unlinkSync(p);throw e;}finally{db?.close();}
};
