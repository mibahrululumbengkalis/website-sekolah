import { configured, db, listCol, listTop, getDoc, doc, addDoc, collection, serverTimestamp } from "./firebase.js";
import { $, $$, esc, safeUrl, safeLink, nl2p, lines, fmtDate, toast } from "./util.js";
import { DEFAULT_SETTINGS, DEFAULT_PROGRAM, DEFAULT_FASILITAS, DEMO } from "./defaults.js";

const S = { settings: { ...DEFAULT_SETTINGS }, slider: null, program: null, fasilitas: null, guru: null, galeri: null, pengumuman: null, berita: null };
const byUrut = (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0);
const byTgl = (a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || ""));
let timer = null;

/* ---------- Data (dimuat bertahap per halaman) ---------- */
const LOADERS = {
  slider: () => configured ? listCol("slider") : DEMO.slider,
  program: async () => { const r = configured ? await listCol("program") : []; return r.length ? r : DEFAULT_PROGRAM; },
  fasilitas: async () => { const r = configured ? await listCol("fasilitas") : []; return r.length ? r : DEFAULT_FASILITAS; },
  guru: () => configured ? listCol("guru") : DEMO.guru,
  galeri: max => configured ? listTop("galeri", "tanggal", max) : DEMO.galeri,
  pengumuman: max => configured ? listTop("pengumuman", "tanggal", max) : DEMO.pengumuman,
  berita: max => configured ? listTop("berita", "tanggal", max) : DEMO.berita
};
const sized = new Set(["galeri", "pengumuman", "berita"]);
const have = {};
async function need(names, max = 12) {
  await Promise.all(names.map(async n => {
    if (S[n] && (!sized.has(n) || (have[n] || 0) >= max)) return;
    try { S[n] = await LOADERS[n](max); have[n] = max; }
    catch (e) { console.warn(n, e); S[n] = S[n] || []; }
  }));
}
async function loadSettings() {
  if (!configured) { $("#demo-banner").hidden = false; return; }
  try { const d = await getDoc(doc(db, "settings", "site")); if (d.exists()) S.settings = { ...DEFAULT_SETTINGS, ...d.data() }; }
  catch (e) { console.warn(e); }
}

/* ---------- Helper ---------- */
const img = (src, alt, ph = "🏫") => safeUrl(src) ? `<img loading="lazy" src="${esc(safeUrl(src))}" alt="${esc(alt)}">` : `<span aria-hidden="true">${ph}</span>`;
const empty = t => `<div class="empty">${esc(t)}</div>`;
const waLink = n => { const d = String(n || "").replace(/\D/g, ""); return d ? "https://wa.me/" + (d.startsWith("0") ? "62" + d.slice(1) : d) : ""; };
const clip = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n).trim() + "…" : t; };
const LOGO = "icons/logo-192.png";
const BANNER = "img/banner.jpg";
const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || "").trim()) ? String(v).trim() : "";
const pageHead = (crumb, t, p = "") => `<section class="pagehead"><div class="wrap"><div class="crumb">${esc(crumb)}</div><h1>${esc(t)}</h1>${p ? `<p>${esc(p)}</p>` : ""}</div></section>`;
const secHead = (eyebrow, title, link, href) => `<div class="sec-head"><div><span class="eyebrow-l">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>${link ? `<a class="link-arrow" href="${href}">${link} →</a>` : ""}</div>`;
const carousel = (id, items) => `<div class="arrows" style="justify-content:flex-end;margin-bottom:10px"><button data-scroll="${id}" data-dir="-1" aria-label="Sebelumnya">‹</button><button data-scroll="${id}" data-dir="1" aria-label="Berikutnya">›</button></div><div class="hscroll" id="${id}">${items}</div>`;

