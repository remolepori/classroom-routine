(function($){
  const state = {
    data: null,
    section: 'morning'
  };

  let ACTIVE_PRESET = null;
  function setActivePreset(name){ ACTIVE_PRESET = name || null; }
  function getActivePreset(){ return ACTIVE_PRESET; }

  // -------- REST (robust) --------
  const rest = async (path, method='GET', body=null)=>{
    const res = await fetch(CR_DATA.rest + path, {
      method,
      headers: {'X-WP-Nonce': CR_DATA.nonce, 'Content-Type':'application/json'},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : null
    });

    if (res.status === 204) return { ok:true, status:204 };

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let payload = {};
    if (ct.includes('application/json')) {
      try { payload = await res.json() || {}; } catch(e){ payload = {}; }
    } else {
      try { const t = await res.text(); if (t && t.trim()) payload = { text:t }; } catch(e){}
    }
    if (!res.ok) {
      const msg = payload?.message || `HTTP ${res.status}`;
      const err = new Error(msg); err.status = res.status; err.response = payload; throw err;
    }
    return { ...payload, ok:true, status:res.status };
  };

  // ---------- INIT ----------
  $(document).ready(async function(){
    let server;
    try { server = await rest('state','GET'); } catch(e){ server = null; }
    state.data = server && server.state ? server.state : structuredClone(CR_DATA.defaults);

    setActivePreset(null);

    try {
      const {map, order} = await fetchPresets();
      const guess = detectActivePreset(map, state.data);
      if (guess) setActivePreset(guess);
    } catch(e) {
      console.warn('[CR] Detect active preset at start failed:', e);
    }

    injectRuntimeCss();
    renderSection('morning');
    bindControls();

    $(document).on('mousemove', function(e){
      const winHeight = $(window).height();
      const $bar = $('.cr-bottom-bar');
      if (winHeight - e.clientY < 80) $bar.addClass('visible'); else $bar.removeClass('visible');
    });
  });

  // ---------- RUNTIME CSS ----------
  function injectRuntimeCss(){
    if (document.getElementById('cr-emoji-runtime-css')) return;
    const css = `
      .cr-item{ display:flex; gap:12px; align-items:flex-start; }
      .cr-icon{ display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
      .cr-icon img{ width:100%; height:100%; object-fit:contain; display:block; }
      .cr-text{ flex:1 1 auto; min-width:0; }
      .cr-emoji-only{ display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding:10px; cursor:pointer; }

      .cr-toast{ position:fixed; left:50%; bottom:16px; transform:translateX(-50%) translateY(20px); opacity:0; transition:all .2s ease; background:#111; color:#fff; padding:10px 14px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,.2); z-index:9999; font-size:14px; line-height:1.2; }
      @media (prefers-color-scheme: dark){ .cr-toast{ background:#fff; color:#111; } }
      .cr-toast.show{ transform:translateX(-50%) translateY(0); opacity:1; }
      .cr-toast.success::before{ content:"✔ "; margin-right:2px; }
      .cr-toast.error{ background:#b00020; color:#fff; }
      .cr-toast.error::before{ content:"✖ "; margin-right:2px; }

      @keyframes cr-bump { 0%{transform:scale(1);} 30%{transform:scale(1.12);} 100%{transform:scale(1);} }
      .cr-action.saved { animation: cr-bump .35s ease; }

      .cr-preset-row { border-radius:8px; padding:6px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .cr-preset-row.is-active { background:#f3f4f6; border:1px solid #dadada; }
      .cr-badge-active{ display:inline-block; font-size:12px; line-height:1; padding:4px 6px; border-radius:6px; background:#e5e7eb; color:#111; margin-left:8px; }
      .cr-preset-row[draggable="true"] { cursor:grab; }
      .cr-preset-row.dragging { opacity:.5; }
      .cr-preset-row.drop-target { outline:2px dashed #9ca3af; }
      .cr-drag-handle { cursor:grab; background:#eee; border-radius:6px; padding:6px 8px; font-size:12px; }
      .cr-drag-handle:active { cursor:grabbing; }
      .cr-wait { position:relative; pointer-events:none; opacity:.7; }
      .cr-wait::after { content:""; position:absolute; right:-18px; top:50%; width:12px; height:12px; margin-top:-6px; border:2px solid #999; border-top-color:transparent; border-radius:50%; animation:cr-spin .7s linear infinite; }
      @keyframes cr-spin { to { transform:rotate(360deg); } }
    `;
    const style = document.createElement('style');
    style.id = 'cr-emoji-runtime-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function crToast(msg, variant='success', timeout=1400){
    const existing = document.querySelector('.cr-toast'); if (existing) existing.remove();
    const el = document.createElement('div'); el.className = `cr-toast ${variant}`; el.textContent = msg; document.body.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=> el.remove(), 250); }, timeout);
  }

  // ---------- Helpers: stabile Item-IDs ----------
  function ensureItemIds(sec){
    (sec.items || []).forEach(it=>{
      if (!it.id) it.id = 'it_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
    });
  }
  function findItemIndexById(sec, id){
    return (sec.items || []).findIndex(it => it.id === id);
  }

  // ---------- RENDER ----------
  function renderSection(key){
    state.section = key;
    const sec = state.data.sections[key];
    ensureItemIds(sec);

const $title = $('#cr-app .cr-title');
$title.attr('contenteditable', 'true')
  .text(sec.title || 'Ablauf')
  .off('.edit')
  .on('input.edit blur.edit', function(){ updateSectionTitle($(this).text()); });


    const $list = $('#cr-list').empty();

    (sec.items || []).forEach((item)=>{
      const $it = $('<div class="cr-item">')
        .attr('data-id', item.id)
        .css('position','relative');

      const $icon = $('<div class="cr-icon">');
      if (item.icon) {
        $icon.append($('<img>').attr('src', item.icon).attr('alt',''));
      } else {
        $icon
          .addClass('cr-emoji-only')
          .attr({'role':'button','tabindex':'0','aria-label':'Emoji wählen'})
          .text(item.emoji || '🖼️');
      }

      const $text = $('<div class="cr-text">');
const $h = $('<h3>').attr('data-edit','title').attr('contenteditable', 'true').text(item.title || '');
const $p = $('<p>').attr('data-edit','desc').attr('contenteditable', 'true').text(item.desc || '');

      $text.append($h, $p);

      $h.on('input blur', ()=>{
        const idx = findItemIndexById(sec, $it.attr('data-id'));
        if (idx >= 0) updateItem(idx, {title: $h.text()});
      });
      $p.on('input blur', ()=>{
        const idx = findItemIndexById(sec, $it.attr('data-id'));
        if (idx >= 0) updateItem(idx, {desc: $p.text()});
      });

      // Buttons – Handler werden delegiert auf #cr-list
      const $del = $('<button type="button" class="cr-delete" aria-label="Eintrag löschen" title="Löschen">×</button>');
      const $move = $('<div class="cr-move">');
      const $up = $('<button type="button" class="cr-move-up" aria-label="Nach oben">▲</button>');
      const $down = $('<button type="button" class="cr-move-down" aria-label="Nach unten">▼</button>');
      $move.append($up, $down);

      $it.append($icon, $text, $del, $move);
      $list.append($it);
    });

    const $add = $('<div class="cr-add" role="button" tabindex="0">')
      .append('<span class="cr-plus">＋</span><span>Neuen Eintrag hinzufügen</span>')
      .on('click keypress', (e)=>{ if(e.type==='click'||e.key==='Enter') addNewItemAtEnd(); });
    $list.append($add);

    $(document).off('mousemove.crAdd').on('mousemove.crAdd', function(e){
      if (!$add.is(':visible')) return;
      const rect = $add[0].getBoundingClientRect();
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist <= 20) $add.addClass('visible'); else $add.removeClass('visible');
    });

    // Delegation NUR an #cr-list binden (erneut pro Render)
    bindListHandlers($list);
  }

  // ---------- Delegierte List-Handler (Icon/Emoji, löschen, verschieben) ----------
  function bindListHandlers($list){
    const NS = '.crList';
    $list.off(NS);

  // Icon-Klicks (Emoji-Picker oder Medienauswahl) delegieren
  $list.on('click' + NS, '.cr-emoji-only, .cr-icon img, .cr-icon', function(e){
    e.preventDefault();
    e.stopPropagation();

    const $icon = $(e.target).closest('.cr-icon');
    const $row  = $icon.closest('.cr-item');
    const id    = $row.attr('data-id');
    const sec   = state.data.sections[state.section];
    const idx   = findItemIndexById(sec, id);
    if (idx < 0) return;

    if ($icon.hasClass('cr-emoji-only')) {
      chooseEmojiForItem(idx);
    } else if ($icon.find('img').length) {
      chooseMediaForItem(idx);
    } else {
      chooseEmojiForItem(idx);
    }
  });


// Tastaturbedienung für Emoji-Elemente (Enter/Space)
$list.on('keydown' + NS, '.cr-emoji-only', function(e){
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  e.stopPropagation();
  const $row = $(this).closest('.cr-item');
  const id   = $row.attr('data-id');
  const sec  = state.data.sections[state.section];
  const idx  = findItemIndexById(sec, id);
  if (idx >= 0) chooseEmojiForItem(idx);
});


    // Löschen
    $list.on('click'+NS, '.cr-delete', function(e){
      e.preventDefault(); e.stopPropagation();
      const $row = $(this).closest('.cr-item');
      const id = $row.attr('data-id');
      const sec = state.data.sections[state.section];
      const idx = findItemIndexById(sec, id);
      if (idx >= 0) removeItem(idx);
    });

    // Nach oben
    $list.on('click'+NS, '.cr-move-up', function(e){
      e.preventDefault(); e.stopPropagation();
      const $row = $(this).closest('.cr-item');
      const id = $row.attr('data-id');
      const sec = state.data.sections[state.section];
      const idx = findItemIndexById(sec, id);
      if (idx >= 0) moveItem(idx, -1);
    });

    // Nach unten
    $list.on('click'+NS, '.cr-move-down', function(e){
      e.preventDefault(); e.stopPropagation();
      const $row = $(this).closest('.cr-item');
      const id = $row.attr('data-id');
      const sec = state.data.sections[state.section];
      const idx = findItemIndexById(sec, id);
      if (idx >= 0) moveItem(idx, 1);
    });
  }

