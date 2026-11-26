import {
  configured, db, auth, listCol, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  getCountFromServer, query, where, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "./firebase.js";
import { $, $$, esc, safeUrl, fmtDate, toast, compressImage, today } from "./util.js";
import { DEFAULT_SETTINGS } from "./defaults.js";
import { presensiTabs } from "./admin-presensi.js";
import { akademikTabs } from "./admin-akademik.js";

const root = $("#root");
const state = { user: null, tab: "dashboard", counts: {} };

/* ---------- Skema data ---------- */
const COLS = {
  rombel: { label: "Rombel / Kelas", cols: ["nama", "tingkat", "waliKelas", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0) || String(a.nama).localeCompare(String(b.nama)),
    init: () => ({ urutan: 1 }),
    fields: [{ k: "nama", l: "Nama rombel (mis. 1A)", req: 1 }, { k: "tingkat", l: "Tingkat (1–6)", t: "number" }, { k: "waliKelas", l: "Wali kelas" }, { k: "urutan", l: "Urutan", t: "number" }] },
  mapel: { label: "Mata Pelajaran", cols: ["nama", "kelompok", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0),
    init: () => ({ urutan: 1 }),
    fields: [{ k: "nama", l: "Nama mata pelajaran", req: 1 }, { k: "kelompok", l: "Kelompok (mis. Umum, Agama)" }, { k: "urutan", l: "Urutan di rapor", t: "number" }] },
  anggaran: { label: "Anggaran", cols: ["tapel", "jenis", "kategori", "uraian", "jumlah"], sort: (a, b) => String(b.tapel).localeCompare(String(a.tapel)) || String(a.kategori).localeCompare(String(b.kategori)),
    init: () => ({ jenis: "Pengeluaran" }),
    fields: [{ k: "tapel", l: "Tahun pelajaran (mis. 2026/2027)", req: 1 }, { k: "jenis", l: "Jenis", t: "select", opts: ["Penerimaan", "Pengeluaran"] }, { k: "kategori", l: "Kategori (samakan dengan Buku Kas)", req: 1 }, { k: "uraian", l: "Uraian" }, { k: "jumlah", l: "Jumlah (Rp)", t: "number", req: 1 }] },
  pengumuman: { label: "Pengumuman", cols: ["tanggal", "judul"], sort: (a, b) => String(b.tanggal).localeCompare(String(a.tanggal)),
    init: () => ({ tanggal: today() }),
    fields: [{ k: "judul", l: "Judul", req: 1 }, { k: "tanggal", l: "Tanggal", t: "date", req: 1 }, { k: "isi", l: "Isi pengumuman", t: "textarea", req: 1 }, { k: "penulis", l: "Penulis (mis. Panitia)" }, { k: "tag", l: "Label (mis. Akademik, PPDB)" }, { k: "tautan", l: "Tautan terkait (https://…, opsional)" }, { k: "labelTautan", l: "Teks tombol tautan (mis. Lihat Info)" }, { k: "gambar", l: "Gambar (opsional)", t: "image", w: 800, lim: 150000 }] },
  berita: { label: "Berita", cols: ["gambar", "tanggal", "judul", "kategori"], sort: (a, b) => String(b.tanggal).localeCompare(String(a.tanggal)),
    init: () => ({ tanggal: today(), penulis: "Admin" }),
    fields: [{ k: "judul", l: "Judul", req: 1 }, { k: "tanggal", l: "Tanggal", t: "date", req: 1 }, { k: "kategori", l: "Kategori (mis. Kegiatan, Prestasi)" }, { k: "penulis", l: "Penulis" }, { k: "ringkasan", l: "Ringkasan singkat", t: "textarea", rows: 3 }, { k: "isi", l: "Isi berita (pisahkan paragraf dengan baris kosong)", t: "textarea", rows: 10, req: 1 }, { k: "gambar", l: "Gambar utama", t: "image", w: 1000, lim: 200000 }] },
  slider: { label: "Slide Beranda", cols: ["gambar", "judul", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0),
    init: () => ({ urutan: 1 }),
    fields: [{ k: "judul", l: "Judul slide", req: 1 }, { k: "sub", l: "Keterangan singkat", t: "textarea", rows: 3 }, { k: "urutan", l: "Urutan tampil", t: "number" }, { k: "gambar", l: "Gambar latar (disarankan lanskap)", t: "image", w: 1400, q: .65, lim: 220000 }] },
  guru: { label: "Guru & Staf", cols: ["foto", "nama", "jabatan", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0),
    init: () => ({ urutan: 1, kategori: "Guru" }),
    fields: [{ k: "nama", l: "Nama lengkap", req: 1 }, { k: "jabatan", l: "Jabatan (mis. Guru Kelas)", req: 1 }, { k: "kategori", l: "Kategori", t: "select", opts: ["Guru", "Staf"] }, { k: "mapel", l: "Mapel / kelas" }, { k: "urutan", l: "Urutan tampil", t: "number" }, { k: "foto", l: "Foto", t: "image", w: 500 }] },
  galeri: { label: "Galeri", cols: ["foto", "judul", "tanggal"], sort: (a, b) => String(b.tanggal).localeCompare(String(a.tanggal)),
    init: () => ({ tanggal: today() }),
    fields: [{ k: "judul", l: "Judul kegiatan", req: 1 }, { k: "tanggal", l: "Tanggal", t: "date", req: 1 }, { k: "deskripsi", l: "Keterangan", t: "textarea" }, { k: "foto", l: "Foto", t: "image", w: 1000, req: 1 }] },
  fasilitas: { label: "Fasilitas", cols: ["foto", "nama", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0),
    init: () => ({ urutan: 1 }),
    fields: [{ k: "nama", l: "Nama fasilitas", req: 1 }, { k: "deskripsi", l: "Deskripsi", t: "textarea" }, { k: "urutan", l: "Urutan tampil", t: "number" }, { k: "foto", l: "Foto", t: "image", w: 800 }] },
  program: { label: "Program Unggulan", cols: ["ikon", "judul", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0),
    init: () => ({ urutan: 1, ikon: "⭐" }),
    fields: [{ k: "judul", l: "Nama program", req: 1 }, { k: "ikon", l: "Ikon (emoji)" }, { k: "deskripsi", l: "Deskripsi", t: "textarea" }, { k: "urutan", l: "Urutan tampil", t: "number" }] }
};

const SETTINGS = [
  { g: "Identitas & Beranda", f: [
    { k: "nama", l: "Nama madrasah", req: 1 }, { k: "tagline", l: "Tagline" }, { k: "logo", l: "Logo", t: "image", w: 256, lim: 60000 },
    { k: "subjudul", l: "Sub nama (mis. Madrasah Ibtidaiyah)" }, { k: "warnaUtama", l: "Warna utama (kode hex, mis. #1b4398)" }, { k: "warnaAksen", l: "Warna aksen (kode hex, mis. #f5b82e)" },
    { k: "heroJudul", l: "Judul besar beranda (dipakai bila belum ada Slide)" }, { k: "heroTagline", l: "Kalimat tebal di bawah judul beranda" }, { k: "heroSub", l: "Sub judul beranda", t: "textarea" },
    { k: "heroGambar", l: "Gambar latar beranda", t: "image", w: 1400, q: .65, lim: 220000 }] },
  { g: "Sambutan Kepala Madrasah", f: [
    { k: "kepala", l: "Nama kepala madrasah" }, { k: "sambutanNama", l: "Sebutan jabatan" }, { k: "sambutanJudul", l: "Judul sambutan" },
    { k: "sambutanTeks", l: "Isi sambutan (pisahkan paragraf dengan baris kosong)", t: "textarea", rows: 8 },
    { k: "sambutanFoto", l: "Foto kepala madrasah", t: "image", w: 600, lim: 120000 }] },
  { g: "Profil Madrasah", f: [
    { k: "visi", l: "Visi", t: "textarea" }, { k: "misi", l: "Misi (satu poin per baris)", t: "textarea", rows: 6 },
    { k: "sejarah", l: "Sejarah singkat", t: "textarea", rows: 6 },
    { k: "npsn", l: "NPSN" }, { k: "nsm", l: "NSM" }, { k: "akreditasi", l: "Akreditasi" }, { k: "tahunBerdiri", l: "Tahun berdiri" },
    { k: "statusSekolah", l: "Status (Negeri/Swasta)" }, { k: "kurikulum", l: "Kurikulum" }] },
  { g: "Statistik Beranda (kosongkan untuk menyembunyikan)", f: [
    { k: "statSiswa", l: "Jumlah peserta didik" }, { k: "statGuru", l: "Jumlah guru & staf" }, { k: "statRombel", l: "Jumlah rombel" }, { k: "statEkskul", l: "Jumlah ekstrakurikuler" }] },
  { g: "Kontak & Media Sosial", f: [
    { k: "alamat", l: "Alamat lengkap", t: "textarea" }, { k: "telp", l: "Telepon" }, { k: "wa", l: "WhatsApp (mis. 081234567890)" }, { k: "email", l: "Email" },
    { k: "jam", l: "Jam layanan" }, { k: "mapEmbed", l: "URL embed Google Maps (opsional; jika kosong dipakai alamat)" },
    { k: "facebook", l: "URL Facebook" }, { k: "instagram", l: "URL Instagram" }, { k: "youtube", l: "URL YouTube" }] },
  { g: "PPDB", f: [
    { k: "ppdbBuka", l: "Pendaftaran online dibuka", t: "checkbox" }, { k: "ppdbTahun", l: "Tahun ajaran (mis. 2027/2028)" }, { k: "ppdbKuota", l: "Kuota (angka)" },
    { k: "ppdbInfo", l: "Keterangan PPDB", t: "textarea" }, { k: "ppdbSyarat", l: "Persyaratan (satu per baris)", t: "textarea", rows: 5 },
    { k: "ppdbAlur", l: "Alur pendaftaran (satu langkah per baris)", t: "textarea", rows: 5 }] }
];

/* ---------- Pembangun form ---------- */
function fieldHTML(f, v) {
  const val = v ?? "";
  const req = f.req ? " required" : "";
  const lab = `${esc(f.l)}${f.req ? ' <span class="req">*</span>' : ""}`;
  if (f.t === "textarea") return `<label class="f">${lab}<textarea name="${f.k}" rows="${f.rows || 4}"${req}>${esc(val)}</textarea></label>`;
  if (f.t === "select") return `<label class="f">${lab}<select name="${f.k}">${f.opts.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(val) === String(ov) ? "selected" : ""}>${esc(ol)}</option>`; }).join("")}</select></label>`;
  if (f.t === "checkbox") return `<label class="f"><input type="checkbox" name="${f.k}" ${val ? "checked" : ""}>${lab}</label>`;
  if (f.t === "image") {
    const u = safeUrl(val);
    return `<div class="imgf"><label class="f">${lab}<input type="file" accept="image/*" data-img="${f.k}" data-w="${f.w || 1000}" data-q="${f.q || .75}" data-lim="${f.lim || 300000}"></label>
      <input type="hidden" name="${f.k}" value="${esc(u)}"><img class="prev" ${u ? `src="${esc(u)}"` : "hidden"} alt="">
      <button type="button" class="btn btn-ghost btn-sm" data-clear="${f.k}" style="margin-top:8px" ${u ? "" : "hidden"}>Hapus gambar</button></div>`;
  }
  const type = ["number", "date", "time"].includes(f.t) ? f.t : "text";
  return `<label class="f">${lab}<input type="${type}" name="${f.k}" value="${esc(val)}"${req}></label>`;
}
function readForm(form, fields) {
  const o = {};
  for (const f of fields) {
    const el = form.elements[f.k];
    if (f.t === "checkbox") o[f.k] = el.checked;
    else if (f.t === "number") o[f.k] = Number(el.value) || 0;
    else o[f.k] = String(el.value || "").trim();
  }
  return o;
}
function wireImages(scope) {
  scope.addEventListener("change", async e => {
    const inp = e.target.closest("input[data-img]"); if (!inp || !inp.files[0]) return;
    const box = inp.closest(".imgf");
    try {
      const url = await compressImage(inp.files[0], +inp.dataset.w, +inp.dataset.q, +inp.dataset.lim);
      box.querySelector("input[type=hidden]").value = url;
      const p = box.querySelector(".prev"); p.src = url; p.hidden = false;
      box.querySelector("[data-clear]").hidden = false;
    } catch (err) { toast(err.message, "err"); inp.value = ""; }
  });
  scope.addEventListener("click", e => {
    const b = e.target.closest("[data-clear]"); if (!b) return;
    const box = b.closest(".imgf");
    box.querySelector("input[type=hidden]").value = ""; box.querySelector("input[type=file]").value = "";
    box.querySelector(".prev").hidden = true; b.hidden = true;
  });
}
function modal(html) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box">${html}</div>`;
  m.addEventListener("mousedown", e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m); wireImages(m);
  return m;
}
const errMsg = e => (e && e.code === "permission-denied") ? "Ditolak oleh aturan keamanan. Pastikan akun sudah terdaftar sebagai admin." : (e.message || "Terjadi kesalahan");

