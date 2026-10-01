// Public configuration only. Never put publish tokens or Cloudflare credentials here.
export const REMOTE_CONFIG = Object.freeze({
  enabled: true,
  apiBaseUrl: 'https://family-tree-api.acerem.workers.dev',
  dataPath: '/data',
  versionPath: '/version',
  imagePath: '/images',
  requestTimeoutMs: 8000,
  maxEncryptedBytes: 20 * 1024 * 1024,
});
