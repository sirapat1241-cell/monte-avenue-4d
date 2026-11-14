/* MONTE AVENUE 4D — Supabase runtime adapter.
 * Provides the small `window.claude.use(name)` API the 4D page expects (db, user, assets, downloads)
 * on top of Supabase:  table public.docs (col, id, data jsonb) + Realtime, Storage bucket "photos",
 * e-mail magic-link sign-in; only addresses listed in public.editors may write.
 * Everyone can view. Settings come from config.js (SUPABASE_URL, SUPABASE_ANON_KEY).
 */
(function(){
  'use strict';
  const CFG = window.MONTE_CONFIG || {};
  const err = (code, message) => Object.assign(new Error(message || code), {code});
  const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
  const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } }) : null;
  const BUCKET = 'monte-photos';

  const state = { data: {progress:{}, days:{}}, listeners: {progress:new Set(), days:new Set()}, email: null, editor: false, error: null };
  const snap = col => ({ docs: Object.entries(state.data[col] || {}).map(([id, v]) => ({ id, data: () => v })) });
  const emit = col => state.listeners[col]?.forEach(cb => { try{ cb(snap(col)); }catch(e){ console.error(e); } });
  const put = (col, id, data) => { (state.data[col] = state.data[col] || {})[id] = data; };

  window.MONTE_BLOB = id => sb ? sb.storage.from(BUCKET).getPublicUrl(id).data.publicUrl : '';

  async function loadAll(){
    const all = []; let from = 0;
    for(;;){ // page through in 1000-row chunks
      const { data, error } = await sb.from('monte_docs').select('col,id,data').range(from, from + 999);
      if(error) throw error; all.push(...data); if(data.length < 1000) break; from += 1000;
    }
    state.data = {progress:{}, days:{}}; all.forEach(r => put(r.col, r.id, r.data));
  }
  function subscribe(){
    sb.channel('monte-docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'monte_docs' }, p => {
      const r = p.eventType === 'DELETE' ? p.old : p.new; if(!r || !r.col) return;
      if(p.eventType === 'DELETE'){ delete state.data[r.col]?.[r.id]; } else put(r.col, r.id, r.data);
      emit(r.col);
    }).subscribe();
  }

  const db = {
    collection(col){
      return {
        onSnapshot(cb){ (state.listeners[col] = state.listeners[col] || new Set()).add(cb); setTimeout(() => cb(snap(col)), 0); return () => state.listeners[col].delete(cb); },
        doc(id){
          const write = async (doc, merge) => {
            if(!state.editor) throw err('invalid_argument', 'ไม่มีสิทธิ์บันทึก');
            const { data, error } = await sb.rpc('monte_write_doc', { p_col: col, p_id: id, p_data: doc, p_merge: merge });
            if(error){ throw err(/permission|denied|not allowed|42501/i.test(error.message + error.code) ? 'invalid_argument' : 'server_error', error.message); }
            put(col, id, data); emit(col);
          };
          return { set: d => write(d, false), update: d => write(d, true), get: async () => ({ exists: !!state.data[col]?.[id], data: () => state.data[col]?.[id] }) };
        }
      };
    }
  };
  const user = {
    async id(){ return state.email || ''; },
    async can(){ return state.editor; }
  };
  const assets = {
    async upload(blob, opt = {}){
      if(!state.editor) throw err('not_granted');
      if(blob.size > 8e6) throw err('too_large');
      const id = new Date().toISOString().slice(0,10) + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.jpg';
      const { error } = await sb.storage.from(BUCKET).upload(id, blob, { contentType: opt.type || blob.type || 'image/jpeg', upsert: false });
      if(error) throw err(/size|large/i.test(error.message) ? 'too_large' : 'upload_failed', error.message);
      return { id, url: window.MONTE_BLOB(id) };
    }
  };
  const downloads = {
    async save({filename, data}){ const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); a.download = filename || 'download'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  };

  const ready = (async () => {
    if(!sb){ state.error = 'ยังไม่ได้ตั้งค่า Supabase (config.js)'; return; }
    try{
      const { data: { session } } = await sb.auth.getSession();
      state.email = session?.user?.email || null;
      if(state.email){ const { data } = await sb.rpc('monte_is_editor'); state.editor = data === true; }
      await loadAll(); subscribe();
    }catch(e){ console.error(e); state.error = 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' + (e.message || e); }
  })();

  window.claude = {
    async use(name){
      await ready;
      if(!sb || state.error){ return name === 'downloads' ? downloads : null; }
      if(name === 'db') return db;
      if(name === 'user') return user;
      if(name === 'assets') return state.editor ? assets : null;
      if(name === 'downloads') return downloads;
      return null; // sample (AI) not available on the public site
    }
  };

  // ---------------------------------------------------------------- sign-in bar inside the report window
  // sign-in dialog: e-mail + password (same account as the team's other Supabase app), or a one-time e-mail link
  function signIn(){
    if(document.getElementById('mxDlg')) return;
    const d = document.createElement('div'); d.id = 'mxDlg';
    d.innerHTML = `<form class="mx-card" autocomplete="on">
      <h3>เข้าสู่ระบบเพื่อบันทึกรายงาน</h3>
      <label>อีเมล<input type="email" name="email" autocomplete="username" required></label>
      <label>รหัสผ่าน<input type="password" name="pw" autocomplete="current-password" placeholder="รหัสผ่านบัญชีเดียวกับแอปทีม"></label>
      <div class="mx-msg" aria-live="polite"></div>
      <div class="mx-row"><button type="submit" class="pri">เข้าสู่ระบบ</button><button type="button" data-link>ส่งลิงก์ทางอีเมลแทน</button><button type="button" data-x>ยกเลิก</button></div>
      <small>ไม่มีรหัสผ่าน: ใส่อีเมลแล้วกด "ส่งลิงก์ทางอีเมลแทน" แล้วกดลิงก์ในอีเมลจากเครื่องและเบราว์เซอร์เดียวกันนี้ ภายใน 1 ชั่วโมง กดได้ครั้งเดียว</small></form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form'), m = d.querySelector('.mx-msg'), em = f.email;
    try{ em.value = localStorage.getItem('monte_email') || ''; }catch(e){}
    (em.value ? f.pw : em).focus();
    const close = () => d.remove();
    const remember = () => { try{ localStorage.setItem('monte_email', em.value.trim()); }catch(e){} };
    d.querySelector('[data-x]').onclick = close;
    d.addEventListener('click', e => { if(e.target === d) close(); });
    f.onsubmit = async e => {
      e.preventDefault(); if(!f.pw.value){ m.textContent = 'ใส่รหัสผ่าน หรือกด "ส่งลิงก์ทางอีเมลแทน"'; return; }
      m.textContent = 'กำลังเข้าสู่ระบบ…'; remember();
      const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: f.pw.value });
      if(error){ m.textContent = /invalid/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ: ' + error.message; return; }
      location.reload();
    };
    d.querySelector('[data-link]').onclick = async () => {
      const email = em.value.trim(); if(!em.checkValidity() || !email){ m.textContent = 'ใส่อีเมลให้ถูกต้องก่อน'; return; }
      remember(); m.textContent = 'กำลังส่งลิงก์…';
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
      m.textContent = error ? (/seconds|rate/i.test(error.message) ? 'ขอลิงก์ถี่เกินไป รอ 1 นาทีแล้วลองใหม่' : 'ส่งลิงก์ไม่สำเร็จ: ' + error.message) : 'ส่งลิงก์ไปที่ ' + email + ' แล้ว — ใช้ลิงก์ในอีเมลฉบับล่าสุดเท่านั้น';
    };
  }
  // a failed e-mail link comes back as #error=…: tell the user instead of failing silently
  const authErr = (() => { try{ const h = new URLSearchParams(location.hash.slice(1)); const c = h.get('error_code') || h.get('error'); if(c){ history.replaceState(null, '', location.pathname + location.search); return c === 'otp_expired' ? 'ลิงก์ในอีเมลหมดอายุหรือถูกใช้ไปแล้ว ลองเข้าสู่ระบบด้วยรหัสผ่าน หรือขอลิงก์ใหม่' : 'เข้าสู่ระบบไม่สำเร็จ (' + c + ')'; } }catch(e){} return null; })();
  function toolbar(){
    const head = document.querySelector('.rpt-head'); if(!head || document.getElementById('mxBar')) return;
    const css = document.createElement('style'); css.textContent = `
      #mxBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--ink-2);flex-basis:100%;order:9;}
      #mxBar .mx-badge{padding:3px 9px;border-radius:999px;border:1px solid var(--line);white-space:nowrap;}
      #mxBar .ok{color:#7fe3a8;border-color:rgba(89,211,140,.45);} #mxBar .warn{color:#ffc970;border-color:rgba(255,181,71,.45);}
      #mxDlg{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;}
      #mxDlg .mx-card{background:#0f1a26;color:var(--ink,#e8eef5);border:1px solid var(--line,#2a3a4d);border-radius:14px;padding:18px;width:min(380px,100%);display:flex;flex-direction:column;gap:10px;font-size:14px;}
      #mxDlg h3{margin:0 0 4px;font-size:16px;} #mxDlg label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink-2,#9fb0c3);}
      #mxDlg input{background:#0a131d;border:1px solid var(--line,#2a3a4d);border-radius:8px;padding:9px 10px;color:inherit;font-size:14px;}
      #mxDlg .mx-row{display:flex;gap:8px;flex-wrap:wrap;} #mxDlg button{padding:8px 12px;border-radius:8px;border:1px solid var(--line,#2a3a4d);background:#16263a;color:inherit;cursor:pointer;font-size:13px;}
      #mxDlg button.pri{background:#e0902f;border-color:#e0902f;color:#111;font-weight:600;} #mxDlg .mx-msg{min-height:18px;color:#ffc970;font-size:12px;} #mxDlg small{color:var(--ink-2,#9fb0c3);font-size:11px;line-height:1.5;}
      #mxBar button{padding:5px 10px;border-radius:8px;border:1px solid var(--line);background:var(--glass-2);font-size:12px;color:var(--ink);cursor:pointer;white-space:nowrap;}`;
    document.head.appendChild(css);
    const bar = document.createElement('div'); bar.id = 'mxBar';
    let badge, btn = '';
    if(!sb || state.error){ badge = `<span class="mx-badge warn">● ${state.error || 'ออฟไลน์'}</span>`; }
    else if(!state.email){ badge = '<span class="mx-badge warn">● ดูได้อย่างเดียว</span>'; btn = '<button id="mxIn" type="button">เข้าสู่ระบบเพื่อบันทึก</button>'; }
    else { badge = state.editor ? `<span class="mx-badge ok">● ${state.email} · บันทึกได้</span>` : `<span class="mx-badge warn">● ${state.email} · ยังไม่ได้รับสิทธิ์บันทึก (แจ้งผู้ดูแล)</span>`; btn = '<button id="mxOut" type="button">ออกจากระบบ</button>'; }
    bar.innerHTML = badge + btn + (authErr ? `<span class="mx-badge warn">${authErr}</span>` : '');
    const tabs = head.querySelector('.rtabs'); tabs ? tabs.after(bar) : head.appendChild(bar);
    const i = bar.querySelector('#mxIn'); if(i) i.onclick = signIn;
    const o = bar.querySelector('#mxOut'); if(o) o.onclick = async () => { await sb.auth.signOut(); location.reload(); };
    const ai = document.getElementById('sAi'); if(ai) ai.hidden = true;
  }
  ready.then(() => { const t = setInterval(() => { if(document.querySelector('.rpt-head')){ clearInterval(t); toolbar(); } }, 400); });
})();