/* ---------- Login ---------- */
function viewSetup() {
  root.innerHTML = `<div class="login"><div class="card card-body"><h2>Firebase belum dikonfigurasi</h2>
    <p>Isi file <code>firebase-config.js</code> dengan konfigurasi web app dari Firebase Console, lalu muat ulang halaman ini. Langkah lengkap ada di <code>README.md</code>.</p>
    <a class="btn btn-ghost" href="index.html">← Ke website</a></div></div>`;
}
function viewLogin(msg = "") {
  root.innerHTML = `<div class="login"><div class="card card-body"><img src="icons/logo-192.png" alt="" style="width:72px;height:72px;display:block;margin:0 auto 10px"><h2 style="text-align:center">Masuk Admin / Guru</h2><p class="muted" style="text-align:center">MI Bahrul Ulum · admin ke panel admin, guru ke portal guru</p>
    <form class="form" id="f-login"><label class="f">Email<input type="email" name="email" required autocomplete="username"></label>
    <label class="f">Kata sandi<input type="password" name="pw" required autocomplete="current-password"></label>
    <button class="btn" type="submit">Masuk</button><div id="login-msg">${msg}</div>
    <button class="btn btn-ghost btn-sm" type="button" id="forgot">Lupa kata sandi</button></form>
    <p style="margin:14px 0 0"><a href="index.html">← Ke website</a></p></div></div>`;
  $("#f-login").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target; const b = f.querySelector("button[type=submit]"); b.disabled = true;
    try { await signInWithEmailAndPassword(auth, f.email.value.trim(), f.pw.value); }
    catch (err) { $("#login-msg").innerHTML = `<div class="alert warn">Email atau kata sandi salah.</div>`; b.disabled = false; }
  });
  $("#forgot").addEventListener("click", async () => {
    const em = $("#f-login").email.value.trim(); if (!em) return toast("Isi email terlebih dahulu", "err");
    try { await sendPasswordResetEmail(auth, em); toast("Tautan reset dikirim ke email."); } catch (e) { toast("Gagal mengirim tautan reset", "err"); }
  });
}
function viewDenied(user) {
  root.innerHTML = `<div class="login"><div class="card card-body"><h2>Akun belum terdaftar</h2><p>Akun ini bukan admin maupun guru aktif. Jika Anda guru, hubungi admin. Jika Anda admin, buat dokumen berikut:</p>
    <p>Buat dokumen di Firestore: koleksi <code>admins</code>, Document ID berikut:</p>
    <p><code style="word-break:break-all;user-select:all">${esc(user.uid)}</code></p>
    <p class="muted small">Isi field bebas (mis. <code>nama</code> = nama Anda). Setelah itu muat ulang halaman.</p>
    <button class="btn btn-ghost" id="out">Keluar</button></div></div>`;
  $("#out").addEventListener("click", () => signOut(auth));
}

