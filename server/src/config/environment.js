function validateEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if(!env.DATABASE_PATH||!require('path').isAbsolute(env.DATABASE_PATH))throw new Error('Producción requiere DATABASE_PATH absoluto');
  if(!env.BACKUP_DIR||!require('path').isAbsolute(env.BACKUP_DIR))throw new Error('Producción requiere BACKUP_DIR absoluto');
  if(Object.values(env).some(v=>typeof v==='string'&&v.startsWith('CAMBIAR_')))throw new Error('Sustituye los valores CAMBIAR_ antes de iniciar producción');
  if (env.LOCAL_DEMO === '1') throw new Error('La demo local no está permitida en producción');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('Producción requiere JWT_SECRET de al menos 32 caracteres');
  if (env.AI_FAKE_PROVIDER === '1' || env.WHATSAPP_FAKE_TRANSPORT === '1') throw new Error('Los simuladores de IA y WhatsApp no están permitidos en producción');
  if (!env.CORS_ORIGIN || env.CORS_ORIGIN.split(',').some(origin => {
    try { const url = new URL(origin.trim());return url.protocol !== 'https:' || url.origin !== origin.trim(); }
    catch { return true; }
  })) throw new Error('Producción requiere CORS_ORIGIN con los orígenes HTTPS del frontend, separados por comas');
}
module.exports = { validateEnvironment };