function applyBrand() {
  const s = S.settings;
  const r = document.body.style;
  if (hex(s.warnaUtama)) { r.setProperty("--pri", hex(s.warnaUtama)); $('meta[name="theme-color"]').content = hex(s.warnaUtama); }
  if (hex(s.warnaAksen)) r.setProperty("--acc", hex(s.warnaAksen));
  document.title = s.nama + " – " + (s.tagline || "Website Resmi");
  $("#brand-name").textContent = s.nama;
  $("#brand-tag").textContent = s.subjudul || "";
  const logo = safeUrl(s.logo);
  $(".brand-logo").innerHTML = `<img src="${esc(logo || LOGO)}" alt="Logo">`;
  const wa = waLink(s.wa);
  const sv = {
    Facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8z"/>',
    Instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".8"/>',
    YouTube: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="M10.5 9.5v5l4.5-2.5z"/>'
  };
  const sosmed = [["Facebook", s.facebook], ["Instagram", s.instagram], ["YouTube", s.youtube]]
    .filter(([, u]) => safeLink(u)).map(([n, u]) => `<a class="soc" href="${esc(safeLink(u))}" target="_blank" rel="noopener" aria-label="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${sv[n]}</svg></a>`).join("");
  const fi = (ic, t1, t2) => `<div class="fi"><span class="fic">${ic}</span><div><b>${esc(t1)}</b>${t2 ? `<span>${esc(t2)}</span>` : ""}</div></div>`;
  const I = {
    pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.500a2.5 2.5 0 0 1 0 5z"/></svg>',
    tel: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.600 10.800a15 15 0 0 0 6.600 6.600l2.200-2.200a1 1 0 0 1 1-.25 11 11 0 0 0 3.500.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.500a1 1 0 0 1 1 1c0 1.200.2 2.400.56 3.500a1 1 0 0 1-.25 1z"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.500 3 14 0 18M12 3c-3 3.500-3 14 0 18"/></svg>'
  };
  $("#footer").innerHTML = `<div class="wrap"><div class="foot">
    ${fi(I.pin, s.nama, s.alamat)}
    ${fi(I.tel, "Kontak & Info", [s.telp, wa ? "WA " + s.wa : ""].filter(Boolean).join(" · "))}
    ${fi(I.web, "Media Sosial & Email", s.email)}
    <div class="socs">${sosmed}</div>
  </div><div class="copy"><span>${esc(s.nama)}${s.alamat ? " · " + esc(clip(s.alamat, 60)) : ""}</span><span><a href="admin.html">Login</a> · © ${new Date().getFullYear()} ${esc(s.nama)}. Hak cipta dilindungi.</span></div></div>`;
}

/* ---------- Komponen ---------- */
const cardBerita = b => `<a class="card news" href="#/berita/${esc(b.id)}"><div class="im">${img(b.gambar, b.judul, "📰")}${b.kategori ? `<span class="badge">${esc(b.kategori)}</span>` : ""}</div>
  <div class="bd"><span class="dt">${esc(fmtDate(b.tanggal))}</span><h3>${esc(b.judul)}</h3><p class="ex">${esc(b.ringkasan || clip(b.isi, 120))}</p><span class="more">Baca selengkapnya →</span></div></a>`;
const annItem = p => `<button class="ann" data-ann="${esc(p.id)}"><div class="tx"><span class="dt">${esc(fmtDate(p.tanggal))}${p.tag ? ` · <span class="tag acc">${esc(p.tag)}</span>` : ""}</span>
  <h4>${esc(p.judul)}</h4><p>${esc(clip(p.isi, 130))}</p><span class="row2">Baca selengkapnya →</span></div>${safeUrl(p.gambar) ? `<div class="th">${img(p.gambar, p.judul)}</div>` : ""}</button>`;
const annPanel = list => `<div class="panel"><div class="panel-h"><div class="ic">📢</div><div><h3>Pengumuman</h3><p>Informasi resmi dari madrasah</p></div></div>
  ${list.length ? `<div class="ann-list">${list.map(annItem).join("")}</div>` : `<div style="padding:30px">${empty("Belum ada pengumuman.")}</div>`}</div>`;
const galCard = g => `<a class="gal-card" href="#" data-gal="${esc(safeUrl(g.foto))}" data-cap="${esc(g.judul)}"><div class="im">${img(g.foto, g.judul, "📷")}</div><b>${esc(g.judul)}</b>${g.tanggal ? `<span>${esc(fmtDate(g.tanggal))}</span>` : ""}</a>`;