/* ---------- Shell ---------- */
const TABS = [["dashboard", "Dashboard"], ["berita", "Berita"], ["pengumuman", "Pengumuman"], ["slider", "Slide Beranda"], ["guru", "Guru & Staf"], ["galeri", "Galeri"], ["fasilitas", "Fasilitas"],
  ["program", "Program"], ["ppdb", "Pendaftar PPDB"], ["pesan", "Pesan Masuk"], ["presensi", "Presensi Hari Ini"], ["rekap", "Rekap Presensi"],
  ["pegawai", "Akun Guru"], ["presensiset", "Pengaturan Presensi"], ["pengaturan", "Pengaturan Website"],
  ["siswa", "Data Siswa"], ["rombel", "Rombel / Kelas"], ["naik", "Kenaikan & Kelulusan"], ["absen", "Presensi Siswa"], ["rekapsiswa", "Rekap Presensi Siswa"],
  ["mapel", "Mata Pelajaran"], ["nilai", "Input Nilai"], ["rapor", "Rapor"], ["kas", "Buku Kas"], ["anggaran", "Anggaran"], ["realisasi", "Realisasi Anggaran"], ["akad", "Pengaturan Akademik"]];
const MENU = [
  ["Website", "dashboard", ["dashboard", "berita", "pengumuman", "slider", "guru", "galeri", "fasilitas", "program", "ppdb", "pesan", "pengaturan"]],
  ["Presensi Guru", "presensi", ["presensi", "rekap", "pegawai", "presensiset"]],
  ["Kesiswaan", "siswa", ["siswa", "rombel", "naik", "absen", "rekapsiswa"]],
  ["Akademik", "mapel", ["mapel", "nilai", "rapor", "akad"]],
  ["Keuangan", "kas", ["kas", "anggaran", "realisasi"]]
];
const openGrp = new Set();

