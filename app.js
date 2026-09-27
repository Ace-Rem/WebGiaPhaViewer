import { restoreRememberedSession, signIn, signOut } from './auth.js';
import { getMemberImagePath } from './member-image.js';
import { buildFamilyGraph, getSiblingOrder, lifeDates, initials, normalizeText, relationSets, TreeRenderer } from './tree.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = (name) => `<svg class="icon"><use href="#icon-${name}"></use></svg>`;
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const avatarMarkup = (member, className = 'member-avatar') => {
  const imagePath = getMemberImagePath(member);
  return `<span class="${className}" data-photo-frame><span class="avatar-fallback">${escapeHtml(initials(member.fullName))}</span>${imagePath ? `<img class="member-photo" data-member-photo src="${escapeHtml(imagePath)}" alt="" loading="lazy" />` : ''}</span>`;
};

function wirePhotoFallbacks(root) {
  root.querySelectorAll('[data-member-photo]').forEach((image) => {
    const frame = image.closest('[data-photo-frame]');
    const markLoaded = () => frame?.classList.add('has-photo');
    image.addEventListener('load', markLoaded, { once: true });
    image.addEventListener('error', () => {
      image.removeAttribute('src');
      image.classList.add('failed');
      frame?.classList.remove('has-photo');
    }, { once: true });
    if (image.complete && image.naturalWidth > 0) markLoaded();
  });
}

const elements = {
  root: document.documentElement,
  loginScreen: $('#loginScreen'),
  mainApp: $('#mainApp'),
  loginForm: $('#loginForm'),
  loginButton: $('#loginButton'),
  loginError: $('#loginError'),
  username: $('#username'),
  password: $('#password'),
  rememberLogin: $('#rememberLogin'),
  togglePassword: $('#togglePassword'),
  familyTitle: $('#familyTitle'),
  familyDescription: $('#familyDescription'),
  brandName: $('#brandName'),
  brandMonogram: $('#brandMonogram'),
  memberCount: $('#memberCount'),
  generationCount: $('#generationCount'),
  branchCount: $('#branchCount'),
  todayLabel: $('#todayLabel'),
  treeView: $('#treeView'),
  membersView: $('#membersView'),
  treeCard: $('#treeCard'),
  treeViewport: $('#treeViewport'),
  treeSvg: $('#familyTree'),
  treeLoading: $('#treeLoading'),
  treeContext: $('#treeContext'),
  clearFocusButton: $('#clearFocusButton'),
  zoomInButton: $('#zoomInButton'),
  zoomOutButton: $('#zoomOutButton'),
  homeButton: $('#homeButton'),
  fullscreenButton: $('#fullscreenButton'),
  generationLegend: $('#generationLegend'),
  detailDrawer: $('#detailDrawer'),
  drawerContent: $('#drawerContent'), drawerTop: $('.drawer-top'), drawerBackdrop: $('#drawerBackdrop'), drawerPanel: $('.drawer-panel'),
  closeDrawer: $('#closeDrawer'),
  drawerBack: $('#drawerBack'),
  searchDialog: $('#searchDialog'),
  searchInput: $('#searchInput'),
  searchResults: $('#searchResults'),
  closeSearch: $('#closeSearch'),
  membersGrid: $('#membersGrid'),
  sortMembers: $('#sortMembers'),
  toast: $('#toast'),
  mobileMenu: $('#mobileMenu'),
  themeMenuButton: $('#themeMenuButton'),
  themeOptions: $('#themeOptions'),
  desktopThemeMenuButton: $('#desktopThemeMenuButton'),
  desktopThemeOptions: $('#desktopThemeOptions'),
};

let data = null;
let graph = null;
let renderer = null;
let selectedId = null;
let profilePersonId = null;
let lineageMode = 'all';
let drawerHistory = [];
let drawerTouchStart = null;
let searchMatches = [];
let searchCursor = -1;
let toastTimer = null;

function romanNumeral(number) {
  const numerals = ['I', 'V', 'X', 'L', 'C', 'D', 'M'];
  if (number > 6) return String(number);
  return number === 1 ? numerals[0] : number === 2 ? 'II' : number === 3 ? 'III' : number === 4 ? 'IV' : number === 5 ? 'V' : 'VI';
}

