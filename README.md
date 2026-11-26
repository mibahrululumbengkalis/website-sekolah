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

## Presensi guru

Halaman guru: `/presensi.html` (bisa dipasang ke layar utama HP). Panel admin punya menu **Presensi Hari Ini**, **Rekap Presensi**, **Akun Guru**, dan **Pengaturan Presensi**.

**Persiapan (sekali saja)**
1. **Publish ulang `firestore.rules`** di Firebase Console (rules presensi sudah ditambahkan).
2. Admin > **Pengaturan Presensi**: isi jam masuk/pulang, hari kerja, tanggal libur, lalu klik **Gunakan lokasi saya sekarang** saat berada di madrasah, atur radius, dan **Simpan**.
3. Admin > **Akun Guru** > **Tambah akun guru** (nama, email, kata sandi awal, tanggal mulai).
4. Guru login di `presensi.html`, lalu **Presensi Masuk** (GPS + selfie) dan **Presensi Pulang**. Izin/sakit/dinas luar diajukan dari halaman yang sama.

**Aturan yang berlaku**
- Waktu presensi memakai jam server (WIB), bukan jam HP. Tanggal HP yang salah membuat presensi ditolak.
- Terlambat = masuk setelah jam masuk + toleransi. Alpa = hari kerja tanpa catatan (libur dan sebelum tanggal mulai tidak dihitung; hari ini dihitung setelah jam pulang).
- Selfie disimpan terpisah (`presensi_foto`) dan hanya dapat dibaca admin. Gunakan **Hapus foto lama** di Pengaturan Presensi untuk menghemat kuota.
- Verifikasi lokasi dilakukan di aplikasi guru dan **dapat dikelabui** aplikasi lokasi palsu. Jarak dan akurasi GPS disimpan untuk pemeriksaan. Foto selfie dan lokasi adalah data pribadi guru: beri tahu guru tujuan dan lama penyimpanannya.
- Admin dapat mengoreksi atau menginput presensi manual (Presensi Hari Ini atau Detail di Rekap).

## Struktur data Firestore

| Koleksi | Isi | Baca | Tulis |
|---|---|---|---|
| `settings/site` | identitas, hero, sambutan, kontak, PPDB | publik | admin |
| `pengumuman`, `guru`, `galeri`, `fasilitas`, `program` | konten | publik | admin |
| `ppdb` | pendaftar | admin | pengunjung (hanya buat, tervalidasi) |
| `pesan` | pesan kontak | admin | pengunjung (hanya buat, tervalidasi) |
| `admins` | UID admin | akun sendiri | tidak bisa dari aplikasi |
| `pegawai` | akun guru (presensi) | admin / guru sendiri | admin |
| `presensi` | catatan presensi `{uid}_{tanggal}` | admin / guru sendiri | guru: masuk, pulang, izin hari ini; admin: semua |
| `presensi_foto` | selfie presensi | admin | guru: hanya buat |

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

## Pembaruan tampilan (tema hijau + emas)
- Halaman publik: hero slider, statistik, sambutan, berita (carousel + detail), pengumuman (panel + jendela detail), program, galeri gelap, profil bertab, guru dengan filter/cari, kontak, footer.
- Admin baru: tab **Berita** dan **Slide Beranda**; pengaturan **warna utama/aksen**, **sub nama**, statistik ekskul; guru punya **kategori** (Guru/Staf); pengumuman punya penulis/label/tautan.
- Wajib **Publish ulang `firestore.rules`** (koleksi `berita`, `slider`, kolom `telp`/`subjek` pada pesan).
- Berita/pengumuman/galeri wajib punya tanggal agar tampil.

## Pembaruan: modul sekolah di admin
Menu baru (sidebar): Kesiswaan (Data Siswa, Rombel, Kenaikan & Kelulusan, Presensi Siswa, Rekap), Pembelajaran & Rapor (Mapel, Input Nilai, Rapor), Keuangan (Buku Kas, Anggaran, Realisasi), Pengaturan Akademik.
Urutan awal: Pengaturan Akademik → Rombel → Mata Pelajaran → Data Siswa (atau Impor CSV).
**Wajib Publish ulang `firestore.rules`** (koleksi baru hanya bisa diakses admin).

## Portal guru
Link guru: `https://mibahrululumbengkalis.github.io/website-sekolah/guru.html` (login pakai Akun Guru). Admin menetapkan wali kelas dan mapel yang diajar di Admin → Akun Guru → Ubah. **Publish ulang `firestore.rules`.**

## Peran & akses
- Admin (dokumen `admins/{uid}`): penuh.
- Pegawai (`pegawai/{uid}.peran`): guru, kepala, bendahara, sarpras, tendik. Kepala/Bendahara/Sarpras login di admin.html dan hanya melihat menu perannya; guru/wali kelas dialihkan ke guru.html.
- Orang tua (`wali/{uid}`): dibuat operator di Admin → Kesiswaan → Akun Orang Tua, ditautkan ke anak. Hanya melihat presensi yang dikonfirmasi, rapor yang dipublikasikan, dan Info Orang Tua.
- **Publish ulang `firestore.rules`** setiap ada pembaruan.