const IC = {
  dashboard: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  berita: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6M7 12h10M7 16h10"/>',
  pengumuman: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  slider: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  guru: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4 1.5 4 4"/>',
  galeri: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l5-4 4 3 3-3 6 5"/>',
  fasilitas: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  program: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  ppdb: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5"/><path d="M19 8v6M16 11h6"/>',
  pesan: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5A8 8 0 1 1 21 12z"/>',
  presensi: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  rekap: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 17v-5M12 17V8M16 17v-3"/>',
  pegawai: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  presensiset: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  pengaturan: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
  siswa: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6 7-6s7 2 7 6"/>',
  rombel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  naik: '<path d="M12 20V6M6 12l6-6 6 6"/>',
  absen: '<path d="M5 12l4 4 10-10"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
  rekapsiswa: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 17v-5M12 17V8M16 17v-3"/>',
  mapel: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  nilai: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  rapor: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
  kas: '<rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.6"/>',
  anggaran: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  realisasi: '<circle cx="12" cy="12" r="9"/><path d="M12 12V3M12 12l6 4"/>',
  akad: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  ext: '<path d="M14 3h7v7M21 3l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'
};
const ico = (k, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ""}</svg>`;

async function count(col, ...w) {
  try { return (await getCountFromServer(w.length ? query(collection(db, col), ...w) : collection(db, col))).data().count; } catch { return 0; }
}
async function loadCounts() {
  const [peng, guru, gal, ppdb, ppdbBaru, pesanBaru] = await Promise.all([
    count("pengumuman"), count("guru"), count("galeri"), count("ppdb"),
    count("ppdb", where("status", "==", "baru")), count("pesan", where("dibaca", "==", false))]);
  state.counts = { peng, guru, gal, ppdb, ppdbBaru, pesanBaru };
}
async function shell() {
  await loadCounts();
  const c = state.counts;
  const badge = k => k === "ppdb" && c.ppdbBaru ? `<span class="cnt">${c.ppdbBaru}</span>` : k === "pesan" && c.pesanBaru ? `<span class="cnt">${c.pesanBaru}</span>` : "";
  const tglStr = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());
  const mail = (state.user && state.user.email) || "Admin";
  root.innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand-a"><img src="icons/logo-192.png" alt=""><h2>Admin MI Bahrul Ulum</h2></div>
    <nav>${MENU.map(([gl, gi, ks]) => { const on = ks.includes(state.tab) || openGrp.has(gl); if (ks.includes(state.tab)) openGrp.add(gl);
      const nb = ks.reduce((n, k) => n + (k === "ppdb" ? c.ppdbBaru || 0 : k === "pesan" ? c.pesanBaru || 0 : 0), 0);
      return `<div class="mg ${on ? "open" : ""}" data-g="${esc(gl)}"><button type="button" class="mg-h" title="${esc(gl)}">${ico(gi)}<span>${gl}</span>${nb ? `<span class="cnt">${nb}</span>` : ""}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="mg-b">${ks.map(k => `<a href="#${k}" data-t="${k}" class="${state.tab === k ? "on" : ""}"><span>${(TABS.find(t => t[0] === k) || [])[1]}</span>${badge(k)}</a>`).join("")}</div></div>`; }).join("")}</nav>
    <div class="foot-links"><a href="index.html" target="_blank" rel="noopener" title="Lihat website">${ico("ext")}<span>Lihat website</span></a><a href="#" id="logout" title="Keluar">${ico("out")}<span>Keluar</span></a></div></aside>
    <div class="scrim" id="scrim"></div>
    <div class="content"><header class="topbar"><button class="menu-btn" id="menu" aria-label="Menu">${ico("menu")}</button><button class="collapse-btn" id="coll" aria-label="Ciutkan menu" title="Ciutkan / lebarkan menu">${ico("menu")}</button><span class="sp"></span>
      <span class="datepill">${ico("presensi")}<span>${esc(tglStr)}</span></span>
      <span class="avatar" title="${esc(mail)}">${esc(mail.charAt(0).toUpperCase())}</span></header>
    <main class="main" id="main"></main></div></div>`;
  const side = $("#side"), scrim = $("#scrim"), shellEl = $(".shell");
  try { if (localStorage.getItem("mibu-side") === "min") shellEl.classList.add("min"); } catch {}
  $("#coll").addEventListener("click", () => { shellEl.classList.toggle("min"); try { localStorage.setItem("mibu-side", shellEl.classList.contains("min") ? "min" : "full"); } catch {} });
  const closeNav = () => { side.classList.remove("open"); scrim.classList.remove("on"); };
  $("#menu").addEventListener("click", () => { side.classList.add("open"); scrim.classList.add("on"); });
  scrim.addEventListener("click", closeNav);
  side.addEventListener("click", e => {
    const h = e.target.closest(".mg-h");
    if (h && shellEl.classList.contains("min") && window.innerWidth > 900) { shellEl.classList.remove("min"); try { localStorage.setItem("mibu-side", "full"); } catch {} h.parentElement.classList.add("open"); openGrp.add(h.parentElement.dataset.g); return; }
    if (h) { const g = h.parentElement; g.classList.toggle("open"); const n = g.dataset.g; g.classList.contains("open") ? openGrp.add(n) : openGrp.delete(n); return; }
    if (e.target.closest("a[data-t]")) closeNav();
  });
  $("#logout").addEventListener("click", e => { e.preventDefault(); signOut(auth); });
  await renderTab();
}
async function renderTab() {
  const old = $("#main");
  const main = old.cloneNode(false); // elemen baru agar event listener tab sebelumnya tidak menumpuk
  old.replaceWith(main);
  main.innerHTML = `<div class="loading">Memuat…</div>`;
  $$(".side a[data-t]").forEach(a => a.classList.toggle("on", a.dataset.t === state.tab));
  { const g = $(`.side a[data-t="${state.tab}"]`); if (g) { const mg = g.closest(".mg"); mg.classList.add("open"); openGrp.add(mg.dataset.g); } }
  try {
    if (state.tab === "dashboard") await tabDashboard(main);
    else if (COLS[state.tab]) await tabCrud(main, state.tab);
    else if (state.tab === "ppdb") await tabPpdb(main);
    else if (state.tab === "pesan") await tabPesan(main);
    else if (state.tab === "presensi") await P.hari(main);
    else if (state.tab === "rekap") await P.rekap(main);
    else if (state.tab === "pegawai") await P.pegawai(main);
    else if (state.tab === "presensiset") await P.setelan(main);
    else if (state.tab === "pengaturan") await tabSettings(main);
    else if (AK[state.tab]) await AK[state.tab](main);
  } catch (e) { console.error(e); main.innerHTML = `<div class="alert warn">${esc(errMsg(e))}</div>`; }
}
window.addEventListener("hashchange", () => {
  const t = location.hash.slice(1);
  if (TABS.some(([k]) => k === t) && state.user) { state.tab = t; renderTab(); }
});

