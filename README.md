# 🍵 Matcha SaaS - Point of Sales (POS) & Inventory System

Selamat datang di repositori **Matcha SaaS**! Aplikasi ini adalah sistem manajemen Point of Sales (Kasir) dan Inventori bergaya premium, dirancang khusus untuk bisnis modern (F&B / Kedai Kopi). 

Aplikasi ini dibangun menggunakan tumpukan teknologi modern yang fokus pada kecepatan, desain UI/UX kelas atas, dan responsivitas penuh di segala perangkat (Mobile, Tablet, Desktop).

---

## 🛠️ Teknologi yang Digunakan
- **Frontend Framework**: React 18 (dengan TypeScript)
- **Bundler**: Vite
- **Styling**: Vanilla CSS (`src/index.css`) dengan pendekatan CSS Variables (CSS Custom Properties), Fluid Typography, dan CSS Grid/Flexbox modern. Tanpa TailwindCSS.
- **Icons**: `lucide-react`
- **Backend / Database**: Supabase (PostgreSQL)

---

## 📱 Arsitektur UI & Responsivitas
Antarmuka pengguna (UI) dirancang dengan ketat untuk menghindari bug *overflow* (terpotong) pada layar kecil maupun layar lebar.
- **Mobile (≤ 768px)**: Terdapat *Bottom Navigation Bar* tetap di bagian bawah. Kartu dan *form* disusun vertikal (`1fr`). Tombol "Konfirmasi Penjualan" di Kasir dibuat *sticky/fixed* di bagian bawah layar.
- **Desktop (≥ 1025px)**: Mengadopsi struktur *Native App*. Halaman POS (Kasir) dikunci seukuran layar persis (`100vh`), di mana Grid Produk dan Keranjang memiliki *scroll internal*, sehingga jendela utama sama sekali tidak perlu di-*scroll*!
- **Modals**: Seluruh pop-up (seperti "Manajemen Menu") dibatasi dengan `max-height: 90vh` dan `overflow-y: auto` agar bisa di-*scroll* secara aman walau isinya ribuan baris.

---

## 🚀 Panduan Memulai (Menjalankan Secara Lokal)

1. Pastikan Anda telah menginstal Node.js versi terbaru.
2. Jalankan perintah instalasi:
   ```bash
   npm install
   ```
3. Jalankan server pengembangan lokal:
   ```bash
   npm run dev
   ```

---

## 🤖 PEMBERITAHUAN KHUSUS UNTUK AGEN AI (ANTIGRAVITY)

Bagian ini ditujukan secara khusus untuk agen AI (teman Antigravity saya) yang akan melanjutkan atau mengedit kode di repositori ini. Harap baca dengan saksama sebelum mengubah arsitektur kode:

<antigravity_agent_instructions>
1. **Supabase Authentication & Database**: 
   - Kredensial (API URL & API Key) Supabase sudah di-*hardcode* secara langsung di dalam file `src/lib/supabase.ts`. 
   - Hal ini merupakan keputusan desain eksplisit yang kami buat sebelumnya untuk mem-bypass masalah *Environment Variables* saat deployment di Vercel. **Tolong jangan mencoba memindahkannya kembali ke `.env` kecuali USER secara eksplisit memintanya.** 
   - Keamanan data ditangani murni dari *Row Level Security (RLS)* di sisi server Supabase.

2. **CSS & Styling Rules**:
   - Seluruh desain mengandalkan `src/index.css`. JANGAN gunakan TailwindCSS.
   - Variabel warna global dikonfigurasi menggunakan `--color-primary`, `--color-surface`, dll. Terdapat juga skema `[data-theme='dark']` untuk mode gelap.
   - **Tolong jangan sentuh atau merusak struktur layout Desktop POS (`.pos-page-container`) dan Media Queries Mobile (`@media (max-width: 768px)`)**, karena sudah diatur secara presisi piksel agar pas 100vh dan tidak *overflow*.

3. **Modifikasi State/Data**:
   - Fungsi interaksi data ada di `src/utils/storage.ts` (yang kini berkomunikasi langsung ke Supabase). 
   - Jika Anda perlu menambah tipe data baru, perbarui file `src/types.ts` terlebih dahulu.

4. **Tone & Style**:
   - USER sangat mengutamakan estetika dan UX (User Experience). Setiap fitur baru yang Anda tambahkan harus terlihat *premium, smooth*, dan menggunakan animasi ringan (seperti *hover state*, *box-shadow*, dan batas radius melengkung).
</antigravity_agent_instructions>

---
*Dibuat oleh AI Antigravity untuk kolaborasi AI tanpa hambatan.*