const colorThemeLabels = { blue: 'Xanh dương', red: 'Đỏ', yellow: 'Vàng', green: 'Xanh lá cây', orange: 'Cam' };
const colorThemeKeys = Object.keys(colorThemeLabels);
elements.desktopThemeOptions.innerHTML = elements.themeOptions.innerHTML;

function applyTheme(theme) {
  const selectedTheme = theme === 'light' || theme === 'dark' ? theme : 'dark';
  elements.root.dataset.theme = selectedTheme;
  elements.root.style.colorScheme = selectedTheme === 'dark' ? 'dark' : 'light';
  const computedBackground = getComputedStyle(elements.root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', computedBackground || (selectedTheme === 'dark' ? '#19221e' : '#f5f1e9'));
  localStorage.setItem('family-tree-theme', selectedTheme);
  const iconName = selectedTheme === 'dark' ? 'moon' : 'sun';
  $('#themeButton').innerHTML = icon(iconName);
  const appearanceLabel = selectedTheme === 'dark' ? 'tối' : 'sáng';
  $('#themeButton').setAttribute('aria-label', 'Giao diện: ' + appearanceLabel);
  $('#mobileThemeButton').textContent = 'Đổi giao diện · ' + appearanceLabel;
}

function applyColorTheme(colorTheme) {
  const selectedTheme = colorThemeKeys.includes(colorTheme) ? colorTheme : 'blue';
  elements.root.dataset.colorTheme = selectedTheme;
  localStorage.setItem('family-tree-color-theme', selectedTheme);
  $$('.theme-option').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.colorTheme === selectedTheme));
  });
  elements.themeMenuButton.setAttribute('aria-label', 'Chủ đề: ' + colorThemeLabels[selectedTheme]);
}

function toggleColorThemeMenu(force, options = elements.themeOptions, trigger = elements.themeMenuButton) {
  const open = typeof force === 'boolean' ? force : options.hidden;
  options.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}

function cycleTheme() {
  const current = elements.root.dataset.theme || 'system';
  const systemIsDark = current === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const next = current === 'dark' || systemIsDark ? 'light' : 'dark';
  applyTheme(next);
  showToast('Đã chuyển sang giao diện ' + (next === 'dark' ? 'tối' : 'sáng') + '.');
}

function familyMonogram(familyName) {
  const words = String(familyName || '').trim().split(/\s+/).filter(Boolean);
  const lastWord = (words.at(-1) || 'G').replace(/[^\p{L}\p{N}]/gu, '');
  return Array.from(lastWord || 'G')[0].toLocaleUpperCase('vi-VN');
}