function updateSectionTitle(newTitle){
    state.data.sections[state.section].title = newTitle;
    if (CR_DATA.isAuth) debounceSave();
}


function updateItem(idx, patch){
    const items = state.data.sections[state.section].items;
    items[idx] = { ...items[idx], ...patch };
    if (CR_DATA.isAuth) debounceSave();
}


  function addNewItemAtEnd(){
    const sec = state.data.sections[state.section];
    const base = {id:'it_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7), emoji:'🟢', title:'Neuer Punkt', desc:'Beschreibung', icon:''};
    sec.items.push(base);
    renderSection(state.section);
    debounceSave();
  }

  function chooseMediaForItem(idx){
    if (!CR_DATA.isAuth) return;
    const frame = wp.media({title:'Icon/Bild wählen', button:{text:'Übernehmen'}, multiple:false});
    frame.on('select', function(){
      const att = frame.state().get('selection').first().toJSON();
      updateItem(idx, {icon: att.url, emoji:''});
      renderSection(state.section);
    });
    frame.open();
  }

  // ====== EMOJI PICKER ======
  const CR_EMOJI_SCRIPT_URL = (window.CR_DATA && CR_DATA.emojiScriptUrl)
    ? CR_DATA.emojiScriptUrl
    : (window.CR_PLUGIN_URL ? (CR_PLUGIN_URL + '/assets/emoji-categories.js') : '/wp-content/plugins/classroom-routine/assets/emoji-categories.js');

  const CR_EMOJI_JSON_URL = (window.CR_DATA && CR_DATA.emojiJsonUrl) 
    ? CR_DATA.emojiJsonUrl 
    : (window.CR_PLUGIN_URL ? (CR_PLUGIN_URL + '/assets/emoji-full.json') : '/wp-content/plugins/classroom-routine/assets/emoji-full.json');

  const CR_EMOJI_TABS = [
    { key: 'smileys_emotion', label: 'Smileys & Gefühle' },
    { key: 'people_body',     label: 'Menschen & Körper' },
    { key: 'animals_nature',  label: 'Tiere & Natur' },
    { key: 'food_drink',      label: 'Essen & Trinken' },
    { key: 'travel_places',   label: 'Reisen & Orte' },
    { key: 'activities',      label: 'Aktivitäten' },
    { key: 'objects',         label: 'Gegenstände' },
    { key: 'symbols',         label: 'Symbole' },
    { key: 'flags',           label: 'Flaggen' }
  ];

  let CR_EMOJI_DB = null;
  let CR_EMOJI_ACTIVE_TAB = 'smileys_emotion';
  let CR_EMOJI_SEARCH = '';
  let CR_EMOJI_TONE = 'default';

  const CR_TONE_SUFFIX = {
    'default': '',
    'light': '\u{1F3FB}',
    'medium-light': '\u{1F3FC}',
    'medium': '\u{1F3FD}',
    'medium-dark': '\u{1F3FE}',
    'dark': '\u{1F3FF}'
  };

  function ensureEmojiDialog(){
    let dlg = document.getElementById('cr-emoji-dialog');
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = 'cr-emoji-dialog';
    dlg.className = 'cr-dialog cr-emoji-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="cr-dialog-inner">
        <div class="cr-emoji-header">
          <div class="cr-emoji-tabs" role="tablist" aria-label="Emoji Kategorien"></div>
          <div class="cr-emoji-tools">
            <input type="search" id="cr-emoji-search" placeholder="Suchen (in Englisch)..." aria-label="Emoji suchen" />
          </div>
        </div>
        <div class="cr-emoji-grid-wrap">
          <div class="cr-emoji-grid" id="cr-emoji-grid" role="grid" aria-label="Emoji Auswahl"></div>
        </div>
        <div class="cr-dialog-actions">
          <button value="close" class="cr-btn">Schliessen</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);

    const $tabs = dlg.querySelector('.cr-emoji-tabs');
    CR_EMOJI_TABS.forEach(t=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cr-emoji-tab';
      btn.setAttribute('role','tab');
      btn.setAttribute('data-key', t.key);
      btn.textContent = t.label;
      if (t.key === CR_EMOJI_ACTIVE_TAB) btn.classList.add('active');
      btn.addEventListener('click', ()=>{
        CR_EMOJI_ACTIVE_TAB = t.key;
        dlg.querySelectorAll('.cr-emoji-tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        renderEmojiGrid(dlg);
      });
      $tabs.appendChild(btn);
    });

    const $search = dlg.querySelector('#cr-emoji-search');
    $search.addEventListener('input', ()=>{
      CR_EMOJI_SEARCH = ($search.value || '').trim().toLowerCase();
      renderEmojiGrid(dlg);
    });

    return dlg;
  }

  function loadScriptOnce(src){
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-cr-emoji="${src}"]`);
      if (existing) {
        if (window.categories && typeof window.categories === 'object') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Emoji-Script konnte nicht geladen werden.')));
        return;
      }
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true; s.dataset.crEmoji = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Emoji-Script konnte nicht geladen werden.'));
      document.head.appendChild(s);
    });
  }

  async function loadEmojiDb(){
    if (CR_EMOJI_DB) return CR_EMOJI_DB;

    try {
      await loadScriptOnce(CR_EMOJI_SCRIPT_URL);
      if (window.categories && typeof window.categories === 'object') {
        CR_EMOJI_DB = { version:'from-script', categories: window.categories };
        return CR_EMOJI_DB;
      }
    } catch(e){ console.warn('[CR] Emoji-Script nicht verfügbar, nutze JSON-Fallback.', e); }

    try {
      const res = await fetch(CR_EMOJI_JSON_URL, { cache: 'force-cache' });
      CR_EMOJI_DB = await res.json();
    } catch(e) {
      console.warn('[CR] Emoji-JSON nicht verfügbar, nutze Mini-Fallback.', e);
      CR_EMOJI_DB = {
        version: 'fallback',
        categories: {
          smileys: [
            { emoji:'😀', name:'grinning face', keywords:['smile','happy'] },
            { emoji:'😂', name:'face with tears of joy', keywords:['laugh','joy'] },
            { emoji:'😉', name:'winking face', keywords:['wink'] },
            { emoji:'😍', name:'smiling face with heart-eyes', keywords:['love'] }
          ],
          people: [
            { emoji:'👍', name:'thumbs up', keywords:['ok'], tones:true },
            { emoji:'👋', name:'waving hand', keywords:['hello'], tones:true }
          ],
          animals: [{ emoji:'🐶', name:'dog', keywords:['animal','pet'] }, { emoji:'🐱', name:'cat', keywords:['animal'] }],
          food: [{ emoji:'🍎', name:'red apple', keywords:['fruit'] }, { emoji:'🍕', name:'pizza', keywords:['food'] }],
          travel: [{ emoji:'✈️', name:'airplane', keywords:['travel'] }, { emoji:'🚗', name:'car', keywords:['car'] }],
          activities: [{ emoji:'⚽', name:'soccer ball', keywords:['sport'] }],
          objects: [{ emoji:'📝', name:'memo', keywords:['note'] }, { emoji:'📚', name:'books', keywords:['study'] }],
          symbols: [{ emoji:'✅', name:'check mark', keywords:['check'] }, { emoji:'❌', name:'cross mark', keywords:['x'] }],
          flags: [{ emoji:'🇨🇭', name:'flag: Switzerland', keywords:['flag','ch'] }, { emoji:'🏳️‍🌈', name:'rainbow flag', keywords:['flag'] }]
        }
      };
    }
    return CR_EMOJI_DB;
  }

  // Kategorie-Key robust auflösen (versch. Quellen)
  function resolveCategory(db, key){
    const cats = db.categories || {};
    if (cats[key]) return cats[key];
    const map = {
      'smileys_emotion': ['smileys_emotion', 'smileys', 'faces'],
      'people_body': ['people_body','people'],
      'animals_nature': ['animals_nature','animals'],
      'food_drink': ['food_drink','food'],
      'travel_places': ['travel_places','travel'],
      'activities': ['activities'],
      'objects': ['objects'],
      'symbols': ['symbols'],
      'flags': ['flags']
    };
    const tries = map[key] || [];
    for (const k of tries){ if (cats[k]) return cats[k]; }
    // Fallback: erste Kategorie
    const first = Object.values(cats)[0] || [];
    return first;
  }

  // Grid zeichnen / neu zeichnen
  function renderEmojiGrid(dlg){
    const grid = dlg.querySelector('#cr-emoji-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const db = CR_EMOJI_DB || { categories:{} };
    let list = resolveCategory(db, CR_EMOJI_ACTIVE_TAB) || [];

    // Optional: Suche filtern
    const q = (CR_EMOJI_SEARCH || '').trim().toLowerCase();
    if (q) {
      list = list.filter(e => {
        const name = (e.name || '').toLowerCase();
        const kws  = (e.keywords || []).join(' ').toLowerCase();
        return name.includes(q) || kws.includes(q) || (e.emoji || '').includes(q);
      });
    }

    // Elemente erzeugen
    list.forEach(entry=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cr-emoji-btn';
      btn.setAttribute('aria-label', entry.name || 'Emoji');

      // Skin tone anwenden falls vorhanden
      let symbol = entry.emoji || '';
      if (entry.tones && CR_TONE_SUFFIX[CR_EMOJI_TONE]) {
        symbol = (symbol + CR_TONE_SUFFIX[CR_EMOJI_TONE]);
      }
      btn.textContent = symbol || entry.emoji || '❔';

      btn.addEventListener('click', ()=>{
        dlg.close(symbol || entry.emoji || '');
      });

      grid.appendChild(btn);
    });
  }

  // Picker öffnen und Auswahl anwenden
async function chooseEmojiForItem(idx){
  // Emoji-DB laden (auch für Gäste)
  await loadEmojiDb();

  const dlg = ensureEmojiDialog();
  renderEmojiGrid(dlg);

  // einmaligen close-Handler setzen
  function onClose(){
    dlg.removeEventListener('close', onClose);
    const val = dlg.returnValue || '';
    // Wenn mit Button aus dem Grid geschlossen: val = Emoji
    if (val && val !== 'close') {
      updateItem(idx, { emoji: val, icon: '' });
      renderSection(state.section);
      // Speichern macht (wie besprochen) updateItem() nur für eingeloggte
    }
  }
  dlg.addEventListener('close', onClose);
  
  // anzeigen
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.open = true; // Fallback ohne <dialog>-Support
}


  // --- Preset-Helfer ---
  async function fetchPresets(){
    try {
      const res = await rest('presets','GET');
      const map   = (res && res.presets) || {};
      const order = (res && res.order)   || Object.keys(map);
      return { map, order };
    } catch(e){
      console.warn('[CR] presets GET fehlgeschlagen:', e);
      return { map:{}, order:[] };
    }
  }

  function stableStringify(obj){
    const seen = new WeakSet();
    return JSON.stringify(obj, function(key, value){
      if (value && typeof value === 'object') {
        if (seen.has(value)) return;
        seen.add(value);
        const sorted = {};
        Object.keys(value).sort().forEach(k => { sorted[k] = value[k]; });
        return sorted;
      }
      return value;
    });
  }

  function detectActivePreset(presetsMap, currentState){
    if (!presetsMap || !currentState) return null;
    const cur = stableStringify(currentState);
    for (const [name, st] of Object.entries(presetsMap)){
      try { if (stableStringify(st) === cur) return name; } catch(e){}
    }
    return null;
  }

  async function deletePreset(name){
    try { const r1 = await rest('preset','POST',{ name, delete:true }); if (r1?.ok || r1?.deleted || r1?.success) return true; } catch(e){}
    try { const r2 = await rest('preset','POST',{ name, action:'delete' }); if (r2?.ok || r2?.deleted || r2?.success) return true; } catch(e){}
    try { const r3 = await rest(`preset?name=${encodeURIComponent(name)}`,'DELETE'); if (r3?.ok || r3?.deleted || r3?.success) return true; } catch(e){}
    try { const r4 = await rest(`preset/${encodeURIComponent(name)}`,'DELETE'); if (r4?.ok || r4?.deleted || r4?.success) return true; } catch(e){}
    try { const r5 = await rest('preset','DELETE',{ name }); if (r5?.ok || r5?.deleted || r5?.success) return true; } catch(e){}
    return false;
  }

  // ---------- SAVE ----------
  let saveTimer = null;
  function debounceSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(()=> saveState(), 600); }
  async function saveState(){ if (!CR_DATA.isAuth) return; await rest('state','POST',{state: state.data}); }

  // ---------- Controls ----------
  function bindControls(){
    $('.cr-controls-right [data-action="save-now"]').off('click').on('click', async function(){
      if (!CR_DATA.isAuth) { alert('Bitte einloggen, um zu speichern.'); return; }
      const $btn = $(this);
      try {
        const active = getActivePreset();
        if (active) await rest('preset','POST',{name: active, state: state.data});
        else await saveState();
        $btn.addClass('saved'); crToast('Routine gespeichert', 'success', 1400);
        setTimeout(()=> $btn.removeClass('saved'), 450);
      } catch(e){ crToast('Speichern fehlgeschlagen', 'error', 1800); }
    });

    $('.cr-controls-right [data-action="save"]').off('click').on('click', ()=> openSaveDialog());
    $('.cr-controls-right [data-action="load"]').off('click').on('click', ()=> openLoadDialog());
    $('.cr-controls-right [data-action="reset"]').off('click').on('click', ()=> resetView());

    $('.cr-reset-font').off('click').on('click', ()=>{
      $('#cr-size-title').val(56);
      $('#cr-size-heading').val(32);
      $('#cr-size-text').val(22);
      $('#cr-size-icon').val(56);
      applySizes();
    });

    $('#cr-size-title, #cr-size-heading, #cr-size-text, #cr-size-icon').off('input change').on('input change', applySizes);
    applySizes();
  }

  function applySizes(){
    const titleSize   = $('#cr-size-title').val()+'px';
    const headingSize = $('#cr-size-heading').val()+'px';
    const textSize    = $('#cr-size-text').val()+'px';
    const iconSize    = $('#cr-size-icon').val()+'px';

    // Schriftgrössen mit !important
    document.querySelectorAll('.cr-title').forEach(el => el.style.setProperty('font-size', titleSize, 'important'));
    document.querySelectorAll('.cr-text h3').forEach(el => el.style.setProperty('font-size', headingSize, 'important'));
    document.querySelectorAll('.cr-text p').forEach(el => el.style.setProperty('font-size', textSize, 'important'));

    // Icon-Box
    $('.cr-icon').css({ width: iconSize, height: iconSize, flex: `0 0 ${iconSize}`, minWidth: iconSize });
    $('.cr-icon img').css({ width:'100%', height:'100%', objectFit:'contain', display:'block' });

    // Emoji-Only Feld (Font- und Line-Height mit !important)
    const sizeNum = parseFloat(iconSize) || 0;
    const inner = Math.max(sizeNum - 20, 0) + 'px';
    document.querySelectorAll('.cr-emoji-only').forEach(el => {
      el.style.setProperty('padding', '10px');
      el.style.setProperty('font-size', inner, 'important');
      el.style.setProperty('line-height', inner, 'important');
      el.style.setProperty('display', 'flex');
      el.style.setProperty('align-items', 'center');
      el.style.setProperty('justify-content', 'center');
      el.style.setProperty('box-sizing', 'border-box');
    });
  }

  // ---------- Dialoge ----------
  async function openSaveDialog(){
    if (!CR_DATA.isAuth) {
      alert('Bitte einloggen, um zu speichern.');
      return;
    }

    const dlg = document.getElementById('cr-save-dialog');
    dlg.showModal();

    // Klick ausserhalb schliesst Dialog
    function handleOutsideClick(ev){
      const rect = dlg.querySelector('.cr-dialog-inner').getBoundingClientRect();
      const inDialog =
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top  && ev.clientY <= rect.bottom;
      if (!inDialog) dlg.close('cancel');
    }
    dlg.addEventListener('click', handleOutsideClick);

    dlg.addEventListener('close', async function once(){
      dlg.removeEventListener('close', once);
      dlg.removeEventListener('click', handleOutsideClick);

      if (dlg.returnValue === 'ok') {
        const name = $('#cr-preset-name').val().trim();
        if (!name) return;
        await rest('preset','POST', { name, state: state.data });
        setActivePreset(name);
        crToast('Routine gespeichert', 'success', 1400);
      }
    });
  }

  async function openLoadDialog(){
    const $wrap = $('#cr-preset-list').empty();
    const {map, order} = await fetchPresets();
    if (!getActivePreset()) {
      const guess = detectActivePreset(map, state.data);
      if (guess) setActivePreset(guess);
    }
    const active = getActivePreset();
    const names = order && order.length ? order : Object.keys(map);
    if (!names.length) $wrap.append('<p>Keine Routinen vorhanden.</p>');

    names.forEach(n=>{
      const isActive = (n === active);
      const presetState = map[n];

      const $row = $('<div class="cr-preset-row" draggable="true">').attr('data-name', n);
      if (isActive) $row.addClass('is-active').attr('aria-current','true');

      const $handle = $('<span class="cr-drag-handle" title="Ziehen zum Sortieren">⇅</span>');
      const $loadBtn = $('<button type="button" class="cr-btn cr-btn-load">').text(n).css({flex:'1 1 auto'}).on('click', async (e)=>{
        e.preventDefault(); e.stopPropagation();
        const res = await rest('load','POST',{name:n});
        if (res && res.state) {
          state.data = res.state; renderSection(state.section); setActivePreset(n);
          crToast('Routine geladen', 'success', 1200);
        }
        document.getElementById('cr-load-dialog').close();
      });

      const $left = $('<div>').css({ display:'flex', alignItems:'center', gap:'8px', flex:'1 1 auto' }).append($handle, $loadBtn);
      if (isActive) $left.append($('<span class="cr-badge-active" aria-label="Aktive Ansicht">Aktiv</span>'));

      const $renameBtn = $('<button type="button" class="cr-btn cr-btn-rename" title="Umbenennen">')
        .html('<i class="fa-solid fa-pen"></i>')
        .css({ background:'#555', color:'#fff', flex:'0 0 auto', padding:'6px 10px', borderRadius:'6px' })
        .on('click', async (e)=>{
          e.preventDefault(); e.stopPropagation();
          const oldName = n;
          const newName = (prompt('Neuer Name für die Routine:', oldName) || '').trim();
          if (!newName || newName === oldName) return;

          $renameBtn.addClass('cr-wait');
          const prevText = $loadBtn.text();
          $loadBtn.text(newName);

          $loadBtn.off('click').on('click', async (e)=>{
            e.preventDefault(); e.stopPropagation();
            const res = await rest('load','POST',{name:newName});
            if (res && res.state) {
              state.data = res.state; renderSection(state.section); setActivePreset(newName);
              crToast('Ansicht geladen', 'success', 1200);
            }
            document.getElementById('cr-load-dialog').close();
          });

          if (getActivePreset() === oldName) {
            setActivePreset(newName);
            $row.addClass('is-active').attr('aria-current','true');
            if (!$left.find('.cr-badge-active').length) $left.append($('<span class="cr-badge-active" aria-label="Aktive Ansicht">Aktiv</span>'));
          }

          try {
            const created = await rest('preset','POST',{ name:newName, state:presetState });
            if (!created?.ok) throw new Error('Neues Preset konnte nicht erstellt werden.');
            await deletePreset(oldName);

            const fresh = await fetchPresets();
            const newOrder = (fresh.order || []).map(x => x === oldName ? newName : x);
            await rest('preset-order','POST',{ order:newOrder });

            $row.attr('data-name', newName);
            n = newName;

            crToast('Ansicht umbenannt', 'success', 1000);
          } catch(err){
            console.warn('[CR] Umbenennen fehlgeschlagen:', err);
            $loadBtn.text(prevText);
            $loadBtn.off('click').on('click', async (e)=>{
              e.preventDefault(); e.stopPropagation();
              const res = await rest('load','POST',{name:oldName});
              if (res && res.state) {
                state.data = res.state; renderSection(state.section); setActivePreset(oldName);
                crToast('Ansicht geladen', 'success', 1200);
              }
              document.getElementById('cr-load-dialog').close();
            });
            if (getActivePreset() === newName) setActivePreset(oldName);
            crToast('Umbenennen fehlgeschlagen', 'error', 1800);
          } finally {
            $renameBtn.removeClass('cr-wait');
          }
        });

      const $delBtn = $('<button type="button" class="cr-btn cr-btn-delete" title="Löschen">')
        .html('<i class="fa-solid fa-trash"></i>')
        .css({ background:'#b00020', color:'#fff', flex:'0 0 auto', padding:'6px 10px', borderRadius:'6px' })
        .on('click', async (e)=>{
          e.preventDefault(); e.stopPropagation();
          if (!confirm(`Routine "${n}" wirklich löschen?`)) return;
          try {
            const ok = await deletePreset(n);
            if (ok) {
              if (getActivePreset() === n) setActivePreset(null);
              $row.remove();
              await persistCurrentOrder($wrap);
              if ($wrap.children().length === 0) $wrap.append('<p>Keine Presets vorhanden.</p>');
              crToast('Routine gelöscht', 'success', 1200);
            } else { throw new Error('Preset existiert nach dem Löschen weiterhin.'); }
          } catch(err){ console.warn('[CR] Löschen fehlgeschlagen:', err); crToast('Löschen fehlgeschlagen', 'error', 1800); }
        });

      const $right = $('<div>').css({ display:'flex', gap:'6px', flex:'0 0 auto' }).append($renameBtn, $delBtn);
      $row.append($left, $right);
      $wrap.append($row);
    });

    enablePresetDragAndDrop($wrap);

    document.getElementById('cr-load-dialog').showModal();
  }

  // ----- Drag & Drop für Presets -----
  function enablePresetDragAndDrop($wrap){
    let $dragging = null;

    $wrap.children('.cr-preset-row').each(function(){
      const $row = $(this);
      $row.on('dragstart', function(ev){
        $dragging = $row.addClass('dragging');
        ev.originalEvent.dataTransfer.effectAllowed = 'move';
        ev.originalEvent.dataTransfer.setData('text/plain', $row.attr('data-name') || '');
      });
      $row.on('dragend', function(){
        if ($dragging) $dragging.removeClass('dragging');
        $dragging = null;
        $wrap.find('.drop-target').removeClass('drop-target');
      });
      $row.on('dragover', function(ev){
        ev.preventDefault();
        const $target = $(this);
        if ($dragging && $target[0] === $dragging[0]) return;
        $target.addClass('drop-target');

        const relY = ev.originalEvent.offsetY;
        const half = $target.outerHeight()/2;
        if (relY < half) $dragging.insertBefore($target);
        else $dragging.insertAfter($target);
      });
      $row.on('dragleave', function(){ $(this).removeClass('drop-target'); });
      $row.on('drop', async function(ev){
        ev.preventDefault();
        $wrap.find('.drop-target').removeClass('drop-target');
        await persistCurrentOrder($wrap);
      });
    });
  }

  async function persistCurrentOrder($wrap){
    const order = $wrap.children('.cr-preset-row').map(function(){ return $(this).attr('data-name'); }).get();
    try {
      const res = await rest('preset-order','POST',{ order });
      if (!res?.ok) throw new Error('Order speichern fehlgeschlagen');
      crToast('Reihenfolge gespeichert', 'success', 900);
    } catch(e){
      console.warn('[CR] Reihenfolge speichern fehlgeschlagen:', e);
      crToast('Reihenfolge speichern fehlgeschlagen', 'error', 1500);
    }
  }

function removeItem(idx){
    const sec = state.data.sections[state.section];
    sec.items.splice(idx, 1);
    renderSection(state.section);
    if (CR_DATA.isAuth) debounceSave();
}


function moveItem(idx, direction){
    const sec = state.data.sections[state.section];
    const newIndex = idx + direction;
    if (newIndex < 0 || newIndex >= sec.items.length) return;
    const [moved] = sec.items.splice(idx, 1);
    sec.items.splice(newIndex, 0, moved);
    renderSection(state.section);
    if (CR_DATA.isAuth) debounceSave();
}


  function resetView(){
    if (!confirm('Routine auf Standard zurücksetzen?')) return;
    state.data = structuredClone(CR_DATA.defaults);
    renderSection(state.section);

    $('#cr-size-title').val(56);
    $('#cr-size-heading').val(32);
    $('#cr-size-text').val(22);
    $('#cr-size-icon').val(56);

    applySizes();
    debounceSave();
  }

})(jQuery);
