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
  const BUCKET = 'photos';

  const state = { data: {progress:{}, days:{}}, listeners: {progress:new Set(), days:new Set()}, email: null, editor: false, error: null };
  const snap = col => ({ docs: Object.entries(state.data[col] || {}).map(([id, v]) => ({ id, data: () => v })) });
  const emit = col => state.listeners[col]?.forEach(cb => { try{ cb(snap(col)); }catch(e){ console.error(e); } });
  const put = (col, id, data) => { (state.data[col] = state.data[col] || {})[id] = data; };

  window.MONTE_BLOB = id => sb ? sb.storage.from(BUCKET).getPublicUrl(id).data.publicUrl : '';

  async function loadAll(){
    const all = []; let from = 0;
    for(;;){ // page through in 1000-row chunks
      const { data, error } = await sb.from('docs').select('col,id,data').range(from, from + 999);
      if(error) throw error; all.push(...data); if(data.length < 1000) break; from += 1000;
    }
    state.data = {progress:{}, days:{}}; all.forEach(r => put(r.col, r.id, r.data));
  }
  function subscribe(){
    sb.channel('docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
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
            const { data, error } = await sb.rpc('write_doc', { p_col: col, p_id: id, p_data: doc, p_merge: merge });
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
      if(state.email){ const { data } = await sb.rpc('is_editor'); state.editor = data === true; }
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
  async function signIn(){
    const email = (prompt('อีเมลสำหรับเข้าสู่ระบบ (ระบบจะส่งลิงก์ไปที่อีเมลนี้)', localStorage.getItem('monte_email') || '') || '').trim();
    if(!email) return;
    try{ localStorage.setItem('monte_email', email); }catch(e){}
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    alert(error ? 'ส่งลิงก์ไม่สำเร็จ: ' + error.message : 'ส่งลิงก์เข้าสู่ระบบไปที่ ' + email + ' แล้ว\nเปิดอีเมลแล้วกดลิงก์ (ใช้เบราว์เซอร์เดียวกันนี้)');
  }
  function toolbar(){
    const head = document.querySelector('.rpt-head'); if(!head || document.getElementById('mxBar')) return;
    const css = document.createElement('style'); css.textContent = `
      #mxBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--ink-2);flex-basis:100%;order:9;}
      #mxBar .mx-badge{padding:3px 9px;border-radius:999px;border:1px solid var(--line);white-space:nowrap;}
      #mxBar .ok{color:#7fe3a8;border-color:rgba(89,211,140,.45);} #mxBar .warn{color:#ffc970;border-color:rgba(255,181,71,.45);}
      #mxBar button{padding:5px 10px;border-radius:8px;border:1px solid var(--line);background:var(--glass-2);font-size:12px;color:var(--ink);cursor:pointer;white-space:nowrap;}`;
    document.head.appendChild(css);
    const bar = document.createElement('div'); bar.id = 'mxBar';
    let badge, btn = '';
    if(!sb || state.error){ badge = `<span class="mx-badge warn">● ${state.error || 'ออฟไลน์'}</span>`; }
    else if(!state.email){ badge = '<span class="mx-badge warn">● ดูได้อย่างเดียว</span>'; btn = '<button id="mxIn" type="button">เข้าสู่ระบบเพื่อบันทึก</button>'; }
    else { badge = state.editor ? `<span class="mx-badge ok">● ${state.email} · บันทึกได้</span>` : `<span class="mx-badge warn">● ${state.email} · ยังไม่ได้รับสิทธิ์บันทึก (แจ้งผู้ดูแล)</span>`; btn = '<button id="mxOut" type="button">ออกจากระบบ</button>'; }
    bar.innerHTML = badge + btn;
    const tabs = head.querySelector('.rtabs'); tabs ? tabs.after(bar) : head.appendChild(bar);
    const i = bar.querySelector('#mxIn'); if(i) i.onclick = signIn;
    const o = bar.querySelector('#mxOut'); if(o) o.onclick = async () => { await sb.auth.signOut(); location.reload(); };
    const ai = document.getElementById('sAi'); if(ai) ai.hidden = true;
  }
  ready.then(() => { const t = setInterval(() => { if(document.querySelector('.rpt-head')){ clearInterval(t); toolbar(); } }, 400); });
})();