/* ---------- Halaman ---------- */
function heroSlides() {
  const s = S.settings;
  const sl = [...(S.slider || [])].sort(byUrut);
  if (sl.length) return sl.map(x => ({ judul: x.judul, sub: x.sub, gambar: x.gambar || s.heroGambar }));
  return [{ judul: s.heroJudul, sub: s.heroSub, gambar: s.heroGambar }];
}
const dateBlock = d => { const t = String(d || ""); const dt = new Date(t.length <= 10 ? t + "T00:00:00" : t); return isNaN(dt) ? "" : `<span class="d1">${dt.getDate()} ${["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][dt.getMonth()]}</span><span class="d2">${dt.getFullYear()}</span>`; };
const newsRow = b => `<a class="ni" href="#/berita/${esc(b.id)}"><div class="nd"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>${dateBlock(b.tanggal)}</div>
  <div class="nt"><h3>${esc(b.judul)}</h3><p>${esc(b.ringkasan || clip(b.isi, 110))}</p></div>${safeUrl(b.gambar) ? `<div class="nth">${img(b.gambar, b.judul)}</div>` : ""}</a>`;
const DECOR = `<div class="h2deco" aria-hidden="true">
  <span class="dk dot1"></span><span class="dk dgrid g1"></span><span class="dk dgrid g2"></span><span class="dk dplus">+</span><span class="dk dia"></span>
</div>`;
async function pgBeranda() {
  await need(["slider", "program"]); await need(["berita", "pengumuman", "galeri"], 8);
  const s = S.settings;
  const slides = heroSlides();
  const wa = waLink(s.wa);
  const prog = [...S.program].sort(byUrut).slice(0, 3);
  const stats = [["statSiswa", "Peserta Didik", "🎒"], ["statGuru", "Guru & Staf", "👩‍🏫"], ["statRombel", "Rombongan Belajar", "🏫"], ["statEkskul", "Ekstrakurikuler", "🏅"]]
    .filter(([k]) => String(s[k] || "").trim());
  const gal = [...S.galeri].sort(byTgl).slice(0, 8);
  const berita = [...S.berita].sort(byTgl).slice(0, 3);
  return `
  <section class="hero2">${DECOR}<div class="h2stage">${slides.map((x, i) => `<div class="h2slide ${i ? "" : "on"}"><div class="wrap h2in"><div class="h2txt">
      <h1>${esc(x.judul)}</h1>${(s.heroTagline || s.tagline) ? `<p class="h2sub">${esc(s.heroTagline || s.tagline)}</p>` : ""}<p class="h2p">${esc(x.sub || "")}</p>
      <div class="cta"><a class="btn btn-ok" href="#/ppdb">DAFTAR ONLINE</a><a class="btn btn-outl" href="#/profil">JELAJAHI PROFIL</a></div></div></div>
      <div class="h2img"><div class="h2pic"><img src="${esc(safeUrl(x.gambar) || BANNER)}" alt="Suasana madrasah"></div>${wa ? `<a class="h2wa" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">📞</a>` : ""}</div></div>`).join("")}</div>
    ${slides.length > 1 ? `<div class="dots">${slides.map((_, i) => `<button data-dot="${i}" class="${i ? "" : "on"}" aria-label="Slide ${i + 1}"></button>`).join("")}</div>` : ""}</section>
  <div class="wrap"><div class="feat">${prog.map((p, i) => `<div class="fcard">${i === 0 ? `<h3 class="ftit">Unggulan Kami</h3>` : ""}<span class="fnum n${i + 1}">${i + 1}.</span><b>${i + 1}. ${esc(p.judul)}</b></div>`).join("")}</div></div>
  <section class="section"><div class="wrap">
    <div class="sec-head"><div><h2>Berita & Agenda Terbaru</h2></div><a class="link-arrow" href="#/berita">Semua berita →</a></div>
    ${berita.length ? `<div class="nl">${berita.map(newsRow).join("")}</div>` : empty("Belum ada berita.")}</div></section>
  ${stats.length ? `<div class="wrap"><div class="stats">${stats.map(([k, l, ic]) => `<div class="stat"><div class="ic">${ic}</div><div><b>${esc(s[k])}</b><span>${l}</span></div></div>`).join("")}</div></div>` : ""}
  <section class="section"><div class="wrap"><div class="sambutan"><div class="fw"><div class="foto">${img(s.sambutanFoto, s.sambutanNama, "👤")}</div>
    <div class="cap">${s.kepala ? `<b>${esc(s.kepala)}</b>` : ""}<span>${esc(s.sambutanNama)}</span></div></div>
    <div><span class="eyebrow-l">Sambutan</span><h2>${esc(s.sambutanJudul)}</h2>${nl2p(clip(s.sambutanTeks, 700))}<div class="acts"><a class="btn" href="#/profil">Profil Madrasah</a><a class="link-arrow" href="#/kontak">Hubungi Kami →</a></div></div></div></div></section>
  <section class="section alt"><div class="wrap">${annPanel([...S.pengumuman].sort(byTgl).slice(0, 4))}<p style="text-align:center;margin-top:18px"><a class="link-arrow" href="#/pengumuman">Lihat semua pengumuman →</a></p></div></section>
  <section class="section"><div class="wrap"><div class="sec-center"><span class="eyebrow-l">Keunggulan Kami</span><h2>Program Unggulan</h2><p>Kegiatan yang membentuk karakter dan prestasi peserta didik</p></div>
    <div class="grid g4">${[...S.program].sort(byUrut).map(p => `<div class="card prog"><div class="ic">${esc(p.ikon || "⭐")}</div><h3>${esc(p.judul)}</h3><p class="muted small" style="margin:0">${esc(p.deskripsi)}</p></div>`).join("")}</div></div></section>
  ${gal.length ? `<section class="section alt"><div class="wrap">${secHead("Dokumentasi", "Galeri Kegiatan", "Lihat semua", "#/galeri")}
    ${carousel("c-gal", gal.map(galCard).join(""))}</div></section>` : ""}`;
}

