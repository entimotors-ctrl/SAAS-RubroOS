#!/usr/bin/env node
// Dedicated loopback-only sandbox. Never reads the business .env or database.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync,spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'server/data/demo-local');
fs.mkdirSync(folder,{recursive:true,mode:0o700});
const configPath=path.join(folder,'config.json');
if(!fs.existsSync(configPath)) fs.writeFileSync(configPath,JSON.stringify({jwt:crypto.randomBytes(48).toString('hex')}),{mode:0o600});
const config=JSON.parse(fs.readFileSync(configPath));
const env={...process.env,SKIP_ENV_FILE:'1',LOCAL_DEMO:'1',NODE_ENV:'development',HOST:'127.0.0.1',PORT:'4180',DATABASE_PATH:path.join(folder,'rubroos.db'),JWT_SECRET:config.jwt,OWNER_EMAIL:'admin@rubroos.test',OWNER_SEED_PASSWORD:'AdminPruebas2026!',AI_FAKE_PROVIDER:'1',WHATSAPP_FAKE_TRANSPORT:'1',WHATSAPP_ACCESS_TOKEN:'',WHATSAPP_APP_SECRET:'local-demo-no-webhook',WHATSAPP_VERIFY_TOKEN:'local-demo',CORS_ORIGIN:'http://127.0.0.1:4180',VITE_LOCAL_DEMO:'1'};
const build=spawnSync('npm',['run','build'],{cwd:path.join(root,'web'),env,stdio:'inherit'});
if(build.status!==0)process.exit(build.status||1);
console.log('\nPruebas: http://127.0.0.1:4180/elegir-sistema\nMaestro: maestro@rubroos.test / Maestro2026!\nAdministración: http://127.0.0.1:4180/owner/login\nDueño: admin@rubroos.test / AdminPruebas2026!\nCtrl+C para detener. Los datos de prueba se conservan.\n');
const child=spawn(process.execPath,['src/index.js'],{cwd:path.join(root,'server'),env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
