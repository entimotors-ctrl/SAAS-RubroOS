/** Run regressions with fresh, disposable databases and fake transports. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rubroos-tests-'));
const source = path.resolve(__dirname, '..');
for (const dir of ['src', 'tests']) fs.cpSync(path.join(source, dir), path.join(root, dir), { recursive: true });
fs.symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'), 'dir');
function launch(args, env) { return spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
function finish(proc) {
  return new Promise(resolve => {
    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => output += d);
    const timer = setTimeout(() => proc.kill(), 150000);
    proc.on('error', e => { clearTimeout(timer); resolve({ code: 1, output: String(e) }); });
    proc.on('exit', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve,reject) => { server.once('error',reject);server.listen(0,'127.0.0.1',resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
// TEST_DATABASE_URL (opcional): base de conexión SIN nombre de base, p.ej.
// postgres://postgres:postgres@127.0.0.1:5433 — si está definida, cada suite
// corre contra una base PostgreSQL propia (creada/recreada aquí) en vez de un
// archivo SQLite, para validar el adaptador de server/src/db/postgres.js con
// el mismo arnés. Sin esta variable, el comportamiento es idéntico al de
// siempre (SQLite).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
// Rol restringido (Fase 3, RLS) que usa `DATABASE_URL` en cada suite: sin
// superusuario/owner/BYPASSRLS, para que las políticas de
// supabase/migrations/20261027140010_rls.sql se verifiquen de verdad en vez
// de saltarse por correr como el superusuario administrativo. La contraseña
// es fija porque la base efímera solo vive en 127.0.0.1 durante la corrida.
const APP_ROLE = 'rubroos_app';
const APP_ROLE_PASSWORD = 'rubroos-test-role-password';
async function pgDatabaseUrl(name) {
  const { Client } = require('pg');
  const dbName = name.replace(/-/g, '_');
  const admin = new Client({ connectionString: `${TEST_DATABASE_URL}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  const adminUrl = new URL(`${TEST_DATABASE_URL}/${dbName}`);
  const appUrl = new URL(adminUrl.toString());
  appUrl.username = APP_ROLE;
  appUrl.password = APP_ROLE_PASSWORD;
  return { databaseUrl: appUrl.toString(), adminUrl: adminUrl.toString() };
}
(async () => {
  let failed = false;
  for (const name of ['functional-smoke','security-multitenant','ai-core','ai-chat','whatsapp','taller-hardening','whatsapp-empty-pending','release-foundation','migration-safety','release-http','multi-business-beta','stable-operations','staff-portal','rls-defense']) {
    if(process.argv.length>2&&!process.argv.slice(2).includes(name))continue;
    const port = await freePort();
    let dbEnv;
    if (TEST_DATABASE_URL) {
      const { databaseUrl, adminUrl } = await pgDatabaseUrl(name);
      dbEnv = { DATABASE_URL: databaseUrl, DATABASE_ADMIN_URL: adminUrl, MIGRATIONS_DIR: path.join(source, '..', 'supabase', 'migrations') };
    } else {
      dbEnv = { DATABASE_PATH: path.join(root, name+'.db') };
    }
    const env = { ...process.env, NODE_ENV:'test', ...dbEnv, JWT_SECRET:'isolated-regression-key', OWNER_EMAIL:'owner@audit.test', OWNER_SEED_PASSWORD:'Isolated-test-password!', AI_FAKE_PROVIDER:'1', WHATSAPP_FAKE_TRANSPORT:'1', WHATSAPP_APP_SECRET:'testsecret', WHATSAPP_VERIFY_TOKEN:'testverify', WHATSAPP_PHONE_NUMBER_ID:'PNID_TEST_SUITE', WHATSAPP_ACCESS_TOKEN:'fake-only', PORT:String(port), HOST:'127.0.0.1', API_URL:`http://127.0.0.1:${port}/api` };
    const api = launch(['src/index.js'], env);
    const apiFinished = finish(api);
    try {
      let ready = false;
      for(let i=0;i<600;i++) {
        if(api.exitCode !== null) break;
        try { const res=await fetch(env.API_URL+'/health');if(res.ok){ready=true;break;} } catch { /* startup */ }
        await new Promise(r=>setTimeout(r,100));
      }
      if(!ready) throw new Error('API did not start');
      const result = await finish(launch([`tests/${name}.js`],env));
      fs.writeFileSync(path.join(root,name+'.log'), result.output);
      const summary = result.output.split('\n').findLast(line=>/checks OK|Resultado:/.test(line)) || '';
      console.log(`${name}: ${result.code === 0 ? 'PASS' : 'FAIL'} ${summary}`);
      if(result.code !== 0){failed=true; console.log(result.output);}
    } finally { api.kill(); const log = await apiFinished; fs.writeFileSync(path.join(root,name+'-server.log'),log.output); }
  }
  if(failed){ console.log('Logs:',root);process.exitCode=1; }
  else { fs.rmSync(root,{recursive:true,force:true});console.log('All isolated suites passed.'); }
})().catch(e=>{console.error(e, 'Logs:',root);process.exitCode=1;});
