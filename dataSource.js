import { decryptData, decryptDataWithKey } from './crypto.js';
import { REMOTE_CONFIG } from './remote-config.js';

export const DATA_SOURCE = Object.freeze({
  ONLINE: 'online',
  LOCAL_FALLBACK: 'local-fallback',
});

let lastLoadResult = null;

function joinUrl(path, query = '') {
  const base = String(REMOTE_CONFIG.apiBaseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('remote-not-configured');
  return `${base}/${String(path || '').replace(/^\//, '')}${query}`;
}

function taggedError(code, message = code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REMOTE_CONFIG.requestTimeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const method = String(options.method || 'GET').toUpperCase();
  const safeUrl = new URL(url);
  console.info(`[Worker] ${method} ${safeUrl.pathname}${safeUrl.search}`);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    console.info(`[Worker] status: ${response.status} ${method} ${safeUrl.pathname}`);
    return response;
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'remote-timeout' : 'remote-fetch';
    console.warn(`[Worker] ${code}:`, error?.message || error);
    throw taggedError(code, code, { cause: error });
  } finally {
    window.clearTimeout(timer);
  }
}

function assertVersion(version) {
  if (!version || typeof version !== 'object' || version.schemaVersion !== 1) throw new Error('version-invalid');
  const versionId = version.contentHash || version.dataVersion || version.version;
  if (!versionId || typeof versionId !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(versionId)) throw new Error('version-invalid');
  if (version.updatedAt && Number.isNaN(Date.parse(version.updatedAt))) throw new Error('version-invalid');
  return versionId;
}

function assertEncryptedPayload(payload) {
  if (typeof payload !== 'string' || !payload.trim()) throw new Error('data-empty');
  const bytes = new TextEncoder().encode(payload).byteLength;
  if (bytes > REMOTE_CONFIG.maxEncryptedBytes) throw new Error('data-too-large');
  let envelope;
  try { envelope = JSON.parse(payload); } catch { throw new Error('data-invalid'); }
  if (!envelope || envelope.v !== 1 || envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' || envelope.iterations !== 210000 || !envelope.salt || !envelope.iv || !envelope.ciphertext) throw new Error('data-invalid');
}

export function validateFamilyData(candidate) {
  if (!candidate || typeof candidate !== 'object' || !candidate.family || typeof candidate.family !== 'object' || !Array.isArray(candidate.members) || !candidate.members.length) throw new Error('data-invalid');
  if (candidate.schemaVersion !== 1) throw new Error('data-invalid');
  const ids = new Set();
  candidate.members.forEach((member) => {
    if (!member || typeof member.id !== 'string' || !member.id || typeof member.fullName !== 'string' || !member.fullName.trim() || ids.has(member.id)) throw new Error('data-invalid');
    ids.add(member.id);
  });
  candidate.members.forEach((member) => {
    const spouseIds = Array.isArray(member.spouseIds) ? member.spouseIds : [];
    const siblingIds = Array.isArray(member.siblingIds) ? member.siblingIds : [];
    const references = [member.fatherId, member.motherId, ...spouseIds, ...siblingIds].filter(Boolean);
    if ((member.spouseIds !== undefined && !Array.isArray(member.spouseIds)) || (member.siblingIds !== undefined && !Array.isArray(member.siblingIds)) || member.fatherId === member.id || member.motherId === member.id || references.some((id) => !ids.has(id))) throw new Error('data-invalid');
  });
  if (candidate.family.rootPersonId && !ids.has(candidate.family.rootPersonId)) throw new Error('data-invalid');
  return candidate;
}

async function loadVersion() {
  const response = await fetchWithTimeout(joinUrl(REMOTE_CONFIG.versionPath), { cache: 'no-cache' });
  if (!response.ok) throw taggedError('remote-http', `version-http-${response.status}`, { status: response.status });
  let version;
  try { version = await response.json(); } catch (error) { throw taggedError('remote-response-invalid', 'version-response-invalid', { cause: error }); }
  let versionId;
  try { versionId = assertVersion(version); } catch (error) { throw taggedError('remote-version-invalid', 'version-invalid', { cause: error }); }
  console.info('[Worker] version:', versionId);
  return { ...version, versionId };
}

export async function loadOnlineData() {
  if (!REMOTE_CONFIG.enabled) throw new Error('remote-disabled');
  const version = await loadVersion();
  const query = `?version=${encodeURIComponent(version.versionId)}`;
  const response = await fetchWithTimeout(joinUrl(REMOTE_CONFIG.dataPath, query), { cache: 'no-store' });
  if (!response.ok) throw taggedError('remote-http', `data-http-${response.status}`, { status: response.status });
  const payload = await response.text();
  try { assertEncryptedPayload(payload); } catch (error) { throw taggedError('remote-envelope-invalid', error.message, { cause: error }); }
  console.info('[Worker] encrypted data received:', new TextEncoder().encode(payload).byteLength, 'bytes');
  return { payload, version };
}

export async function loadLocalFallback() {
  console.info('[Worker] local fallback ./data.enc');
  let response;
  try { response = await fetch('./data.enc', { cache: 'no-store' }); } catch (error) { throw taggedError('local-fetch', 'data-unavailable', { cause: error }); }
  if (!response.ok) throw taggedError('local-fetch', 'data-unavailable', { status: response.status });
  const payload = await response.text();
  try { assertEncryptedPayload(payload); } catch (error) { throw taggedError('local-envelope-invalid', error.message, { cause: error }); }
  return { payload };
}

async function decryptAndValidate(payload, options) {
  let candidate;
  try {
    candidate = options.key ? await decryptDataWithKey(payload, options.key) : await decryptData(payload, options.password);
  } catch (error) {
    throw taggedError('decrypt-failed', 'decrypt-failed', { cause: error });
  }
  try { validateFamilyData(candidate); } catch (error) { throw taggedError('schema-invalid', 'data-invalid', { cause: error }); }
  return candidate;
}

export async function loadFamilyData(options = {}) {
  const decryptOptions = { password: options.password, key: options.key };
  let onlineError = null;
  if (REMOTE_CONFIG.enabled) {
    try {
      const online = await loadOnlineData();
      const data = await decryptAndValidate(online.payload, decryptOptions);
      lastLoadResult = { source: DATA_SOURCE.ONLINE, version: online.version };
      return { ...online, data, source: DATA_SOURCE.ONLINE };
    } catch (error) {
      onlineError = error;
      console.warn('[Worker] Online family data unavailable; using Git fallback.', error?.code || error?.message || error);
    }
  }
  try {
    const local = await loadLocalFallback();
    const data = await decryptAndValidate(local.payload, decryptOptions);
    lastLoadResult = { source: DATA_SOURCE.LOCAL_FALLBACK, version: null };
    return { ...local, data, source: DATA_SOURCE.LOCAL_FALLBACK };
  } catch (error) {
    if (error?.code === 'local-fetch' && onlineError) {
      error.remoteError = onlineError;
    }
    throw error;
  }
}

export function getLastDataSource() {
  return lastLoadResult;
}
