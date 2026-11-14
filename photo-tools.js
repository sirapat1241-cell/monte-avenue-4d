/* MONTE AVENUE 4D — photo tools for the daily report form.
 * Adds to every site photo: tap to view full size; for editors also rotate 90°, replace, delete.
 * Changes follow the page's normal flow: the activity is marked "edited" and is stored when the user
 * presses "บันทึกรายงานวันนี้". Rotated/replaced photos are uploaded as new files; old files are kept in storage.
 */
(function(){
  'use strict';
  const css = document.createElement('style');
  css.textContent = `
    .photos figure{position:relative;}
    .photos figure img{cursor:zoom-in;border-radius:8px;}
    .pt-bar{position:absolute;top:4px;right:4px;display:flex;gap:4px;}
    .pt-bar button{width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(10,19,29,.78);color:#fff;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}
    .pt-bar button:hover{background:rgba(224,144,47,.95);color:#111;}
    .pt-bar button.del:hover{background:#d9534f;color:#fff;}
    figure.pt-busy{opacity:.45;pointer-events:none;}
    #ptView{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out;}
    #ptView img{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.6);}
    #ptView span{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#ddd;font-size:14px;}`;
  document.head.appendChild(css);

  let assetsP = null;
  const assets = () => assetsP || (assetsP = (window.claude?.use ? window.claude.use('assets') : Promise.resolve(null)).catch(() => null));
  const editor = () => window.MONTE_EDITOR === true;

  // ---- full-size viewer (form and analysis tab) ----
  document.addEventListener('click', e => {
    const img = e.target.closest('.photos figure img'); if(!img || !img.src) return;
    e.preventDefault();
    const fig = img.closest('figure'); const cap = fig.querySelector('input')?.value || fig.querySelector('figcaption')?.textContent || '';
    const v = document.createElement('div'); v.id = 'ptView';
    v.innerHTML = '<img alt=""><span></span>'; v.querySelector('img').src = img.src; v.querySelector('span').textContent = cap;
    v.onclick = () => v.remove(); document.body.appendChild(v);
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') document.getElementById('ptView')?.remove(); });

  // ---- editing helpers ----
  const markEdited = fig => { // reuse the card's own "edited" listener
    const card = fig.closest('.ac'); const q = card && card.querySelector('[data-f=q]');
    if(q) q.dispatchEvent(new Event('input', {bubbles: true}));
  };
  function loadImg(src){ // <img> with CORS (stored photo) or object URL (new file) so the canvas can be exported
    return new Promise((res, rej) => {
      const im = new Image(), blob = src instanceof Blob, url = blob ? URL.createObjectURL(src) : src + (src.includes('?') ? '&' : '?') + 'r=' + Date.now();
      if(!blob) im.crossOrigin = 'anonymous';
      im.onload = () => { if(blob) setTimeout(() => URL.revokeObjectURL(url), 1000); res(im); };
      im.onerror = () => rej(new Error('โหลดรูปไม่ได้')); im.src = url;
    });
  }
  async function toJpeg(src, rotate){ // returns a <=1600 px JPEG blob, optionally rotated 90° clockwise
    const im = await loadImg(src);
    const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = rotate ? h : w; c.height = rotate ? w : h;
    const g = c.getContext('2d'); if(rotate){ g.translate(h, 0); g.rotate(Math.PI / 2); } g.drawImage(im, 0, 0, w, h);
    const b64 = c.toDataURL('image/jpeg', 0.82).split(',')[1]; // synchronous encode (toBlob can stall behind the 3D render loop)
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], {type: 'image/jpeg'});
  }
  async function swap(fig, blobP){
    const a = await assets(); if(!a){ note(fig, 'บัญชีนี้แก้ไขรูปไม่ได้'); return; }
    fig.classList.add('pt-busy');
    try{
      const blob = await blobP; const res = await a.upload(blob, {type: 'image/jpeg'});
      fig.dataset.id = res.id; fig.querySelector('img').src = res.url; markEdited(fig);
    }catch(e){ note(fig, 'แก้ไขรูปไม่สำเร็จ: ' + (e.code || e.message || e)); }
    fig.classList.remove('pt-busy');
  }
  const note = (fig, t) => { const m = document.getElementById('fMsg'); if(m) m.textContent = t; };

  function decorate(fig){
    if(fig.dataset.pt || !fig.closest('[data-ph]')) return;
    fig.dataset.pt = '1';
    const bar = document.createElement('div'); bar.className = 'pt-bar';
    bar.innerHTML = '<button type="button" data-a="rot" title="หมุนรูป 90°" aria-label="หมุนรูป">⟳</button><button type="button" data-a="rep" title="เปลี่ยนรูป" aria-label="เปลี่ยนรูป">✎</button><button type="button" data-a="del" class="del" title="ลบรูป" aria-label="ลบรูป">✕</button>';
    fig.prepend(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return; e.preventDefault(); e.stopPropagation();
      const img = fig.querySelector('img');
      if(b.dataset.a === 'del'){
        if(!confirm('ลบรูปนี้ออกจากรายงาน?\n(กด "บันทึกรายงานวันนี้" เพื่อยืนยัน)')) return;
        const card = fig.closest('.ac'); fig.remove();
        const q = card && card.querySelector('[data-f=q]'); if(q) q.dispatchEvent(new Event('input', {bubbles: true}));
      } else if(b.dataset.a === 'rot'){
        if(img?.src) swap(fig, toJpeg(img.src, true));
      } else if(b.dataset.a === 'rep'){
        const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/jpeg,image/png,image/webp';
        fi.onchange = () => { const f = fi.files[0]; if(f) swap(fig, toJpeg(f, false)); };
        fi.click();
      }
    });
  }
  const scan = root => { if(!editor()) return; (root.querySelectorAll ? root : document).querySelectorAll('[data-ph] figure').forEach(f => { if(f.dataset.id || f.querySelector('img')?.src) decorate(f); }); };
  new MutationObserver(ms => { if(!editor()) return; for(const m of ms){ for(const n of m.addedNodes){ if(n.nodeType === 1) scan(n.matches?.('[data-ph] figure') ? n.parentNode : n); } if(m.type === 'attributes') scan(m.target.closest?.('[data-ph]') || document); } })
    .observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-id']});
})();
