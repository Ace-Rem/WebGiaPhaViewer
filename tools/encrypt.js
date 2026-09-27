const DEFAULT_ITERATIONS = 210000;
const $ = (selector) => document.querySelector(selector);
const jsonInput = $('#jsonInput');
const passwordInput = $('#passwordInput');
const confirmInput = $('#confirmInput');
const statusBox = $('#status');
const encryptButton = $('#encryptButton');
const downloadLink = $('#downloadLink');

function base64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: DEFAULT_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
}

function validateData(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) errors.push('JSON phải là một object.');
  if (!data?.family || typeof data.family !== 'object') errors.push('Thiếu object "family".');
  if (!Array.isArray(data?.members) || !data.members.length) errors.push('"members" phải là một mảng có ít nhất một thành viên.');
  const members = Array.isArray(data?.members) ? data.members : [];
  const ids = new Set();
  members.forEach((member, index) => {
    if (!member || typeof member !== 'object') { errors.push(`members[${index}] không phải object.`); return; }
    if (!member.id) errors.push(`members[${index}] thiếu id.`);
    else if (ids.has(member.id)) errors.push(`ID trùng: ${member.id}.`);
    else ids.add(member.id);
    if (!member.fullName) warnings.push(`${member.id || `members[${index}]`} chưa có fullName.`);
    if (member.siblingOrder !== null && member.siblingOrder !== undefined && (!Number.isInteger(member.siblingOrder) || member.siblingOrder < 1)) errors.push(`${member.id}: siblingOrder phải là số nguyên dương.`);
    if (member.generation !== null && member.generation !== undefined && (!Number.isInteger(member.generation) || member.generation < 1)) errors.push(`${member.id}: generation phải là số nguyên dương.`);
  });
  const known = (id) => !id || ids.has(id);
  members.forEach((member) => {
    ['fatherId', 'motherId'].forEach((key) => {
      if (!known(member[key])) errors.push(`${member.id}: ${key} "${member[key]}" không tồn tại.`);
      if (member[key] === member.id) errors.push(`${member.id}: ${key} tự tham chiếu chính mình.`);
    });
    const spouseIds = Array.isArray(member.spouseIds) ? member.spouseIds : [];
    if (!Array.isArray(member.spouseIds) && member.spouseIds !== undefined) errors.push(`${member.id}: spouseIds phải là mảng.`);
    if (new Set(spouseIds).size !== spouseIds.length) errors.push(`${member.id}: spouseIds có phần tử trùng.`);
    spouseIds.forEach((spouseId) => {
      if (!known(spouseId)) errors.push(`${member.id}: spouseId "${spouseId}" không tồn tại.`);
      if (spouseId === member.id) errors.push(`${member.id}: không thể kết hôn với chính mình.`);
      const spouse = members.find((candidate) => candidate?.id === spouseId);
      if (spouse && (!Array.isArray(spouse.spouseIds) || !spouse.spouseIds.includes(member.id))) warnings.push(`${member.id} và ${spouseId}: spouseIds chưa đối xứng.`);
    });
  });
  const visiting = new Set(); const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const member = members.find((candidate) => candidate?.id === id);
    const cycle = member && [member.fatherId, member.motherId].filter(Boolean).some(visit);
    visiting.delete(id); visited.add(id); return Boolean(cycle);
  };
  members.forEach((member) => { if (member?.id && visit(member.id)) errors.push(`Phát hiện vòng lặp quan hệ cha/mẹ quanh ${member.id}.`); });
  if (data.family?.rootPersonId && !ids.has(data.family.rootPersonId)) errors.push(`family.rootPersonId "${data.family.rootPersonId}" không tồn tại.`);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], count: members.length };
}

function showStatus(validation, success = false) {
  statusBox.className = `status ${validation.errors.length ? 'error' : success ? 'success' : ''}`;
  const lines = [...validation.errors.map((error) => `✕ ${error}`), ...validation.warnings.map((warning) => `⚠ ${warning}`)];
  if (!lines.length) lines.push(`✓ JSON hợp lệ · ${validation.count} thành viên`);
  statusBox.innerHTML = `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
}

function parseAndValidate() {
  let data;
  try { data = JSON.parse(jsonInput.value); } catch (error) {
    const position = error.message.match(/position (\d+)/)?.[1];
    const validation = { errors: [`JSON không hợp lệ${position ? ` tại vị trí ${position}` : ''}. Kiểm tra dấu phẩy, ngoặc và dấu nháy.`], warnings: [], count: 0 };
    showStatus(validation); return null;
  }
  const validation = validateData(data); showStatus(validation); return validation.errors.length ? null : data;
}

async function encrypt() {
  const data = parseAndValidate();
  if (!data) return;
  const password = passwordInput.value;
  if (password.length < 8) { showStatus({ errors: ['Mật khẩu phải có ít nhất 8 ký tự.'], warnings: [], count: data.members.length }); return; }
  if (password !== confirmInput.value) { showStatus({ errors: ['Mật khẩu xác nhận chưa khớp.'], warnings: [], count: data.members.length }); return; }
  encryptButton.disabled = true; encryptButton.textContent = 'Đang mã hóa…';
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await deriveKey(password, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(data, null, 2)); const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    const output = JSON.stringify({ v: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA-256', iterations: DEFAULT_ITERATIONS, salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }, null, 2);
    const blobUrl = URL.createObjectURL(new Blob([output], { type: 'application/json' })); downloadLink.href = blobUrl; downloadLink.classList.add('show');
    downloadLink.click(); showStatus({ errors: [], warnings: [], count: data.members.length }, true);
  } catch (error) { console.error(error); showStatus({ errors: ['Không thể mã hóa trên trình duyệt này.'], warnings: [], count: data.members.length }); }
  finally { encryptButton.disabled = false; encryptButton.textContent = 'Mã hóa & tải xuống'; }
}

$('#validateButton').addEventListener('click', parseAndValidate);
encryptButton.addEventListener('click', encrypt);
