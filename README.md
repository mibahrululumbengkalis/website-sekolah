# Website & Aplikasi MI Bahrul Ulum

Website sekolah (PWA) dengan panel admin. Teknologi: HTML/CSS/JS murni (tanpa build), **Firebase** (Authentication + Firestore), dan **GitHub Pages** untuk hosting.

Fitur: beranda, profil, guru & staf, galeri, pengumuman, PPDB online + formulir, kontak + peta, dashboard admin, pengelolaan konten, pesan masuk, pengaturan website, dan dapat dipasang di HP (PWA).

> Sebelum Firebase dikonfigurasi, website berjalan dalam **mode demo** (data contoh, formulir tidak tersimpan).

## 1. Buat project Firebase (gratis, paket Spark)

1. Buka https://console.firebase.google.com, lalu **Add project**.
2. **Build > Authentication > Get started**, aktifkan provider **Email/Password**.
3. Tab **Users > Add user**: buat akun admin (email + kata sandi). **Salin UID**-nya.
4. **Build > Firestore Database > Create database** (mode production, pilih lokasi terdekat, mis. `asia-southeast2`).
5. Tab **Rules**: tempel isi `firestore.rules` dari repo ini, lalu **Publish**.
6. Di Firestore, **Start collection** `admins`, isi *Document ID* dengan **UID admin** dari langkah 3, tambah field bebas (mis. `nama` = nama Anda).
7. **Project settings > Your apps > Web (`</>`)**: daftarkan app, salin objek `firebaseConfig` ke file `firebase-config.js`.
8. **Authentication > Settings > Authorized domains**: tambahkan domain GitHub Pages Anda (mis. `USERNAME.github.io`).

Foto dikompres otomatis di browser dan disimpan di Firestore, jadi **Firebase Storage tidak diperlukan** (Storage kini mensyaratkan paket berbayar).

## 2. Deploy di GitHub Pages

1. Edit `firebase-config.js`, commit, push ke branch `main`.
2. **Settings > Pages > Source: GitHub Actions**. Workflow `.github/workflows/pages.yml` akan men-deploy otomatis.
3. Website: `https://USERNAME.github.io/website-sekolah/` dan admin: `.../admin.html`.

**Catatan:** GitHub Pages pada repo *private* hanya tersedia di paket berbayar (Pro/Team). Pada paket Free, jadikan repo public (aman: tidak ada rahasia di repo; keamanan data ditentukan `firestore.rules`) atau gunakan Firebase Hosting (`firebase deploy --only hosting`).

## 3. Mulai mengisi konten

Buka `/admin.html`, login, lalu isi **Pengaturan Website** (identitas, sambutan, kontak, PPDB), kemudian guru, galeri, pengumuman, fasilitas, dan program.

## Struktur data Firestore

| Koleksi | Isi | Baca | Tulis |
|---|---|---|---|
| `settings/site` | identitas, hero, sambutan, kontak, PPDB | publik | admin |
| `pengumuman`, `guru`, `galeri`, `fasilitas`, `program` | konten | publik | admin |
| `ppdb` | pendaftar | admin | pengunjung (hanya buat, tervalidasi) |
| `pesan` | pesan kontak | admin | pengunjung (hanya buat, tervalidasi) |
| `admins` | UID admin | akun sendiri | tidak bisa dari aplikasi |

## Keamanan & batasan yang perlu diketahui

- Formulir publik dilindungi validasi di `firestore.rules` dan honeypot, tetapi belum ada pembatasan laju. Untuk antisipasi spam, aktifkan **Firebase App Check** (reCAPTCHA) bila diperlukan.
- Data PPDB memuat data pribadi anak dan orang tua. Batasi jumlah admin, gunakan kata sandi kuat, dan sesuaikan dengan ketentuan pelindungan data pribadi (UU PDP) serta kebijakan madrasah.
- Dokumen Firestore maksimal 1 MB. Gambar pengaturan (logo, latar, foto kepala) dibatasi ukurannya otomatis.
- Ikon PWA berformat SVG. Bila ingin ikon PNG (mis. untuk layar utama iOS), tambahkan `icons/icon-192.png` dan `icons/icon-512.png` lalu perbarui `manifest.webmanifest`.
- Konten bawaan (visi, misi, sambutan, program) hanya contoh. Ganti sesuai data resmi madrasah.

## Pengembangan lokal

```bash
python3 -m http.server 8000   # lalu buka http://localhost:8000
```