/* ---------- Tab: Dashboard ---------- */
async function tabDashboard(main) {
  const c = state.counts;
  const k = (n, l, i, c) => `<div class="kpi"><span class="kic" style="color:${c}">${ico(i)}</span><b>${n}</b><span>${l}</span></div>`;
  main.innerHTML = `<div class="top"><h1>Dashboard Ringkasan</h1></div>
    <div class="kpis">${k(c.peng, "Pengumuman", "pengumuman", "#e8a317")}${k(c.guru, "Guru & staf", "guru", "#e8a317")}${k(c.gal, "Foto galeri", "galeri", "#8e5bd0")}${k(c.ppdb, "Total pendaftar PPDB", "ppdb", "#1b8aa6")}${k(c.ppdbBaru, "Pendaftar baru", "ppdb", "#2e9f5b")}${k(c.pesanBaru, "Pesan belum dibaca", "mail", "#e8a317")}</div>
    <div class="card card-body"><h3>Mulai dari mana?</h3><ol class="list-clean"><li>Lengkapi <a href="#pengaturan">Pengaturan Website</a> (identitas, sambutan, kontak, PPDB).</li><li>Tambahkan data <a href="#guru">guru</a>, <a href="#galeri">galeri</a>, dan <a href="#pengumuman">pengumuman</a>.</li><li>Pantau <a href="#ppdb">pendaftar PPDB</a> dan <a href="#pesan">pesan masuk</a>.</li></ol>
    <p class="muted small" style="margin:0">Foto otomatis dikompres di browser dan disimpan di Firestore (tanpa Firebase Storage).</p></div>`;
}

