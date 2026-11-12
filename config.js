/* ตั้งค่าการเชื่อมต่อ Supabase — ได้จาก Supabase → Project Settings → API
 * ใส่ได้เฉพาะ Project URL และ anon public key (คีย์นี้ออกแบบให้อยู่ในหน้าเว็บได้)
 * ห้ามใส่ service_role key เด็ดขาด */
window.MONTE_CONFIG = {
  SUPABASE_URL: '',        // เช่น 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: ''    // เช่น 'eyJhbGciOi...'
};