async function pgProgram() {
  await need(["program", "fasilitas"]);
  return pageHead("Madrasah", "Program & Fasilitas", "Kegiatan unggulan dan sarana belajar") + `<section class="section"><div class="wrap">
    <div class="grid g4">${[...S.program].sort(byUrut).map(p => `<div class="card prog"><div class="ic">${esc(p.ikon || "⭐")}</div><h3>${esc(p.judul)}</h3><p class="muted small" style="margin:0">${esc(p.deskripsi)}</p></div>`).join("")}</div>
    <h2 style="margin-top:46px">Sarana & Fasilitas</h2><div class="grid g3">${[...S.fasilitas].sort(byUrut).map(f => `<figure class="fas" style="margin:0">${img(f.foto, f.nama, "🏫")}<figcaption>${esc(f.nama)}</figcaption></figure>`).join("")}</div></div></section>`;
}

async function pgProfil() {
  await need(["fasilitas"]);
  const s = S.settings;
  const rows = [["Nama Madrasah", s.nama], ["NPSN", s.npsn], ["NSM", s.nsm], ["Status", s.statusSekolah], ["Akreditasi", s.akreditasi],
    ["Kepala Madrasah", s.kepala], ["Tahun Berdiri", s.tahunBerdiri], ["Kurikulum", s.kurikulum], ["Alamat", s.alamat]].filter(([, v]) => String(v || "").trim());
  const tabs = [["id", "Identitas"], ["vm", "Visi & Misi"], ...(String(s.sejarah || "").trim() ? [["sj", "Sejarah"]] : []), ["fs", "Fasilitas"]];
  const logo = safeUrl(s.logo);
  return pageHead("Profil", "Profil Madrasah", s.nama) + `<section class="section"><div class="wrap">
    <div class="tabs" style="margin-bottom:26px">${tabs.map(([k, l], i) => `<button class="tab ${i ? "" : "on"}" data-tab="${k}">${l}</button>`).join("")}</div>
    <div data-pane="id"><div class="idcard"><div class="top"><span class="brand-logo"><img src="${esc(logo || LOGO)}" alt=""></span><div><b>${esc(s.nama)}</b><span class="muted small">${esc(s.subjudul || "")}</span></div></div>
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div></div>
    <div data-pane="vm" hidden><div class="grid g2" style="align-items:start"><div><h2>Visi</h2><div class="card card-body"><p style="margin:0">${esc(s.visi)}</p></div></div>
      <div><h2>Misi</h2><ol class="list-clean">${lines(s.misi).map(m => `<li>${esc(m)}</li>`).join("")}</ol></div></div></div>
    ${tabs.some(t => t[0] === "sj") ? `<div data-pane="sj" hidden><div class="prose">${nl2p(s.sejarah)}</div></div>` : ""}
    <div data-pane="fs" hidden><div class="grid g3">${[...S.fasilitas].sort(byUrut).map(f => `<figure class="fas" style="margin:0">${img(f.foto, f.nama, "🏫")}<figcaption>${esc(f.nama)}</figcaption></figure>`).join("")}</div></div>
  </div></section>`;
}