/* ---------- Tab: CRUD generik ---------- */
async function tabCrud(main, name) {
  const cfg = COLS[name];
  const rows = (await listCol(name)).sort(cfg.sort);
  const label = Object.fromEntries(cfg.fields.map(f => [f.k, f.l]));
  const cell = (r, k) => {
    const f = cfg.fields.find(x => x.k === k);
    if (f && f.t === "image") return safeUrl(r[k]) ? `<img src="${esc(safeUrl(r[k]))}" alt="">` : "–";
    if (f && f.t === "date") return esc(fmtDate(r[k]));
    return esc(r[k] ?? "");
  };
  main.innerHTML = `<div class="top"><h1>${cfg.label}</h1><button class="btn" id="add">+ Tambah</button></div>
    <div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr>${cfg.cols.map(k => `<th>${esc((label[k] || k).split(" (")[0])}</th>`).join("")}<th></th></tr></thead><tbody>
    ${rows.map(r => `<tr>${cfg.cols.map(k => `<td>${cell(r, k)}</td>`).join("")}<td><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${esc(r.id)}">Ubah</button><button class="btn btn-danger btn-sm" data-d="${esc(r.id)}">Hapus</button></div></td></tr>`).join("")}
    </tbody></table>` : `<div class="empty" style="border:0">Belum ada data. Klik “Tambah”.</div>`}</div>`;
  const edit = (r) => {
    const m = modal(`<h3>${r ? "Ubah" : "Tambah"} ${esc(cfg.label)}</h3><form class="form" id="f-edit">
      ${cfg.fields.map(f => fieldHTML(f, r ? r[f.k] : cfg.init()[f.k])).join("")}
      <div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
    m.querySelector("[data-x]").addEventListener("click", () => m.remove());
    m.querySelector("#f-edit").addEventListener("submit", async e => {
      e.preventDefault(); const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        const data = readForm(e.target, cfg.fields);
        if (r) await updateDoc(doc(db, name, r.id), { ...data, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
        m.remove(); toast("Tersimpan"); await shell();
      } catch (err) { toast(errMsg(err), "err"); btn.disabled = false; }
    });
  };
  $("#add").addEventListener("click", () => edit(null));
  main.addEventListener("click", async e => {
    const be = e.target.closest("[data-e]"), bd = e.target.closest("[data-d]");
    if (be) edit(rows.find(r => r.id === be.dataset.e));
    if (bd && confirm("Hapus data ini? Tindakan tidak dapat dibatalkan.")) {
      try { await deleteDoc(doc(db, name, bd.dataset.d)); toast("Dihapus"); await shell(); } catch (err) { toast(errMsg(err), "err"); }
    }
  }, { once: false });
}

/* ---------- Tab: PPDB ---------- */
const STATUS = ["baru", "diproses", "diterima", "ditolak"];
async function tabPpdb(main) {
  const rows = (await listCol("ppdb")).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  main.innerHTML = `<div class="top"><h1>Pendaftar PPDB</h1><button class="btn btn-ghost" id="csv" ${rows.length ? "" : "disabled"}>Unduh CSV</button></div>
    <div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>Tanggal</th><th>Nama calon</th><th>Orang tua</th><th>WhatsApp</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(fmtDate(r.createdAt))}</td><td>${esc(r.namaAnak)}</td><td>${esc(r.namaOrtu)}</td><td>${esc(r.hp)}</td>
      <td><select data-s="${esc(r.id)}" style="margin:0;padding:6px 8px">${STATUS.map(s => `<option ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><div class="acts"><button class="btn btn-ghost btn-sm" data-v="${esc(r.id)}">Detail</button><button class="btn btn-danger btn-sm" data-d="${esc(r.id)}">Hapus</button></div></td></tr>`).join("")}
    </tbody></table>` : `<div class="empty" style="border:0">Belum ada pendaftar.</div>`}</div>`;
  main.addEventListener("change", async e => {
    const s = e.target.closest("select[data-s]"); if (!s) return;
    try { await updateDoc(doc(db, "ppdb", s.dataset.s), { status: s.value }); toast("Status diperbarui"); await loadCounts(); } catch (err) { toast(errMsg(err), "err"); }
  });
  main.addEventListener("click", async e => {
    const v = e.target.closest("[data-v]"), d = e.target.closest("[data-d]");
    if (v) {
      const r = rows.find(x => x.id === v.dataset.v);
      const m = modal(`<h3>Detail Pendaftar</h3><div class="detail"><dl>
        <dt>Nama</dt><dd>${esc(r.namaAnak)}</dd><dt>TTL</dt><dd>${esc(r.tempatLahir)}, ${esc(fmtDate(r.tglLahir))}</dd><dt>Jenis kelamin</dt><dd>${esc(r.jk)}</dd>
        <dt>Asal TK/RA</dt><dd>${esc(r.asalSekolah || "–")}</dd><dt>Orang tua/wali</dt><dd>${esc(r.namaOrtu)}</dd><dt>WhatsApp</dt><dd>${esc(r.hp)}</dd>
        <dt>Alamat</dt><dd>${esc(r.alamat)}</dd><dt>Catatan</dt><dd>${esc(r.catatan || "–")}</dd><dt>Nomor</dt><dd>${esc(r.id.slice(0, 8).toUpperCase())}</dd></dl></div>
        <div class="btns"><button class="btn" data-x>Tutup</button></div>`);
      m.querySelector("[data-x]").addEventListener("click", () => m.remove());
    }
    if (d && confirm("Hapus data pendaftar ini?")) {
      try { await deleteDoc(doc(db, "ppdb", d.dataset.d)); toast("Dihapus"); await shell(); } catch (err) { toast(errMsg(err), "err"); }
    }
  });
  const csv = $("#csv");
  if (csv) csv.addEventListener("click", () => {
    const cols = ["id", "namaAnak", "tempatLahir", "tglLahir", "jk", "asalSekolah", "namaOrtu", "hp", "alamat", "catatan", "status"];
    const q = v => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; // cegah formula injection
    const out = [cols.join(",")].concat(rows.map(r => cols.map(c => q(r[c])).join(","))).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + out], { type: "text/csv;charset=utf-8" }));
    a.download = `ppdb-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  });
}

/* ---------- Tab: Pesan ---------- */
async function tabPesan(main) {
  const rows = (await listCol("pesan")).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  main.innerHTML = `<div class="top"><h1>Pesan Masuk</h1></div><div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>Tanggal</th><th>Nama</th><th>Kontak</th><th>Pesan</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r.dibaca ? "" : "unread"}"><td>${esc(fmtDate(r.createdAt))}</td><td>${esc(r.nama)}</td><td>${esc(r.email || r.telp || "–")}</td><td>${r.subjek ? "<b>" + esc(r.subjek) + "</b> · " : ""}${esc(String(r.pesan || "").slice(0, 70))}${String(r.pesan || "").length > 70 ? "…" : ""}</td>
      <td><div class="acts"><button class="btn btn-ghost btn-sm" data-v="${esc(r.id)}">Baca</button><button class="btn btn-danger btn-sm" data-d="${esc(r.id)}">Hapus</button></div></td></tr>`).join("")}
    </tbody></table>` : `<div class="empty" style="border:0">Belum ada pesan.</div>`}</div>`;
  main.addEventListener("click", async e => {
    const v = e.target.closest("[data-v]"), d = e.target.closest("[data-d]");
    if (v) {
      const r = rows.find(x => x.id === v.dataset.v);
      const m = modal(`<h3>Pesan dari ${esc(r.nama)}</h3><p class="muted small">${esc(fmtDate(r.createdAt))}${r.email ? " · " + esc(r.email) : ""}${r.telp ? " · " + esc(r.telp) : ""}</p>${r.subjek ? `<p><b>${esc(r.subjek)}</b></p>` : ""}<p style="white-space:pre-wrap">${esc(r.pesan)}</p><div class="btns"><button class="btn" data-x>Tutup</button></div>`);
      m.querySelector("[data-x]").addEventListener("click", () => m.remove());
      if (!r.dibaca) { try { await updateDoc(doc(db, "pesan", r.id), { dibaca: true }); r.dibaca = true; v.closest("tr").classList.remove("unread"); await loadCounts(); } catch (err) { toast(errMsg(err), "err"); } }
    }
    if (d && confirm("Hapus pesan ini?")) {
      try { await deleteDoc(doc(db, "pesan", d.dataset.d)); toast("Dihapus"); await shell(); } catch (err) { toast(errMsg(err), "err"); }
    }
  });
}

/* ---------- Tab: Pengaturan ---------- */
async function tabSettings(main) {
  const snap = await getDoc(doc(db, "settings", "site"));
  const cur = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
  const all = SETTINGS.flatMap(g => g.f);
  main.innerHTML = `<div class="top"><h1>Pengaturan Website</h1></div><form id="f-set">
    ${SETTINGS.map(g => `<div class="settings-grp"><h3>${esc(g.g)}</h3><div class="form">${g.f.map(f => fieldHTML(f, cur[f.k])).join("")}</div></div>`).join("")}
    <button class="btn" type="submit">Simpan Pengaturan</button></form>`;
  wireImages($("#f-set"));
  $("#f-set").addEventListener("submit", async e => {
    e.preventDefault(); const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const data = readForm(e.target, all);
      const size = new Blob([JSON.stringify(data)]).size;
      if (size > 950000) throw new Error("Total ukuran gambar terlalu besar. Kecilkan atau hapus salah satu gambar.");
      await setDoc(doc(db, "settings", "site"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      toast("Pengaturan tersimpan");
    } catch (err) { toast(errMsg(err), "err"); }
    btn.disabled = false;
  });
}

/* ---------- Presensi (modul terpisah) ---------- */
const P = presensiTabs({ fieldHTML, readForm, modal, errMsg, wireImages, refresh: () => renderTab() });

const AK0 = akademikTabs({ fieldHTML, readForm, modal, errMsg, wireImages });
const AK = { siswa: AK0.siswa, naik: AK0.naik, absen: AK0.absen, rekapsiswa: AK0.rekapSiswa, nilai: AK0.nilai, rapor: AK0.rapor, kas: AK0.kas, realisasi: AK0.realisasi, akad: AK0.akad };

/* ---------- Start ---------- */
if (!configured) viewSetup();
else onAuthStateChanged(auth, async user => {
  state.user = user;
  if (!user) return viewLogin();
  try {
    const a = await getDoc(doc(db, "admins", user.uid));
    if (!a.exists()) {
      // Bukan admin: bila akun guru aktif, arahkan ke portal guru
      let guru = false;
      try { const g = await getDoc(doc(db, "pegawai", user.uid)); guru = g.exists() && g.data().aktif === true; } catch {}
      if (guru) { root.innerHTML = `<div class="loading">Mengalihkan ke Portal Guru…</div>`; location.replace("guru.html"); return; }
      return viewDenied(user);
    }
  } catch (e) { return viewDenied(user); }
  const t = location.hash.slice(1);
  if (TABS.some(([k]) => k === t)) state.tab = t;
  shell();
});
