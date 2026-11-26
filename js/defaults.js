// Konten bawaan. Dipakai bila data di Firestore belum diisi (settings, program, fasilitas)
// dan sebagai data contoh pada MODE DEMO. Semua dapat diubah lewat panel admin.
export const DEFAULT_SETTINGS = {
  nama: "MI Bahrul Ulum",
  tagline: "Madrasah Ibtidaiyah yang Islami, Cerdas, dan Berprestasi",
  heroJudul: "Mencetak Generasi Cerdas, Berakhlak, dan Berprestasi",
  heroSub: "Selamat datang di website resmi MI Bahrul Ulum. Temukan informasi madrasah, kegiatan, pengumuman, dan pendaftaran peserta didik baru.",
  heroGambar: "",
  logo: "",
  sambutanNama: "Kepala Madrasah",
  sambutanJudul: "Mewujudkan Pendidikan Dasar yang Islami dan Berkualitas",
  sambutanTeks: "Assalamu'alaikum warahmatullahi wabarakatuh.\n\nPuji syukur kita panjatkan kepada Allah SWT. Website ini kami hadirkan sebagai sarana informasi dan layanan bagi orang tua, peserta didik, dan masyarakat.\n\nKami berkomitmen menumbuhkan peserta didik yang beriman, berakhlak mulia, berilmu, dan berprestasi melalui pembelajaran yang menyenangkan dan pembiasaan ibadah sehari-hari.",
  sambutanFoto: "",
  visi: "Terwujudnya peserta didik yang beriman, berakhlak mulia, cerdas, terampil, dan berprestasi.",
  misi: "Menanamkan nilai-nilai keislaman dalam kehidupan sehari-hari.\nMenyelenggarakan pembelajaran yang aktif, kreatif, dan menyenangkan.\nMengembangkan minat dan bakat peserta didik melalui kegiatan ekstrakurikuler.\nMenjalin kerja sama yang baik dengan orang tua dan masyarakat.",
  sejarah: "",
  npsn: "", nsm: "", akreditasi: "", kepala: "", tahunBerdiri: "",
  statusSekolah: "Swasta", kurikulum: "Kurikulum Merdeka",
  statSiswa: "", statGuru: "", statRombel: "", statPrestasi: "",
  alamat: "", telp: "", wa: "", email: "", jam: "Senin – Sabtu, 07.00 – 13.00 WIB",
  mapEmbed: "", facebook: "", instagram: "", youtube: "",
  ppdbBuka: true, ppdbTahun: "2027/2028", ppdbKuota: "",
  ppdbInfo: "Pendaftaran peserta didik baru MI Bahrul Ulum telah dibuka. Isi formulir online, lalu lengkapi berkas di madrasah.",
  ppdbSyarat: "Fotokopi Akta Kelahiran\nFotokopi Kartu Keluarga\nPas foto 3x4 (2 lembar)\nUsia minimal 6 tahun pada 1 Juli tahun ajaran berjalan",
  ppdbAlur: "Isi formulir pendaftaran online\nPanitia menghubungi orang tua melalui WhatsApp\nSerahkan berkas persyaratan di madrasah\nVerifikasi dan pengumuman hasil seleksi\nDaftar ulang"
};

export const DEFAULT_PROGRAM = [
  { id: "p1", judul: "Tahfidz & Baca Al-Qur'an", deskripsi: "Pembiasaan membaca dan menghafal Al-Qur'an setiap hari.", ikon: "📖", urutan: 1 },
  { id: "p2", judul: "Pembiasaan Ibadah", deskripsi: "Salat dhuha, salat zuhur berjamaah, dan doa harian.", ikon: "🕌", urutan: 2 },
  { id: "p3", judul: "Literasi & Numerasi", deskripsi: "Penguatan membaca, menulis, dan berhitung sejak dini.", ikon: "🔢", urutan: 3 },
  { id: "p4", judul: "Ekstrakurikuler", deskripsi: "Pramuka, seni, olahraga, dan kegiatan pengembangan bakat.", ikon: "🏅", urutan: 4 }
];

export const DEFAULT_FASILITAS = [
  { id: "f1", nama: "Ruang Kelas", deskripsi: "Ruang belajar yang nyaman dan tertata.", foto: "", urutan: 1 },
  { id: "f2", nama: "Perpustakaan", deskripsi: "Koleksi buku bacaan untuk menumbuhkan minat baca.", foto: "", urutan: 2 },
  { id: "f3", nama: "Mushola", deskripsi: "Tempat ibadah dan pembiasaan salat berjamaah.", foto: "", urutan: 3 },
  { id: "f4", nama: "Lapangan", deskripsi: "Area olahraga dan upacara.", foto: "", urutan: 4 }
];

// Hanya dipakai pada MODE DEMO (Firebase belum dikonfigurasi)
export const DEMO = {
  pengumuman: [
    { id: "d1", judul: "Contoh: Jadwal Penilaian Akhir Semester", tanggal: "2026-11-20", isi: "Ini adalah data contoh. Pengumuman asli dikelola dari panel admin setelah Firebase dikonfigurasi.", gambar: "" },
    { id: "d2", judul: "Contoh: Pendaftaran Peserta Didik Baru Dibuka", tanggal: "2026-11-10", isi: "Data contoh untuk melihat tampilan daftar pengumuman.", gambar: "" }
  ],
  guru: [
    { id: "g1", nama: "Nama Guru (contoh)", jabatan: "Guru Kelas", mapel: "Kelas 1", foto: "", urutan: 1 },
    { id: "g2", nama: "Nama Guru (contoh)", jabatan: "Guru Mapel", mapel: "Bahasa Arab", foto: "", urutan: 2 }
  ],
  galeri: [
    { id: "k1", judul: "Contoh Kegiatan Belajar", tanggal: "2026-11-05", deskripsi: "", foto: "" },
    { id: "k2", judul: "Contoh Kegiatan Pramuka", tanggal: "2026-10-28", deskripsi: "", foto: "" }
  ]
};