async function pgGuru() {
  await need(["guru"]);
  const list = [...S.guru].sort(byUrut);
  return pageHead("Profil", "Guru & Tenaga Kependidikan", "Pendidik yang berdedikasi untuk peserta didik") + `<section class="section"><div class="wrap">
    <div class="filters"><div class="tabs">${["Semua", "Guru", "Staf"].map((k, i) => `<button class="tab ${i ? "" : "on"}" data-gf="${k}">${k}</button>`).join("")}</div>
    <input type="search" id="gq" placeholder="Cari nama atau mapel…" aria-label="Cari"></div>
    ${list.length ? `<div class="grid g4 g-keep2" id="guru-grid">${list.map(g => `<div class="card guru" data-k="${esc(g.kategori || "Guru")}" data-q="${esc((g.nama + " " + (g.jabatan || "") + " " + (g.mapel || "")).toLowerCase())}"><div class="ph">${img(g.foto, g.nama, "👤")}</div><div class="card-body"><h3>${esc(g.nama)}</h3><div class="muted small">${esc(g.jabatan)}${g.mapel ? " · " + esc(g.mapel) : ""}</div></div></div>`).join("")}</div>
    <div id="guru-none" hidden>${empty("Tidak ada yang cocok.")}</div>` : empty("Data guru belum tersedia.")}</div></section>`;
}

async function pgBerita(id) {
  await need(["berita"], id ? 30 : 30);
  if (id) {
    const b = S.berita.find(x => x.id === id);
    if (!b) return pageHead("Berita", "Berita") + `<div class="wrap section">${empty("Berita tidak ditemukan.")}<p style="text-align:center"><a href="#/berita">← Kembali</a></p></div>`;
    const lain = [...S.berita].filter(x => x.id !== id).sort(byTgl).slice(0, 3);
    return pageHead(b.kategori || "Berita", b.judul, `${fmtDate(b.tanggal)}${b.penulis ? " · " + b.penulis : ""}`) + `<section class="section"><div class="wrap"><div class="prose">${safeUrl(b.gambar) ? img(b.gambar, b.judul) : ""}${nl2p(b.isi)}<a class="btn btn-ghost btn-sm" href="#/berita">← Semua berita</a></div>
      ${lain.length ? `<h2 style="margin-top:46px">Berita Lainnya</h2><div class="grid g3">${lain.map(cardBerita).join("")}</div>` : ""}</div></section>`;
  }
  const list = [...S.berita].sort(byTgl);
  return pageHead("Informasi", "Berita Madrasah", "Kabar dan kegiatan terbaru") + `<section class="section"><div class="wrap">${list.length ? `<div class="grid g3">${list.map(cardBerita).join("")}</div>` : empty("Belum ada berita.")}</div></section>`;
}

async function pgGaleri() {
  await need(["galeri"], 60);
  const list = [...S.galeri].sort(byTgl);
  return pageHead("Informasi", "Galeri Kegiatan", "Momen kegiatan madrasah") + `<section class="section"><div class="wrap">${list.length ? `<div class="gal-grid">${list.map(galCard).join("")}</div>` : empty("Belum ada foto kegiatan.")}</div></section>`;
}

