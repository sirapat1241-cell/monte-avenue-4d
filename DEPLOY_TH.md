# วิธีนำ Monte Avenue 4D ขึ้นเว็บ (Cloudflare Pages + Supabase)

ใช้เวลาประมาณ 15–20 นาที ทำครั้งเดียว

| ส่วน | หน้าที่ |
|---|---|
| GitHub (repo นี้) | เก็บโค้ดของเว็บ |
| Cloudflare Pages | เปิดเว็บให้ทุกคนเข้าได้ และอัปเดตเองทุกครั้งที่โค้ดใน repo เปลี่ยน |
| Supabase | เก็บรายงานประจำวัน รูปหน้างาน และระบบล็อกอินด้วยอีเมล |

**สิทธิ์การใช้งาน:**
- ทุกคนที่มีลิงก์ดู 4D และรายงานได้
- คนที่จะบันทึกต้องล็อกอินด้วยอีเมล และอีเมลนั้นต้องอยู่ในรายชื่อ `editors`

---

## ขั้นที่ 1 — Supabase: สร้างฐานข้อมูล

1. สร้างโปรเจกต์
   - เข้า supabase.com → **New project** → ตั้งชื่อ `monte-avenue`
   - Region เลือก **Southeast Asia (Singapore)** แล้วตั้งรหัสผ่านฐานข้อมูล (จดไว้)
2. รัน SQL
   - เมนูซ้าย **SQL Editor** → **New query**
   - เปิดไฟล์ `supabase/schema.sql` ใน repo นี้ แล้วคัดลอกทั้งหมดมาวาง
   - **แก้บรรทัดท้ายไฟล์ก่อนรัน:** เปลี่ยน `your-email@example.com` เป็นอีเมลจริงของคนที่จะบันทึกรายงาน ใส่ได้หลายคน เช่น
     ```sql
     insert into public.editors (email, note) values
       ('somchai@gmail.com', 'วิศวกรสนาม'),
       ('sirapat@gmail.com', 'ผู้จัดการโครงการ')
     on conflict (email) do nothing;
     ```
   - กด **Run** ต้องขึ้นข้อความ Success
3. คัดลอกค่าเชื่อมต่อ: ไปที่ **Project Settings → API** แล้วคัดลอก 2 ค่า
   - **Project URL** (เช่น `https://abcdxyz.supabase.co`)
   - **anon public** key
   - ⚠️ ห้ามใช้หรือส่งต่อ **service_role** key

## ขั้นที่ 2 — ใส่ค่าเชื่อมต่อใน `config.js`

ทำได้ 2 วิธี:
- ส่ง 2 ค่าข้างบนให้ Claude แล้ว Claude จะแก้ไฟล์และอัปโหลดให้
- แก้เองบน github.com: เปิดไฟล์ `config.js` → กดรูปดินสอ → ใส่ค่า → **Commit changes**

## ขั้นที่ 3 — Cloudflare Pages: เปิดเว็บ

1. เข้า dash.cloudflare.com → **Workers & Pages** → **Create** → แท็บ **Pages** → **Connect to Git**
2. เลือก GitHub → repo `monte-avenue-4d` → **Begin setup**
3. ตั้งค่าดังนี้:
   - Project name: `monte-avenue-4d` (ลิงก์เว็บจะเป็น `https://monte-avenue-4d.pages.dev`)
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: เว้นว่าง
   - Build output directory: `/`
4. กด **Save and Deploy** แล้วรอประมาณ 1 นาที

## ขั้นที่ 4 — Supabase: บอกที่อยู่เว็บให้ระบบล็อกอิน

ไปที่ Supabase → **Authentication → URL Configuration**
- **Site URL:** `https://monte-avenue-4d.pages.dev`
- **Redirect URLs:** กด Add แล้วใส่ `https://monte-avenue-4d.pages.dev/**`

## ขั้นที่ 5 — ทดสอบ

1. เปิดลิงก์เว็บ → ปุ่มรายงาน → แถบบนต้องขึ้นว่า "● ดูได้อย่างเดียว"
2. กด **เข้าสู่ระบบเพื่อบันทึก** → ใส่อีเมลที่อยู่ในรายชื่อ editors → เปิดอีเมลแล้วกดลิงก์ โดยใช้เครื่องและเบราว์เซอร์เดียวกัน
3. แถบบนต้องขึ้นว่า "● อีเมล · บันทึกได้" → ลองกรอกรายงาน แนบรูป แล้วกด **บันทึกรายงานวันนี้**
4. เปิดเว็บอีกเครื่องหนึ่ง ต้องเห็นรายงานเดียวกัน และอัปเดตเองภายในไม่กี่วินาที

---

## การดูแลประจำ

- **เพิ่มหรือลบคนบันทึก:** Supabase → **Table Editor** → ตาราง `editors` → Insert row หรือลบแถว
- **ดูหรือสำรองข้อมูล:** Table Editor → ตาราง `docs` → Export CSV ส่วนรูปอยู่ที่ **Storage** → `photos`
- **ส่งออกรายงาน:** ในเว็บมีปุ่ม **ส่งออก CSV** ในแท็บวิเคราะห์อยู่แล้ว
- **อีเมลล็อกอินไม่มา:** ระบบอีเมลฟรีของ Supabase ส่งได้ไม่กี่ฉบับต่อชั่วโมง ถ้ามีหลายคน แนะนำตั้ง SMTP ของตัวเองที่ Project Settings → Authentication → SMTP
- **โปรเจกต์ถูกพัก:** Supabase แพ็กเกจฟรีจะพักโปรเจกต์ถ้าไม่มีคนใช้ 7 วัน เข้า dashboard แล้วกด Restore ได้ ข้อมูลไม่หาย
- **ปุ่ม "ให้ AI สรุป"** ซ่อนไว้บนเว็บสาธารณะ ถ้าต้องการใช้ ให้ใช้หน้า 4D บน claude.ai แทน

## ไฟล์ใน repo

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้า 4D ทั้งหมด (โมเดล แผนงาน Rev.1 ระบบรายงาน) |
| `config.js` | ค่าเชื่อมต่อ Supabase |
| `supa-adapter.js` | ตัวเชื่อมหน้า 4D กับ Supabase (ฐานข้อมูล รูป ล็อกอิน อัปเดตสด) |
| `supabase/schema.sql` | สร้างตาราง สิทธิ์ และที่เก็บรูป |
| `_headers` | ตั้งค่าแคชของ Cloudflare ให้เห็นเวอร์ชันใหม่ทันทีหลังแก้ |
