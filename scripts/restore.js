#!/usr/bin/env node
// Restore only into a NEW path. This never changes the application's DATABASE_PATH.
const [source,dest]=process.argv.slice(2);
if(!source||!dest){console.error('Uso: node scripts/restore.js /ruta/respaldo.db /ruta/nueva-base.db');process.exit(1);}
require('../server/src/maintenance/restore')(source,dest).then(file=>console.log('Restauración verificada en '+file+'. Cambia DATABASE_PATH con el servicio detenido.')).catch(e=>{console.error(e.message);process.exitCode=1;});
