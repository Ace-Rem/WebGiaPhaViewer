import { base64ToBytes, decryptDataWithKey, deriveKeyFromPassword } from './crypto.js';
import { getLastDataSource, loadFamilyData } from './dataSource.js';

let familyInMemory = null;
const REMEMBER_DB = 'family-tree-session';
const REMEMBER_STORE = 'session';

function openRememberDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REMEMBER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(REMEMBER_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRememberedSession() {
  const db = await openRememberDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const request = db.transaction(REMEMBER_STORE, 'readonly').objectStore(REMEMBER_STORE).get('current');
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function writeRememberedSession(session) {
  const db = await openRememberDb();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(REMEMBER_STORE, 'readwrite');
    transaction.objectStore(REMEMBER_STORE).put(session, 'current');
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function clearRememberedSession() {
  try {
    const db = await openRememberDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(REMEMBER_STORE, 'readwrite');
      transaction.objectStore(REMEMBER_STORE).delete('current');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch (error) { console.warn('Remembered session could not be cleared:', error); }
}

async function rememberSession(payload, username, password) {
  try {
    const envelope = JSON.parse(payload);
    const key = await deriveKeyFromPassword(password, base64ToBytes(envelope.salt), envelope.iterations);
    await writeRememberedSession({ username: username.trim(), key, createdAt: Date.now() });
  } catch (error) { console.warn('Remembered session is unavailable in this browser:', error); }
}

export async function signIn(username, password, { remember = false } = {}) {
  const loaded = await loadFamilyData({ password });
  const { payload, data: candidate } = loaded;
  const configuredUsername = candidate?.auth?.username;
  if (!candidate?.family || !Array.isArray(candidate.members) || !configuredUsername || username.trim().toLocaleLowerCase() !== configuredUsername.toLocaleLowerCase()) {
    throw new Error('credentials-invalid');
  }
  familyInMemory = candidate;
  if (remember) await rememberSession(payload, username, password);
  else await clearRememberedSession();
  return candidate;
}

export async function restoreRememberedSession() {
  try {
    const remembered = await readRememberedSession();
    if (!remembered?.key || !remembered.username) return null;
    const loaded = await loadFamilyData({ key: remembered.key });
    const candidate = loaded.data;
    if (candidate.auth?.username?.toLocaleLowerCase() !== remembered.username.toLocaleLowerCase()) throw new Error('remembered-session-invalid');
    familyInMemory = candidate;
    return candidate;
  } catch (error) {
    await clearRememberedSession();
    console.warn('Remembered session could not be restored:', error);
    return null;
  }
}

export function getSessionData() {
  return familyInMemory;
}

export function getDataSourceStatus() {
  return getLastDataSource();
}

export async function signOut() {
  if (familyInMemory) {
    familyInMemory.members?.forEach((member) => {
      for (const key of Object.keys(member)) member[key] = null;
    });
  }
  familyInMemory = null;
  await clearRememberedSession();
}
