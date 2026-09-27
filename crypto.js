const DEFAULT_ITERATIONS = 210_000;

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function deriveKeyFromPassword(password, salt, iterations = DEFAULT_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function parseEnvelope(encryptedText) {
  let envelope;
  try {
    envelope = JSON.parse(encryptedText);
  } catch {
    throw new Error('invalid-envelope');
  }
  if (!envelope || envelope.v !== 1 || envelope.algorithm !== 'AES-GCM' || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error('invalid-envelope');
  }
  return envelope;
}

export async function decryptDataWithKey(encryptedText, key) {
  const envelope = parseEnvelope(encryptedText);

  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('decrypt-failed');
  }
}

export async function decryptData(encryptedText, password) {
  const envelope = parseEnvelope(encryptedText);
  try {
    const key = await deriveKeyFromPassword(password, base64ToBytes(envelope.salt), envelope.iterations || DEFAULT_ITERATIONS);
    return await decryptDataWithKey(encryptedText, key);
  } catch {
    throw new Error('decrypt-failed');
  }
}

export async function encryptData(data, password, iterations = DEFAULT_ITERATIONS) {
  if (!password || password.length < 8) throw new Error('password-too-short');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(data, null, 2));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return JSON.stringify({
    v: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }, null, 2);
}