async function pgPengumuman(id) {
  await need(["pengumuman"], 40);
  const list = [...S.pengumuman].sort(byTgl);
  return pageHead("Informasi", "Pengumuman", "Informasi resmi dari madrasah") + `<section class="section"><div class="wrap">${annPanel(list)}</div></section>`;
}

function openAnn(id) {
  const p = (S.pengumuman || []).find(x => x.id === id); if (!p) return;
  const m = document.createElement("div"); m.className = "modal-ov";
  const link = safeLink(p.tautan);
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Tutup">✕</button>${safeUrl(p.gambar) ? `<img class="mimg" src="${esc(safeUrl(p.gambar))}" alt="">` : ""}
    <div class="mb"><div class="meta"><span>${esc(fmtDate(p.tanggal))}</span>${p.penulis ? `<span>✍ ${esc(p.penulis)}</span>` : ""}${p.tag ? `<span class="tag acc">${esc(p.tag)}</span>` : ""}</div>
    <h2>${esc(p.judul)}</h2>${nl2p(p.isi)}${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${esc(p.labelTautan || "Buka tautan")}</a>` : ""}</div></div>`;
  const close = () => { m.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = e => { if (e.key === "Escape") close(); };
  m.addEventListener("click", e => { if (e.target === m || e.target.closest(".modal-x")) close(); });
  document.addEventListener("keydown", esc_); document.body.appendChild(m);
}

function pgPpdb() {
  const s = S.settings;
  const form = s.ppdbBuka ? `<form class="form card card-body" id="f-ppdb" novalidate>
    <h3>Formulir Pendaftaran Online</h3>
    <label class="f">Nama lengkap calon peserta didik <span class="req">*</span><input name="namaAnak" required maxlength="100" autocomplete="off"></label>
    <div class="row"><label class="f">Tempat lahir <span class="req">*</span><input name="tempatLahir" required maxlength="60"></label>
    <label class="f">Tanggal lahir <span class="req">*</span><input type="date" name="tglLahir" required></label></div>
    <div class="row"><label class="f">Jenis kelamin <span class="req">*</span><select name="jk" required><option value="">Pilih…</option><option>Laki-laki</option><option>Perempuan</option></select></label>
    <label class="f">Asal TK/RA/PAUD<input name="asalSekolah" maxlength="100"></label></div>
    <label class="f">Nama orang tua/wali <span class="req">*</span><input name="namaOrtu" required maxlength="100"></label>
    <label class="f">No. WhatsApp orang tua <span class="req">*</span><input type="tel" name="hp" required maxlength="20" inputmode="tel" placeholder="08xxxxxxxxxx"></label>
    <label class="f">Alamat lengkap <span class="req">*</span><textarea name="alamat" required maxlength="300"></textarea></label>
    <label class="f">Catatan (opsional)<textarea name="catatan" maxlength="500" style="min-height:70px"></textarea></label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn" type="submit">Kirim Pendaftaran</button>
    <div id="ppdb-msg"></div></form>` : `<div class="alert warn">Pendaftaran online saat ini ditutup. Silakan hubungi madrasah untuk informasi lebih lanjut.</div>`;
  return pageHead("Informasi", "PPDB " + s.ppdbTahun, s.nama) + `<section class="section"><div class="wrap"><div class="grid g2" style="align-items:start">
    <div><span class="tag ${s.ppdbBuka ? "badge-open" : "badge-closed"}">${s.ppdbBuka ? "Pendaftaran dibuka" : "Pendaftaran ditutup"}</span>
      <p style="margin-top:12px">${esc(s.ppdbInfo)}</p>${s.ppdbKuota ? `<p><strong>Kuota:</strong> ${esc(s.ppdbKuota)} peserta didik</p>` : ""}
      <h2>Persyaratan</h2><ul class="list-clean">${lines(s.ppdbSyarat).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <h2>Alur Pendaftaran</h2><ol class="steps">${lines(s.ppdbAlur).map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>
    <div>${form}</div></div></div></section>`;
}

function pgKontak() {
  const s = S.settings;
  const wa = waLink(s.wa);
  const mapSrc = safeUrl(s.mapEmbed) || (s.alamat ? `https://maps.google.com/maps?q=${encodeURIComponent(s.alamat)}&output=embed` : "");
  const rows = [["📍", "Alamat", s.alamat], ["☎", "Telepon", s.telp], ["✉", "Email", s.email], ["🕒", "Jam Layanan", s.jam]].filter(([, , v]) => String(v || "").trim());
  return pageHead("Kontak", "Hubungi Kami", "Kami senang mendengar dari Anda") + `<section class="section"><div class="wrap"><div class="contact-grid">
    <div>${rows.length ? rows.map(([ic, k, v]) => `<div class="ci"><div class="ic">${ic}</div><div><b>${k}</b><span>${esc(v)}</span></div></div>`).join("") : empty("Informasi kontak belum diisi.")}
      ${wa ? `<p><a class="btn" href="${wa}" target="_blank" rel="noopener">Chat WhatsApp</a></p>` : ""}
      ${mapSrc ? `<iframe class="map" style="margin-top:16px" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapSrc)}" title="Peta lokasi"></iframe>` : ""}</div>
    <form class="form card card-body" id="f-kontak" novalidate><h3>Kirim Pesan</h3>
      <div class="row"><label class="f">Nama <span class="req">*</span><input name="nama" required maxlength="100"></label>
      <label class="f">Email<input type="email" name="email" maxlength="120"></label></div>
      <div class="row"><label class="f">No. telepon<input type="tel" name="telp" maxlength="30"></label>
      <label class="f">Subjek<input name="subjek" maxlength="150"></label></div>
      <label class="f">Pesan <span class="req">*</span><textarea name="pesan" required maxlength="1500"></textarea></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit">Kirim Pesan</button><div id="kontak-msg"></div></form></div></div></section>`;
}