function formatDate(date) {
  if (!date) return 'Chưa cập nhật';
  try { return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T00:00:00`)); } catch { return date; }
}

function siblingRelationLabel(relative, older) {
  if (older) return relative.gender === 'female' ? 'Chị' : relative.gender === 'male' ? 'Anh' : 'Anh / chị';
  return relative.gender === 'female' ? 'Em gái' : relative.gender === 'male' ? 'Em trai' : 'Em';
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
}

function setLoginLoading(isLoading) {
  elements.loginButton.disabled = isLoading;
  elements.loginButton.classList.toggle('is-loading', isLoading);
  elements.username.disabled = isLoading;
  elements.password.disabled = isLoading;
  elements.rememberLogin.disabled = isLoading;
}

function getFocusIds() {
  if (!selectedId || lineageMode === 'all') return null;
  const { ancestors, descendants } = relationSets(graph, selectedId);
  const focus = new Set([selectedId]);
  if (lineageMode === 'ancestors' || lineageMode === 'lineage') ancestors.forEach((id) => focus.add(id));
  if (lineageMode === 'descendants' || lineageMode === 'lineage') descendants.forEach((id) => focus.add(id));
  return focus;
}

function updateTreeFocus() {
  if (!renderer) return;
  const focusIds = getFocusIds();
  renderer.updateFocus(selectedId, focusIds);
  elements.clearFocusButton.hidden = !selectedId;
  const contextLabel = elements.treeContext.querySelector('span:last-child');
  if (contextLabel) contextLabel.textContent = selectedId ? `Đang xem ${graph.byId.get(selectedId)?.fullName || 'thành viên'}` : 'Toàn bộ gia phả';
  elements.treeContext.querySelector('.context-dot')?.classList.toggle('is-focus', Boolean(selectedId));
}

function selectPerson(id, options = {}) {
  if (!graph?.byId.has(id)) return;
  const { openDrawer = true, pushHistory = false, center = true, fromHistory = false } = options;
  if (!pushHistory && !fromHistory) drawerHistory = [];
  if (pushHistory && selectedId && selectedId !== id) drawerHistory.push(selectedId);
  selectedId = id;
  profilePersonId = openDrawer ? id : null;
  lineageMode = 'all';
  updateTreeFocus();
  renderer?.centerOn(id, center);
  renderDetail(id);
  if (openDrawer) {
    const fullscreenExit = isTreeFullscreen() ? toggleTreeFullscreen() : Promise.resolve();
    fullscreenExit.then(() => openDrawerPanel());
  }
}

function openMemberProfile(id) {
  if (!graph?.byId.has(id)) return;
  if (profilePersonId === id && elements.detailDrawer.classList.contains('is-open')) return;
  selectPerson(id);
}

function renderGenerationRail() {
  const track = $('.generation-rail-track', elements.generationLegend);
  if (!track) return;
  track.innerHTML = Array.from({ length: graph.maxGeneration + 1 }, (_, generation) => `<button class="generation-rail-button" data-generation="${generation}" aria-label="Xem thế hệ ${generation + 1}"><span>THẾ HỆ ${romanNumeral(generation + 1)}</span></button>`).join('');
  $$('.generation-rail-button', track).forEach((button) => button.addEventListener('click', () => renderer?.focusGeneration(Number(button.dataset.generation))));
  updateGenerationRail();
}

function updateGenerationRail() {
  if (!renderer || !graph) return;
  const track = $('.generation-rail-track', elements.generationLegend);
  if (!track) return;
  const metrics = renderer.getGenerationRailMetrics();
  track.style.height = `${metrics.trackHeight}px`;
  metrics.positions.forEach(({ generation, top, height }) => {
    const button = track.querySelector(`[data-generation="${generation}"]`);
    if (!button) return;
    button.style.top = `${top}px`;
    button.style.height = `${Math.max(45, Math.min(72, height + 28))}px`;
    button.classList.toggle('active', renderer.activeGeneration === generation);
  });
}

function renderDetail(id) {
  const person = graph.byId.get(id);
  if (!person) return;
  const parents = graph.parentIds.get(id) || [];
  const children = graph.childrenByParent.get(id) || [];
  const spouses = person.spouseIds.filter((spouseId) => graph.byId.has(spouseId));
  const siblingMembers = [...(graph.siblingsByMember.get(id) || [])].map((siblingId) => graph.byId.get(siblingId)).filter(Boolean).sort((left, right) => (getSiblingOrder(left) ?? Number.MAX_SAFE_INTEGER) - (getSiblingOrder(right) ?? Number.MAX_SAFE_INTEGER) || left.fullName.localeCompare(right.fullName, 'vi'));
  const currentSiblingOrder = getSiblingOrder(person);
  const olderSiblings = currentSiblingOrder === null ? [] : siblingMembers.filter((relative) => { const order = getSiblingOrder(relative); return order !== null && order < currentSiblingOrder; });
  const youngerSiblings = currentSiblingOrder === null ? [] : siblingMembers.filter((relative) => { const order = getSiblingOrder(relative); return order !== null && order > currentSiblingOrder; });
  const unrankedSiblings = currentSiblingOrder === null ? siblingMembers : siblingMembers.filter((relative) => getSiblingOrder(relative) === null);
  const relationButton = (relationId, relationLabel) => {
    const relative = graph.byId.get(relationId);
    const label = typeof relationLabel === 'function' ? relationLabel(relative) : relationLabel;
    return `<button class="relation-button" data-relative-id="${escapeHtml(relative.id)}"><span class="relation-avatar">${escapeHtml(initials(relative.fullName))}</span><span class="relation-text"><strong>${escapeHtml(relative.fullName)}</strong><span>${escapeHtml(label)} · ${escapeHtml(lifeDates(relative))}</span></span>${icon('arrow-left')}</button>`;
  };
  const relationBlock = (label, ids, relationLabel) => ids.length ? `<div class="drawer-block"><h3>${label}</h3><div class="relation-list">${ids.map((relationId) => relationButton(relationId, relationLabel)).join('')}</div></div>` : '';
  const facts = [
    `<div class="person-fact">${icon('calendar')}<strong>${escapeHtml(formatDate(person.birthDate))}</strong><span>Ngày sinh</span></div>`,
    `<div class="person-fact">${icon('pin')}<strong>${escapeHtml(person.birthPlace || 'Chưa cập nhật')}</strong><span>Nơi sinh</span></div>`,
    `<div class="person-fact">${icon('briefcase')}<strong>${escapeHtml(person.occupation || 'Chưa cập nhật')}</strong><span>Nghề nghiệp</span></div>`,
    `<div class="person-fact">${icon('calendar')}<strong>${escapeHtml(formatDate(person.deathDate))}</strong><span>Ngày mất</span></div>`,
  ];
  elements.drawerContent.innerHTML = `<div class="person-hero">${avatarMarkup(person, 'person-hero-avatar')}<div><h2 id="detailName">${escapeHtml(person.fullName)}</h2><p class="person-years">${escapeHtml(lifeDates(person))}</p></div></div><div class="person-facts">${facts.join('')}</div>${relationBlock('Cha mẹ', parents, 'Cha / mẹ')}${relationBlock('Vợ / chồng', spouses, 'Vợ / chồng')}${currentSiblingOrder === null ? relationBlock('Anh / chị / em ruột', unrankedSiblings.map((relative) => relative.id), 'Anh / chị / em ruột') : `${relationBlock('Anh / Chị', olderSiblings.map((relative) => relative.id), (relative) => siblingRelationLabel(relative, true))}${relationBlock('Em', youngerSiblings.map((relative) => relative.id), (relative) => siblingRelationLabel(relative, false))}${relationBlock('Anh / chị / em ruột · chưa có thứ tự', unrankedSiblings.map((relative) => relative.id), 'Chưa xác định thứ tự')}`}${relationBlock('Con cái', children, 'Con cái')}${person.note ? `<div class="drawer-block"><h3>Ghi chú</h3><p class="person-note">${escapeHtml(person.note)}</p></div>` : ''}<div class="drawer-block"><h3>Xem dòng trực hệ</h3><div class="lineage-actions"><button class="lineage-button ${lineageMode === 'ancestors' ? 'active' : ''}" data-lineage="ancestors">Tổ tiên</button><button class="lineage-button ${lineageMode === 'descendants' ? 'active' : ''}" data-lineage="descendants">Hậu duệ</button><button class="lineage-button ${lineageMode === 'lineage' ? 'active' : ''}" data-lineage="lineage">Hai chiều</button></div></div>`;
  wirePhotoFallbacks(elements.drawerContent);
  $$('.relation-button', elements.drawerContent).forEach((button) => button.addEventListener('click', () => selectPerson(button.dataset.relativeId, { pushHistory: true })));
  $$('.lineage-button', elements.drawerContent).forEach((button) => button.addEventListener('click', () => {
    lineageMode = button.dataset.lineage;
    updateTreeFocus();
    renderDetail(id);
  }));
  elements.drawerBack.hidden = drawerHistory.length === 0;
}

function openDrawerPanel() {
  elements.detailDrawer.classList.add('is-open');
  elements.detailDrawer.setAttribute('aria-hidden', 'false');
  setTimeout(() => elements.closeDrawer.focus(), 100);
}

function closeDrawerPanel() {
  elements.detailDrawer.classList.remove('is-open');
  elements.detailDrawer.setAttribute('aria-hidden', 'true');
  profilePersonId = null;
}

function renderMembers() {
  const sort = elements.sortMembers.value;
  const members = [...graph.members].sort((a, b) => {
    if (sort === 'birth') return String(a.birthDate || '9999').localeCompare(String(b.birthDate || '9999'));
    if (sort === 'generation') return graph.generations.get(a.id) - graph.generations.get(b.id) || a.fullName.localeCompare(b.fullName, 'vi');
    return a.fullName.localeCompare(b.fullName, 'vi');
  });
  elements.membersGrid.innerHTML = members.map((member) => `<button class="member-list-card" data-member-id="${escapeHtml(member.id)}">${avatarMarkup(member)}<span><h3>${escapeHtml(member.fullName)}</h3><p>${escapeHtml(lifeDates(member))} · Thế hệ ${graph.generations.get(member.id) + 1}</p></span>${icon('arrow-left')}</button>`).join('');
  wirePhotoFallbacks(elements.membersGrid);
  $$('.member-list-card', elements.membersGrid).forEach((button) => button.addEventListener('click', () => { switchView('tree'); selectPerson(button.dataset.memberId); }));
}

function switchView(view, options = {}) {
  const isTree = view === 'tree';
  elements.treeView.hidden = !isTree;
  elements.membersView.hidden = isTree;
  $$('.nav-button, .segment').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (!isTree) renderMembers();
  if (isTree && options.fit !== false) setTimeout(() => renderer?.fit(false), 20);
  closeMobileMenu();
}

function openSearch() {
  elements.searchDialog.showModal();
  elements.searchInput.value = '';
  searchMatches = [];
  searchCursor = -1;
  renderSearchResults('');
  setTimeout(() => elements.searchInput.focus(), 30);
}

function selectSearchResult(id) {
  elements.searchDialog.close();
  switchView('tree', { fit: false });
  requestAnimationFrame(() => selectPerson(id));
}

function isTreeFullscreen() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
  return fullscreenElement === elements.treeViewport || elements.treeViewport.classList.contains("is-app-fullscreen");
}

function updateFullscreenButton() {
  const active = isTreeFullscreen();
  elements.fullscreenButton.setAttribute("aria-pressed", String(active));
  elements.fullscreenButton.setAttribute("aria-label", active ? "Thoát toàn màn hình" : "Toàn màn hình");
  elements.fullscreenButton.querySelector("use")?.setAttribute("href", active ? "#icon-fullscreen-exit" : "#icon-fullscreen");
}

function toggleFallbackFullscreen(active) {
  elements.treeViewport.classList.toggle("is-app-fullscreen", active);
  document.body.classList.toggle("tree-fullscreen-fallback", active);
}

async function toggleTreeFullscreen() {
  if (!elements.treeViewport) return;
  try {
    if (isTreeFullscreen()) {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      else toggleFallbackFullscreen(false);
    } else if (elements.treeViewport.requestFullscreen) {
      await elements.treeViewport.requestFullscreen({ navigationUI: "hide" });
    } else if (elements.treeViewport.webkitRequestFullscreen) {
      elements.treeViewport.webkitRequestFullscreen();
    } else {
      toggleFallbackFullscreen(true);
    }
  } catch (error) {
    if (!isTreeFullscreen()) toggleFallbackFullscreen(true);
  }
  updateFullscreenButton();
}

function renderSearchResults(query) {
  if (!query) { elements.searchResults.innerHTML = '<div class="search-empty">Bắt đầu nhập để tìm trong gia phả.</div>'; return; }
  const normalized = normalizeText(query);
  searchMatches = graph.members.filter((member) => normalizeText(member.fullName).includes(normalized)).slice(0, 20);
  searchCursor = searchMatches.length ? 0 : -1;
  if (!searchMatches.length) { elements.searchResults.innerHTML = '<div class="search-empty">Không tìm thấy thành viên phù hợp.</div>'; return; }
  elements.searchResults.innerHTML = searchMatches.map((member, index) => `<button class="search-result ${index === 0 ? 'highlighted' : ''}" data-search-id="${escapeHtml(member.id)}">${avatarMarkup(member)}<span class="search-result-copy"><strong>${escapeHtml(member.fullName)}</strong><span>${escapeHtml(lifeDates(member))} · Thế hệ ${graph.generations.get(member.id) + 1}</span></span>${icon('arrow-left')}</button>`).join('');
  wirePhotoFallbacks(elements.searchResults);
  $$('.search-result', elements.searchResults).forEach((button) => button.addEventListener('click', () => {
    selectSearchResult(button.dataset.searchId);
  }));
}

function moveSearchCursor(delta) {
  if (!searchMatches.length) return;
  searchCursor = (searchCursor + delta + searchMatches.length) % searchMatches.length;
  $$('.search-result', elements.searchResults).forEach((button, index) => button.classList.toggle('highlighted', index === searchCursor));
  $$('.search-result', elements.searchResults)[searchCursor]?.scrollIntoView({ block: 'nearest' });
}

function populateApp() {
  graph = buildFamilyGraph(data);
  const familyName = data.family.name || 'Gia phả gia đình';
  elements.familyTitle.textContent = familyName;
  elements.familyDescription.textContent = data.family.description || 'Khám phá những mối liên kết giữa các thế hệ.';
  elements.brandName.textContent = familyName;
  elements.brandMonogram.textContent = familyMonogram(familyName);
  elements.memberCount.textContent = graph.members.length;
  elements.generationCount.textContent = graph.maxGeneration + 1;
  const roots = graph.members.filter((member) => (graph.parentIds.get(member.id) || []).length === 0);
  elements.branchCount.textContent = Math.max(1, roots.length);
  elements.todayLabel.textContent = 'Mở trong trình duyệt';
  renderer = new TreeRenderer(elements.treeSvg, elements.treeViewport, (id) => selectPerson(id), openMemberProfile, updateGenerationRail);
  renderer.render(graph);
  renderGenerationRail();
  requestAnimationFrame(() => { renderer.fit(false); elements.treeLoading.classList.add('is-done'); });
}

function showMainApp() {
  elements.loginScreen.hidden = true;
  elements.mainApp.hidden = false;
  populateApp();
  window.scrollTo(0, 0);
}

async function resetToLogin() {
  await signOut();
  renderer?.destroy();
  data = null; graph = null; renderer = null; selectedId = null; profilePersonId = null; drawerHistory = [];
  closeDrawerPanel();
  elements.mainApp.hidden = true;
  elements.loginScreen.hidden = false;
  elements.loginForm.reset();
  elements.loginError.textContent = '';
  setLoginLoading(false);
  elements.username.focus();
}

function closeMobileMenu() { elements.mobileMenu.hidden = true; }

async function handleLogin(event) {
  event.preventDefault();
  const username = elements.username.value.trim();
  const password = elements.password.value;
  elements.loginError.textContent = '';
  if (!username || !password) { elements.loginError.textContent = 'Vui lòng nhập đầy đủ thông tin để tiếp tục.'; return; }
  setLoginLoading(true);
  try {
    data = await signIn(username, password, { remember: elements.rememberLogin.checked });
    showMainApp();
  } catch (error) {
    console.error('Family data could not be opened:', error);
    elements.loginError.textContent = error.message === 'data-unavailable' ? 'Không thể mở dữ liệu gia phả lúc này.' : error.message === 'data-invalid' ? 'Dữ liệu gia phả có định dạng chưa hợp lệ.' : 'Thông tin đăng nhập chưa đúng hoặc dữ liệu không thể giải mã.';
    elements.password.select();
  } finally { setLoginLoading(false); }
}

elements.loginForm.addEventListener('submit', handleLogin);
elements.togglePassword.addEventListener('click', () => {
  const showing = elements.password.type === 'text';
  elements.password.type = showing ? 'password' : 'text';
  elements.togglePassword.setAttribute('aria-label', showing ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
});
$('#logoutButton').addEventListener('click', resetToLogin);
$('#mobileLogoutButton').addEventListener('click', resetToLogin);
$('#themeButton').addEventListener('click', cycleTheme);
$('#mobileThemeButton').addEventListener('click', cycleTheme);
elements.themeMenuButton.addEventListener('click', () => toggleColorThemeMenu());
elements.desktopThemeMenuButton.addEventListener('click', () => toggleColorThemeMenu(undefined, elements.desktopThemeOptions, elements.desktopThemeMenuButton));
$$('.theme-option').forEach((button) => button.addEventListener('click', () => {
  applyColorTheme(button.dataset.colorTheme);
  toggleColorThemeMenu(false);
  toggleColorThemeMenu(false, elements.desktopThemeOptions, elements.desktopThemeMenuButton);
  showToast('Đã chọn chủ đề ' + colorThemeLabels[button.dataset.colorTheme] + '.');
}));
$('#searchTrigger').addEventListener('click', openSearch);
$('#closeSearch').addEventListener('click', () => elements.searchDialog.close());
elements.searchDialog.addEventListener('click', (event) => { if (event.target === elements.searchDialog) elements.searchDialog.close(); });
elements.searchInput.addEventListener('input', (event) => renderSearchResults(event.target.value));
elements.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveSearchCursor(1); }
  if (event.key === 'ArrowUp') { event.preventDefault(); moveSearchCursor(-1); }
  if (event.key === 'Enter' && searchMatches[searchCursor]) selectSearchResult(searchMatches[searchCursor].id)
});
elements.closeDrawer.addEventListener('click', closeDrawerPanel);
elements.drawerBackdrop.addEventListener('click', (event) => {
  const point = { x: event.clientX, y: event.clientY };
  closeDrawerPanel();
  requestAnimationFrame(() => {
    const node = document.elementFromPoint(point.x, point.y)?.closest?.('[data-person-id]');
    if (node) selectPerson(node.dataset.personId);
  });
});
elements.drawerTop.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
  drawerTouchStart = { x: event.clientX, y: event.clientY };
  elements.drawerTop.setPointerCapture?.(event.pointerId);
}, { passive: true });
const finishDrawerSwipe = (event) => {
  if (!drawerTouchStart) return;
  const deltaX = event.clientX - drawerTouchStart.x;
  const deltaY = event.clientY - drawerTouchStart.y;
  drawerTouchStart = null;
  if (deltaY > 55 && deltaY > Math.abs(deltaX) * 1.1) closeDrawerPanel();
};
elements.drawerTop.addEventListener("pointerup", finishDrawerSwipe);
elements.drawerTop.addEventListener("pointercancel", () => { drawerTouchStart = null; });
elements.drawerBack.addEventListener('click', () => { const previousId = drawerHistory.pop(); if (previousId) selectPerson(previousId, { pushHistory: false, fromHistory: true }); });
elements.clearFocusButton.addEventListener('click', () => { selectedId = null; lineageMode = 'all'; renderer?.updateFocus(null, null); renderer?.setActiveGeneration(null); elements.clearFocusButton.hidden = true; elements.treeContext.querySelector('span:last-child').textContent = 'Toàn bộ gia phả'; closeDrawerPanel(); });
$('#fitButton').addEventListener('click', () => renderer?.fit());
elements.zoomInButton.addEventListener('click', () => renderer?.zoomAt(1.18));
elements.zoomOutButton.addEventListener('click', () => renderer?.zoomAt(.84));
elements.homeButton.addEventListener('click', () => { const rootId = data?.family?.rootPersonId; if (rootId && graph.byId.has(rootId)) { selectPerson(rootId, { openDrawer: false, center: true }); } else renderer?.fit(); });
elements.fullscreenButton.addEventListener("click", toggleTreeFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
updateFullscreenButton();
elements.sortMembers.addEventListener('change', renderMembers);
$$('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#mobileMenuButton').addEventListener('click', () => { elements.mobileMenu.hidden = !elements.mobileMenu.hidden; });
document.addEventListener('click', (event) => { if (!elements.mobileMenu.hidden && !event.target.closest('#mobileMenu, #mobileMenuButton')) { toggleColorThemeMenu(false); closeMobileMenu(); }
  if (!event.target.closest('.desktop-theme-menu')) toggleColorThemeMenu(false, elements.desktopThemeOptions, elements.desktopThemeMenuButton); });
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !elements.mainApp.hidden) { event.preventDefault(); openSearch(); }
  if (event.key === 'Escape') { toggleColorThemeMenu(false); toggleColorThemeMenu(false, elements.desktopThemeOptions, elements.desktopThemeMenuButton); closeMobileMenu(); if (elements.detailDrawer.classList.contains('is-open')) closeDrawerPanel(); }
});

applyColorTheme(localStorage.getItem('family-tree-color-theme') || 'blue');
applyTheme(localStorage.getItem('family-tree-theme') || 'dark');
elements.username.focus();

void (async () => {
  const rememberedData = await restoreRememberedSession();
  if (rememberedData && elements.loginScreen && !elements.loginScreen.hidden) {
    data = rememberedData;
    showMainApp();
  }
})();
