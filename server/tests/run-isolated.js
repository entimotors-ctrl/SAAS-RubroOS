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
(async () => {
  let failed = false;
  for (const name of ['functional-smoke','security-multitenant','ai-core','ai-chat','whatsapp','taller-hardening','whatsapp-empty-pending','release-foundation','migration-safety','release-http','multi-business-beta','stable-operations','staff-portal']) {
    if(process.argv.length>2&&!process.argv.slice(2).includes(name))continue;
    const port = await freePort();
    const env = { ...process.env, NODE_ENV:'test', DATABASE_PATH:path.join(root, name+'.db'), JWT_SECRET:'isolated-regression-key', OWNER_EMAIL:'owner@audit.test', OWNER_SEED_PASSWORD:'Isolated-test-password!', AI_FAKE_PROVIDER:'1', WHATSAPP_FAKE_TRANSPORT:'1', WHATSAPP_APP_SECRET:'testsecret', WHATSAPP_VERIFY_TOKEN:'testverify', WHATSAPP_PHONE_NUMBER_ID:'PNID_TEST_SUITE', WHATSAPP_ACCESS_TOKEN:'fake-only', PORT:String(port), HOST:'127.0.0.1', API_URL:`http://127.0.0.1:${port}/api` };
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