/* ---------- Form ---------- */
async function submitForm(form, col, msgEl, build, okText) {
  const msg = $(msgEl);
  if (form.website.value) return;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (!configured) { toast("Mode demo: data tidak tersimpan.", "err"); btn.disabled = false; return; }
    const data = build(Object.fromEntries(new FormData(form)));
    const ref = await addDoc(collection(db, col), { ...data, createdAt: serverTimestamp() });
    form.reset();
    msg.innerHTML = `<div class="alert">${okText}${col === "ppdb" ? ` Nomor pendaftaran: <strong>${esc(ref.id.slice(0, 8).toUpperCase())}</strong>` : ""}</div>`;
  } catch (e) {
    console.error(e);
    msg.innerHTML = `<div class="alert warn">Gagal mengirim. Periksa koneksi lalu coba lagi.</div>`;
  }
  btn.disabled = false;
}
const t = v => String(v || "").trim();

function bind(route) {
  if (route === "ppdb" && $("#f-ppdb")) $("#f-ppdb").addEventListener("submit", e => { e.preventDefault();
    submitForm(e.target, "ppdb", "#ppdb-msg", d => ({ namaAnak: t(d.namaAnak), tempatLahir: t(d.tempatLahir), tglLahir: t(d.tglLahir), jk: d.jk,
      namaOrtu: t(d.namaOrtu), hp: t(d.hp), alamat: t(d.alamat), asalSekolah: t(d.asalSekolah), catatan: t(d.catatan), status: "baru" }),
      "Pendaftaran berhasil dikirim. Panitia akan menghubungi Anda melalui WhatsApp."); });
  if (route === "kontak" && $("#f-kontak")) $("#f-kontak").addEventListener("submit", e => { e.preventDefault();
    submitForm(e.target, "pesan", "#kontak-msg", d => ({ nama: t(d.nama), email: t(d.email), telp: t(d.telp), subjek: t(d.subjek), pesan: t(d.pesan), dibaca: false }),
      "Terima kasih, pesan Anda sudah kami terima."); });
  // hero slider
  const sl = $$(".h2slide"), dots = $$("[data-dot]");
  if (sl.length > 1) {
    let i = 0;
    const go = n => { i = (n + sl.length) % sl.length; sl.forEach((x, k) => x.classList.toggle("on", k === i)); dots.forEach((x, k) => x.classList.toggle("on", k === i)); };
    dots.forEach(d => d.addEventListener("click", () => { go(+d.dataset.dot); }));
    timer = setInterval(() => go(i + 1), 6000);
  }
  // filter guru
  const gq = $("#gq");
  if (gq) {
    let kat = "Semua";
    const apply = () => {
      let n = 0;
      $$("#guru-grid .guru").forEach(c => { const ok = (kat === "Semua" || c.dataset.k === kat) && c.dataset.q.includes(gq.value.trim().toLowerCase()); c.hidden = !ok; if (ok) n++; });
      $("#guru-none").hidden = n > 0;
    };
    gq.addEventListener("input", apply);
    $$("[data-gf]").forEach(b => b.addEventListener("click", () => { kat = b.dataset.gf; $$("[data-gf]").forEach(x => x.classList.toggle("on", x === b)); apply(); }));
  }
  // tab profil
  $$("[data-tab]").forEach(b => b.addEventListener("click", () => {
    $$("[data-tab]").forEach(x => x.classList.toggle("on", x === b));
    $$("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
  }));
}

/* delegasi klik global: carousel, pengumuman, galeri */
document.addEventListener("click", e => {
  const sc = e.target.closest("[data-scroll]");
  if (sc) { const el = document.getElementById(sc.dataset.scroll); if (el) el.scrollBy({ left: el.clientWidth * .85 * +sc.dataset.dir, behavior: "smooth" }); return; }
  const a = e.target.closest("[data-ann]"); if (a) { openAnn(a.dataset.ann); return; }
  const g = e.target.closest("[data-gal]");
  if (g) {
    e.preventDefault(); if (!g.dataset.gal) return;
    const lb = document.createElement("div"); lb.className = "lightbox";
    lb.innerHTML = `<div><img src="${esc(g.dataset.gal)}" alt=""><p>${esc(g.dataset.cap)}</p></div>`;
    lb.addEventListener("click", () => lb.remove()); document.body.appendChild(lb);
  }
  const dd = $("#dd");
  if (e.target.closest("#dd-btn")) { const o = dd.classList.toggle("open"); $("#dd-btn").setAttribute("aria-expanded", o); }
  else if (dd) { dd.classList.remove("open"); }
});

/* ---------- Router ---------- */
let seq = 0;
async function render() {
  const my = ++seq; clearInterval(timer);
  const [route = "", id] = location.hash.replace(/^#\/?/, "").split("/");
  const pages = { "": pgBeranda, profil: pgProfil, program: pgProgram, guru: pgGuru, berita: () => pgBerita(id), galeri: pgGaleri, pengumuman: () => pgPengumuman(id), ppdb: pgPpdb, kontak: pgKontak };
  const app = $("#app");
  document.body.classList.toggle("home", route === "");
  if (!app.firstElementChild || app.querySelector(".loading")) app.innerHTML = `<div class="loading">Memuat…</div>`;
  let html;
  try { html = await (pages[route] || pgBeranda)(); }
  catch (e) { console.error(e); html = `<div class="wrap section">${empty("Gagal memuat data. Muat ulang halaman.")}</div>`; }
  if (my !== seq) return;
  app.innerHTML = html;
  $$("#nav a[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === route));
  $("#nav").classList.remove("open"); $("#burger").setAttribute("aria-expanded", "false");
  bind(route);
  if (route === "pengumuman" && id) openAnn(id);
  window.scrollTo(0, 0);
}

/* ---------- PWA ---------- */
let deferred;
$("#burger").addEventListener("click", () => { const o = $("#nav").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", o); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

window.addEventListener("scroll", () => document.body.classList.toggle("scrolled", window.scrollY > 24), { passive: true });
document.addEventListener("click", e => { const a = e.target.closest(".dd-menu a"); if (a) { a.blur(); const d = a.closest(".dd"); d.classList.add("closing"); setTimeout(() => d.classList.remove("closing"), 400); } });
window.addEventListener("hashchange", render);
loadSettings().then(() => { applyBrand(); render(); });
