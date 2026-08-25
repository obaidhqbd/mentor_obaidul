import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from 'https://esm.sh/@codemirror/view@6.36.5';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from 'https://esm.sh/@codemirror/commands@6.8.1';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, closeBrackets } from 'https://esm.sh/@codemirror/language@6.11.1';
import { html } from 'https://esm.sh/@codemirror/lang-html@6.4.9';
import { css } from 'https://esm.sh/@codemirror/lang-css@6.3.1';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6.2.2';
import { autocompletion, closeBracketsKeymap, completionKeymap } from 'https://esm.sh/@codemirror/autocomplete@6.18.6';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const $ = (s) => document.querySelector(s);
const classGrid = $('#classGrid');
const filtersEl = $('#filters');
const workspaceShell = $('#workspaceShell');
const workspaceEmpty = $('#workspaceEmpty');
const searchInput = $('#search');

let classes = [];
let siteConfig = {};
let activeClass = null;
let files = new Map();
let editorView = null;
let activeFile = null;
let previewObjectUrl = null;
let saveTimer = null;
let previewDebounce = null;
let currentFilter = 'All';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

async function boot() {
  try {
    const siteConfigRes = getJSON('site.config.json').catch(() => getJSON('site-config.json')).catch(() => ({}));
    [classes, siteConfig] = await Promise.all([getJSON('classes.json'), siteConfigRes]);

    applyBrand();
    buildFilters();
    renderClasses();

    if (searchInput) searchInput.addEventListener('input', renderClasses);
    window.addEventListener('keydown', onGlobalShortcut);

    // Hash check for direct workspace link
    if (location.hash.startsWith('#workspace/')) {
      const classId = decodeURIComponent(location.hash.replace('#workspace/', ''));
      openClass(classId);
    }
  } catch (err) {
    if (classGrid) {
      classGrid.innerHTML = `<div class="empty">Could not load the project library: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function applyBrand() {
  const b = siteConfig.brand ?? {};
  if ($('#brandName')) $('#brandName').textContent = b.name || 'Web Lab';
  if ($('#brandRole')) $('#brandRole').textContent = b.role || 'Learning Lab';
  if ($('#brandTagline')) $('#brandTagline').textContent = b.tagline || 'Learn. Code. Experiment. Build.';
  if ($('#brandDescription')) $('#brandDescription').textContent = b.description || 'A hands-on coding lab.';
  if ($('#footerBrand')) $('#footerBrand').textContent = b.name || 'Web Lab';
  if ($('#brandMark')) $('#brandMark').textContent = b.shortName || initials(b.name || 'Web Lab');
  document.title = `${b.name || 'Web Lab'} · ${b.role || 'Learning Lab'}`;
}

function initials(name) { return name.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase(); }

function buildFilters() {
  if (!filtersEl) return;
  const cats = ['All', ...new Set(classes.map(c => c.category).filter(Boolean))];
  filtersEl.innerHTML = cats.map(cat => `<button class="filter ${cat === currentFilter ? 'active' : ''}" data-filter="${escapeAttr(cat)}">${escapeHtml(cat)}</button>`).join('');
  filtersEl.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; buildFilters(); renderClasses(); }));
}

function renderClasses() {
  if (!classGrid) return;
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const visible = classes.filter(c => {
    const hay = [c.title, c.name, c.description, c.category, c.level, ...(c.tags || [])].join(' ').toLowerCase();
    return (currentFilter === 'All' || c.category === currentFilter) && hay.includes(q);
  });

  if ($('#classCount')) $('#classCount').textContent = classes.length;
  if ($('#emptyState')) $('#emptyState').hidden = visible.length > 0;

  classGrid.innerHTML = visible.map(c => cardTemplate(c)).join('');
  classGrid.querySelectorAll('.class-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    card.addEventListener('click', () => openClass(card.dataset.id));
  });
}

function cardTemplate(c) {
  const id = c.id || c.slug;
  const title = c.title || c.name || 'Untitled Class';
  return `<article class="class-card" data-id="${escapeAttr(id)}">
    <div class="card-top">
      <span class="card-id">${escapeHtml(id)}</span>
      <span class="card-level">${escapeHtml(c.level || 'Project')}</span>
    </div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(c.description || '')}</p>
    <div class="tags">${(c.tags || []).slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    <div class="card-bottom">
      <span>${escapeHtml(c.category || 'Web Development')} · ${escapeHtml(c.duration || 'Self-paced')}</span>
      <b>→</b>
    </div>
  </article>`;
}

async function openClass(id) {
  activeClass = classes.find(c => (c.id === id || c.slug === id));
  if (!activeClass) return;

  const classId = activeClass.id || activeClass.slug;
  location.hash = `workspace/${encodeURIComponent(classId)}`;

  if ($('#workspaceSubtitle')) {
    $('#workspaceSubtitle').textContent = `${activeClass.title || activeClass.name} · edit, preview and export your version.`;
  }
  if (workspaceEmpty) workspaceEmpty.remove();
  if (workspaceShell) workspaceShell.innerHTML = workspaceTemplate(activeClass);

  setupWorkspace();
  await loadProject(activeClass);
  document.querySelector('#workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function workspaceTemplate(c) {
  const classId = c.id || c.slug;
  return `<div class="editor-shell" id="editorShell">
    <aside class="files-panel">
      <div class="panel-head"><span>PROJECT</span><span class="project-title">${escapeHtml(classId)}</span></div>
      <div class="file-list" id="fileList"></div>
    </aside>
    <section class="editor-panel">
      <div class="toolbar">
        <button class="tool-btn" data-action="save">Save</button>
        <button class="tool-btn" data-action="reset">Reset</button>
        <button class="tool-btn" data-action="undo">Undo</button>
        <button class="tool-btn" data-action="redo">Redo</button>
        <span class="toolbar-spacer"></span>
        <button class="tool-btn" data-action="editor-full">Editor ⛶</button>
        <button class="tool-btn" data-action="preview-mode">Preview</button>
      </div>
      <div class="editor-wrap"><div class="code-host" id="codeHost"></div></div>
      <div class="statusbar">
        <span class="status-dot"></span>
        <span id="saveStatus">Ready</span>
        <span id="languageStatus">—</span>
      </div>
    </section>
    <section class="preview-panel">
      <div class="toolbar">
        <span class="project-title">LIVE PREVIEW</span>
        <span class="toolbar-spacer"></span>
        <button class="tool-btn" data-action="refresh">Refresh</button>
        <button class="tool-btn" data-action="preview-full">Preview ⛶</button>
        <button class="tool-btn" data-action="download">Download ZIP</button>
      </div>
      <div class="preview-wrap"><iframe id="previewFrame" sandbox="allow-scripts allow-forms allow-modals"></iframe></div>
    </section>
  </div>`;
}

function setupWorkspace() {
  const root = $('#workspaceShell');
  if (!root) return;
  root.querySelector('[data-action="save"]').onclick = () => saveCurrent(true);
  root.querySelector('[data-action="reset"]').onclick = () => resetProject();
  root.querySelector('[data-action="undo"]').onclick = () => editorView && undo(editorView);
  root.querySelector('[data-action="redo"]').onclick = () => editorView && redo(editorView);
  root.querySelector('[data-action="refresh"]').onclick = () => updatePreview();
  root.querySelector('[data-action="download"]').onclick = () => downloadZip(true);
  root.querySelector('[data-action="editor-full"]').onclick = () => toggleFullscreen($('.editor-panel'));
  root.querySelector('[data-action="preview-full"]').onclick = () => toggleFullscreen($('.preview-panel'));
  root.querySelector('[data-action="preview-mode"]').onclick = () => $('#editorShell')?.classList.toggle('preview-mode');
}

async function loadProject(c) {
  files.clear(); activeFile = null; editorView?.destroy(); editorView = null;
  const classId = c.id || c.slug;
  const stored = loadStored(classId);

  const fileList = c.files || ['index.html', 'style.css', 'script.js'];

  for (const rel of fileList) {
    if (rel === 'class.json') continue;
    const url = `classes/${encodeURIComponent(c.slug || classId)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const res = await fetch(url);
      if (!res.ok || isBinary(rel)) {
        files.set(rel, { binary: true, url, original: null });
        continue;
      }
      files.set(rel, { binary: false, url, original: await res.text() });
    } catch {
      files.set(rel, { binary: true, url, original: null });
    }
  }

  const editable = [...files.keys()].filter(r => isEditable(r));
  if (!editable.length) { showWorkspaceNotice('No editable source files were found in this class.'); return; }

  editable.forEach(rel => {
    const saved = stored?.files?.[rel];
    if (saved != null && files.get(rel)?.binary === false) files.get(rel).current = saved;
    else files.get(rel).current = files.get(rel).original;
  });

  renderFileList(editable);
  selectFile(c.entry && files.has(c.entry) ? c.entry : editable.find(r => /\.html?$/i.test(r)) || editable[0]);
  updatePreview();
}

function renderFileList(editable) {
  const fileListEl = $('#fileList');
  if (!fileListEl) return;
  fileListEl.innerHTML = editable.map(rel => `<button class="file-btn" data-file="${escapeAttr(rel)}"><span>${fileIcon(rel)}</span><span>${escapeHtml(rel)}</span></button>`).join('');
  fileListEl.querySelectorAll('.file-btn').forEach(btn => btn.onclick = () => selectFile(btn.dataset.file));
}

function selectFile(rel) {
  const item = files.get(rel); if (!item || item.binary) return;
  activeFile = rel;

  $('#fileList')?.querySelectorAll('.file-btn').forEach(b => b.classList.toggle('active', b.dataset.file === rel));
  editorView?.destroy();

  const language = rel.match(/\.html?$/i) ? html() : rel.match(/\.css$/i) ? css() : rel.match(/\.(js|mjs|ts)$/i) ? javascript({ typescript: /\.ts$/.test(rel) }) : [];
  const extensions = [
    lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
    history(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, ...completionKeymap, ...closeBracketsKeymap]),
    bracketMatching(), closeBrackets(), foldGutter(), indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    autocompletion({ activateOnTyping: true }), language,
    EditorView.updateListener.of(v => { if (v.docChanged) onEdit(); })
  ];

  const codeHost = $('#codeHost');
  if (codeHost) {
    editorView = new EditorView({ state: EditorState.create({ doc: item.current || '', extensions }), parent: codeHost });
  }

  const classId = activeClass.id || activeClass.slug;
  if ($('#languageStatus')) $('#languageStatus').textContent = extensionLabel(rel);
  if ($('#saveStatus')) $('#saveStatus').textContent = localExists(classId) ? 'Local changes available' : 'Original project';
}

