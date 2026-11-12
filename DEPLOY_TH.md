# Monte Avenue 4D — สถานะการติดตั้งและการดูแล

**เว็บ:** https://sirapat1241-cell.github.io/monte-avenue-4d/

| ส่วน | ใช้อะไร |
|---|---|
| โฮสต์เว็บ | GitHub Pages (branch `main`, โฟลเดอร์ `/`) — แก้โค้ดใน repo แล้วเว็บอัปเดตเองใน 1–2 นาที |
| ฐานข้อมูล / รูป / ล็อกอิน | Supabase โปรเจกต์ *sirapat1241@gmail.com's Project* (`mqtnjdgfknhkhowmokip`) ใช้ร่วมกับแอปเดิม ทุกอย่างของ 4D ขึ้นต้นด้วย `monte_` |

**สิทธิ์การใช้งาน**
- ทุกคนที่มีลิงก์ดู 4D และรายงานได้
- คนบันทึกต้องกด "เข้าสู่ระบบเพื่อบันทึก" ในหน้าต่างรายงาน แล้วกดลิงก์ที่ส่งไปทางอีเมล
- อีเมลนั้นต้องอยู่ในตาราง `monte_editors`

## ของใน Supabase

| ชื่อ | หน้าที่ |
|---|---|
| ตาราง `monte_docs` | รายงาน (`col` = `progress` / `days`) |
| ตาราง `monte_editors` | อีเมลที่บันทึกได้ |
| ฟังก์ชัน `monte_write_doc` | ทางเดียวที่ใช้เขียนข้อมูล ตรวจสิทธิ์ก่อนทุกครั้ง และรวมรายงานหลายวัน/หลายคนไม่ให้ทับกัน |
| ฟังก์ชัน `monte_is_editor` | ตรวจว่าผู้ใช้ที่ล็อกอินอยู่บันทึกได้หรือไม่ |
| Storage bucket `monte-photos` | เก็บรูปหน้างาน |

**ตั้งค่าล็อกอิน:** ที่ Authentication → URL Configuration → Redirect URLs มี `https://sirapat1241-cell.github.io/monte-avenue-4d/**` แล้ว ไม่ต้องแก้ช่อง Site URL เพราะแอปเดิมใช้อยู่

## งานดูแลประจำ

- **เพิ่มคนบันทึก:** Supabase → Table Editor → `monte_editors` → Insert row แล้วใส่อีเมล หรือรัน SQL นี้
  ```sql
  insert into public.monte_editors (email, note) values ('name@gmail.com', 'วิศวกรสนาม');
  ```
- **ลบคนบันทึก:** ลบแถวนั้นในตาราง `monte_editors`
- **สำรองข้อมูล:** Table Editor → `monte_docs` → Export CSV หรือกดปุ่ม "ส่งออก CSV" ในแท็บวิเคราะห์ของเว็บ
- **อีเมลล็อกอินไม่มา:** อีเมลฟรีของ Supabase ส่งได้ไม่กี่ฉบับต่อชั่วโมง ถ้าทีมใหญ่ควรตั้ง SMTP ของตัวเอง
- **ผลข้างเคียงจากการใช้โปรเจกต์ร่วมกับแอปเดิม:** ทุกคนที่ล็อกอินเว็บ 4D จะมีแถวในตาราง `profiles` ของแอปเดิมด้วย บทบาท `foreman` เพราะ trigger `handle_new_user` ของแอปเดิมเพิ่มให้อัตโนมัติ
- **ปุ่ม "ให้ AI สรุป"** ถูกซ่อนบนเว็บสาธารณะ ถ้าต้องการใช้ ให้ใช้หน้า 4D บน claude.ai

## ไฟล์ใน repo

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้า 4D (โมเดล แผนงาน Rev.1 ระบบรายงาน) |
| `config.js` | ค่าเชื่อมต่อ Supabase (URL + anon key ซึ่งเปิดเผยได้) |
| `supa-adapter.js` | ตัวเชื่อมหน้า 4D กับ Supabase |
| `supabase/schema.sql` | SQL ที่ใช้สร้างทั้งหมดข้างบน (รันซ้ำได้) |
| `.nojekyll`, `_headers` | ตั้งค่าโฮสต์ |
