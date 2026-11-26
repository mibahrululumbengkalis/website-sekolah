import {
  configured, db, auth, listCol, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  getCountFromServer, query, where, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "./firebase.js";
import { $, $$, esc, safeUrl, fmtDate, toast, compressImage, today } from "./util.js";
import { DEFAULT_SETTINGS } from "./defaults.js";

const root = $("#root");
const state = { user: null, tab: "dashboard", counts: {} };

/* ---------- Skema data ---------- */
const COLS = {
  pengumuman: { label: "Pengumuman", cols: ["tanggal", "judul"], sort: (a, b) => String(b.tanggal).localeCompare(String(a.tanggal)),
    init: () => ({ tanggal: today() }),
    fields: [{ k: "judul", l: "Judul", req: 1 }, { k: "tanggal", l: "Tanggal", t: "date", req: 1 }, { k: "isi", l: "Isi pengumuman", t: "textarea", req: 1 }, { k: "gambar", l: "Gambar (opsional)", t: "image", w: 1000 }] },
  guru: { label: "Guru & Staf", cols: ["foto", "nama", "jabatan", "urutan"], sort: (a, b) => (a.urutan || 0) - (b.urutan || 0),
    init: () => ({ urutan: 1 }),
    fields: [{ k: "nama", l: "Nama lengkap", req: 1 }, { k: "jabatan", l: "Jabatan (mis. Guru Kelas)", req: 1 }, { k: "mapel", l: "Mapel / kelas" }, { k: "urutan", l: "Urutan tampil", t: "number" }, { k: "foto", l: "Foto", t: "image", w: 500 }] },
  galeri: { label: "Galeri", cols: ["foto", "judul", "tanggal"], sort: (a, b) => String(b.tanggal).localeCompare(String(a.tanggal)),
    init: () => ({ tanggal: today() }),
    fields: [{ k: "judul", l: "Judul kegiatan", req: 1 }, { k: "tanggal", l: "Tanggal", t: "date" }, { k: "deskripsi", l: "Keterangan", t: "textarea" }, { k: "foto", l: "Foto", t: "image", w: 1000, req: 1 }] },
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
    { k: "heroJudul", l: "Judul besar beranda" }, { k: "heroSub", l: "Sub judul beranda", t: "textarea" },
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
    { k: "statSiswa", l: "Jumlah peserta didik" }, { k: "statGuru", l: "Jumlah guru & staf" }, { k: "statRombel", l: "Jumlah rombel" }, { k: "statPrestasi", l: "Jumlah prestasi" }] },
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
  if (f.t === "checkbox") return `<label class="f"><input type="checkbox" name="${f.k}" ${val ? "checked" : ""}>${lab}</label>`;
  if (f.t === "image") {
    const u = safeUrl(val);
    return `<div class="imgf"><label class="f">${lab}<input type="file" accept="image/*" data-img="${f.k}" data-w="${f.w || 1000}" data-q="${f.q || .75}" data-lim="${f.lim || 300000}"></label>
      <input type="hidden" name="${f.k}" value="${esc(u)}"><img class="prev" ${u ? `src="${esc(u)}"` : "hidden"} alt="">
      <button type="button" class="btn btn-ghost btn-sm" data-clear="${f.k}" style="margin-top:8px" ${u ? "" : "hidden"}>Hapus gambar</button></div>`;
  }
  const type = f.t === "number" ? "number" : f.t === "date" ? "date" : "text";
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
  root.innerHTML = `<div class="login"><div class="card card-body"><h2>Panel Admin</h2><p class="muted">MI Bahrul Ulum</p>
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
  root.innerHTML = `<div class="login"><div class="card card-body"><h2>Akun belum terdaftar sebagai admin</h2>
    <p>Buat dokumen di Firestore: koleksi <code>admins</code>, Document ID berikut:</p>
    <p><code style="word-break:break-all;user-select:all">${esc(user.uid)}</code></p>
    <p class="muted small">Isi field bebas (mis. <code>nama</code> = nama Anda). Setelah itu muat ulang halaman.</p>
    <button class="btn btn-ghost" id="out">Keluar</button></div></div>`;
  $("#out").addEventListener("click", () => signOut(auth));
}

/* ---------- Shell ---------- */
const TABS = [["dashboard", "Dashboard"], ["pengumuman", "Pengumuman"], ["guru", "Guru & Staf"], ["galeri", "Galeri"], ["fasilitas", "Fasilitas"],
  ["program", "Program"], ["ppdb", "Pendaftar PPDB"], ["pesan", "Pesan Masuk"], ["pengaturan", "Pengaturan Website"]];

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
  root.innerHTML = `<div class="shell"><aside class="side"><h2>🕌 Admin MI Bahrul Ulum</h2>
    <nav>${TABS.map(([k, l]) => `<a href="#${k}" data-t="${k}" class="${state.tab === k ? "on" : ""}">${l}${badge(k)}</a>`).join("")}</nav>
    <div class="foot-links"><a href="index.html" target="_blank" rel="noopener">Lihat website ↗</a><a href="#" id="logout">Keluar</a></div></aside>
    <main class="main" id="main"></main></div>`;
  $("#logout").addEventListener("click", e => { e.preventDefault(); signOut(auth); });
  await renderTab();
}
async function renderTab() {
  const old = $("#main");
  const main = old.cloneNode(false); // elemen baru agar event listener tab sebelumnya tidak menumpuk
  old.replaceWith(main);
  main.innerHTML = `<div class="loading">Memuat…</div>`;
  $$(".side a[data-t]").forEach(a => a.classList.toggle("on", a.dataset.t === state.tab));
  try {
    if (state.tab === "dashboard") await tabDashboard(main);
    else if (COLS[state.tab]) await tabCrud(main, state.tab);
    else if (state.tab === "ppdb") await tabPpdb(main);
    else if (state.tab === "pesan") await tabPesan(main);
    else if (state.tab === "pengaturan") await tabSettings(main);
  } catch (e) { console.error(e); main.innerHTML = `<div class="alert warn">${esc(errMsg(e))}</div>`; }
}
window.addEventListener("hashchange", () => {
  const t = location.hash.slice(1);
  if (TABS.some(([k]) => k === t) && state.user) { state.tab = t; renderTab(); }
});

/* ---------- Tab: Dashboard ---------- */
async function tabDashboard(main) {
  const c = state.counts;
  const k = (n, l) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`;
  main.innerHTML = `<div class="top"><h1>Dashboard Ringkasan</h1></div>
    <div class="kpis">${k(c.peng, "Pengumuman")}${k(c.guru, "Guru & staf")}${k(c.gal, "Foto galeri")}${k(c.ppdb, "Total pendaftar PPDB")}${k(c.ppdbBaru, "Pendaftar baru")}${k(c.pesanBaru, "Pesan belum dibaca")}</div>
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
  main.innerHTML = `<div class="top"><h1>Pesan Masuk</h1></div><div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>Tanggal</th><th>Nama</th><th>Email</th><th>Pesan</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r.dibaca ? "" : "unread"}"><td>${esc(fmtDate(r.createdAt))}</td><td>${esc(r.nama)}</td><td>${esc(r.email || "–")}</td><td>${esc(String(r.pesan || "").slice(0, 70))}${String(r.pesan || "").length > 70 ? "…" : ""}</td>
      <td><div class="acts"><button class="btn btn-ghost btn-sm" data-v="${esc(r.id)}">Baca</button><button class="btn btn-danger btn-sm" data-d="${esc(r.id)}">Hapus</button></div></td></tr>`).join("")}
    </tbody></table>` : `<div class="empty" style="border:0">Belum ada pesan.</div>`}</div>`;
  main.addEventListener("click", async e => {
    const v = e.target.closest("[data-v]"), d = e.target.closest("[data-d]");
    if (v) {
      const r = rows.find(x => x.id === v.dataset.v);
      const m = modal(`<h3>Pesan dari ${esc(r.nama)}</h3><p class="muted small">${esc(fmtDate(r.createdAt))}${r.email ? " · " + esc(r.email) : ""}</p><p style="white-space:pre-wrap">${esc(r.pesan)}</p><div class="btns"><button class="btn" data-x>Tutup</button></div>`);
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

/* ---------- Start ---------- */
if (!configured) viewSetup();
else onAuthStateChanged(auth, async user => {
  state.user = user;
  if (!user) return viewLogin();
  try {
    const a = await getDoc(doc(db, "admins", user.uid));
    if (!a.exists()) return viewDenied(user);
  } catch (e) { return viewDenied(user); }
  const t = location.hash.slice(1);
  if (TABS.some(([k]) => k === t)) state.tab = t;
  shell();
});