function onEdit() {
  if (!editorView || !activeFile) return;
  files.get(activeFile).current = editorView.state.doc.toString();
  if ($('#saveStatus')) $('#saveStatus').textContent = 'Unsaved local edit';
  clearTimeout(saveTimer); saveTimer = setTimeout(() => saveCurrent(false), 350);
  clearTimeout(previewDebounce); previewDebounce = setTimeout(updatePreview, 450);
}

function saveCurrent(manual) {
  if (!activeClass) return;
  if (editorView && activeFile) files.get(activeFile).current = editorView.state.doc.toString();
  const out = { version: 1, files: {} };
  for (const [rel, item] of files) if (!item.binary && isEditable(rel)) out.files[rel] = item.current ?? item.original ?? '';

  const classId = activeClass.id || activeClass.slug;
  localStorage.setItem(storageKey(classId), JSON.stringify(out));
  if ($('#saveStatus')) $('#saveStatus').textContent = manual ? 'Saved locally' : 'Autosaved';
}

function loadStored(id) { try { return JSON.parse(localStorage.getItem(storageKey(id))); } catch { return null; } }
function localExists(id) { return !!localStorage.getItem(storageKey(id)); }
function storageKey(id) { return `future-web-lab:${id}`; }

async function resetProject() {
  const classId = activeClass?.id || activeClass?.slug;
  if (!activeClass || !confirm('Reset this project to the original files? Your local edits will be removed.')) return;
  localStorage.removeItem(storageKey(classId));
  await loadProject(activeClass);
  if ($('#saveStatus')) $('#saveStatus').textContent = 'Restored original';
}

