#!/usr/bin/env node
const path=require('path'),Database=require('../server/node_modules/better-sqlite3');
const source=process.argv[2],dir=process.argv[3];
if(!source||!dir){console.error('Uso: node scripts/backup.js /ruta/base.db /ruta/respaldos');process.exit(1);}
const db=new Database(path.resolve(source),{readonly:true,fileMustExist:true});
require('../server/src/maintenance/backups').backup(db,path.resolve(dir)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());