function updatePreview() {
  if (!activeClass) return;
  const htmlFile = activeClass.entry || [...files.keys()].find(r => /(^|\/)index\.html$/i.test(r)) || [...files.keys()].find(r => /\.html?$/i.test(r));
  if (!htmlFile || !files.has(htmlFile)) return;

  let htmlText = files.get(htmlFile)?.current ?? files.get(htmlFile)?.original ?? '';
  htmlText = injectProject(htmlText, htmlFile);

  const blob = new Blob([htmlText], { type: 'text/html' });
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(blob);
  
  const iframe = $('#previewFrame');
  if (iframe) iframe.src = previewObjectUrl;
}

function injectProject(htmlText, entryFile) {
  const slug = activeClass.slug || activeClass.id;
  let out = htmlText.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
    const key = normalizePath(pathDir(entryFile), src); const f = files.get(key);
    return f && !f.binary ? `<script${a}${b}>\n${f.current ?? f.original ?? ''}\n<\/script>` : m;
  });
  out = out.replace(/<link\b([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (m, a, href, b) => {
    const key = normalizePath(pathDir(entryFile), href); const f = files.get(key);
    return f && !f.binary ? `<style${a}>\n${f.current ?? f.original ?? ''}\n<\/style>` : m;
  });
  const assetBase = `classes/${encodeURIComponent(slug)}/`;
  out = out.replace(/\b(src|href)=["']([^"']+)["']/gi, (m, attr, val) => {
    if (/^(https?:|data:|#|mailto:|javascript:)/i.test(val)) return m;
    const key = normalizePath(pathDir(entryFile), val);
    if (files.has(key) && files.get(key).binary) return `${attr}="${assetBase}${key.split('/').map(encodeURIComponent).join('/')}"`;
    return m;
  });
  return out;
}

async function downloadZip(edited) {
  if (!activeClass) return;
  const zip = new JSZip();
  const classId = activeClass.id || activeClass.slug;

  for (const [rel, item] of files) {
    if (rel === 'class.json') continue;
    if (item.binary) {
      try { const res = await fetch(item.url); if (res.ok) zip.file(rel, await res.blob()); } catch {}
    } else zip.file(rel, edited ? (item.current ?? item.original ?? '') : (item.original ?? ''));
  }

  zip.file('PROJECT-INFO.txt', `${activeClass.title || activeClass.name}\n${siteConfig.brand?.name || 'Web Lab'}\n\nGenerated by Web Lab.`);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${classId}${edited ? '-my-version' : ''}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function showWorkspaceNotice(text) {
  $('.editor-shell')?.remove();
  if (workspaceShell) workspaceShell.innerHTML = `<div class="workspace-empty"><div class="empty-icon">!</div><h3>Project needs attention</h3><p>${escapeHtml(text)}</p></div>`;
}

function toggleFullscreen(el) { if (el) { if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); } }
function onGlobalShortcut(e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInput?.focus(); } }
function isEditable(rel) { return /\.(html?|css|js|mjs|ts|json|md|svg)$/i.test(rel); }
function isBinary(rel) { return /\.(png|jpe?g|gif|webp|avif|mp4|webm|mp3|wav|ogg|woff2?|ttf|ico|pdf)$/i.test(rel); }
function extensionLabel(rel) { const e = rel.split('.').pop().toUpperCase(); return e === 'HTML' ? 'HTML' : e === 'CSS' ? 'CSS' : e === 'JS' || e === 'MJS' ? 'JavaScript' : e; }
function fileIcon(rel) { if (/\.html?$/i.test(rel)) return '◈'; if (/\.css$/i.test(rel)) return '◌'; if (/\.(js|mjs|ts)$/i.test(rel)) return '✦'; if (/\.(png|jpe?g|webp|svg)$/i.test(rel)) return '▧'; if (/\.(mp4|webm|mp3|wav|ogg)$/i.test(rel)) return '◉'; return '·'; }
function pathDir(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
function normalizePath(base, p) { const parts = (base ? base + '/' : '').split('/').concat(p.split('/')); const out = []; for (const x of parts) { if (!x || x === '.') continue; if (x === '..') out.pop(); else out.push(x); } return out.join('/'); }
function escapeHtml(s = '') { return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function escapeAttr(s = '') { return escapeHtml(s); }

boot();
