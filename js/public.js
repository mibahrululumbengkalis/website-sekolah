import { configured, db, listCol, getDoc, doc, addDoc, collection, serverTimestamp } from "./firebase.js";
import { $, $$, esc, safeUrl, nl2p, lines, fmtDate, toast } from "./util.js";
import { DEFAULT_SETTINGS, DEFAULT_PROGRAM, DEFAULT_FASILITAS, DEMO } from "./defaults.js";

const S = { settings: { ...DEFAULT_SETTINGS }, program: [], fasilitas: [], guru: [], galeri: [], pengumuman: [] };
const byUrut = (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0);
const byTgl = (a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || ""));

/* ---------- Data ---------- */
async function loadData() {
  if (!configured) {
    $("#demo-banner").hidden = false;
    S.program = DEFAULT_PROGRAM; S.fasilitas = DEFAULT_FASILITAS;
    Object.assign(S, { guru: DEMO.guru, galeri: DEMO.galeri, pengumuman: DEMO.pengumuman });
    return;
  }
  const safe = p => p.catch(e => { console.warn(e); return null; });
  const [set, prog, fas, guru, gal, peng] = await Promise.all([
    safe(getDoc(doc(db, "settings", "site"))), safe(listCol("program")), safe(listCol("fasilitas")),
    safe(listCol("guru")), safe(listCol("galeri")), safe(listCol("pengumuman"))
  ]);
  if (set && set.exists()) S.settings = { ...DEFAULT_SETTINGS, ...set.data() };
  S.program = prog && prog.length ? prog : DEFAULT_PROGRAM;
  S.fasilitas = fas && fas.length ? fas : DEFAULT_FASILITAS;
  S.guru = guru || []; S.galeri = gal || []; S.pengumuman = peng || [];
}

/* ---------- Helpers tampilan ---------- */
const img = (src, alt, ph = "🏫") => safeUrl(src) ? `<img loading="lazy" src="${esc(safeUrl(src))}" alt="${esc(alt)}">` : `<span aria-hidden="true">${ph}</span>`;
const empty = t => `<div class="empty">${esc(t)}</div>`;
const head = (t, p = "") => `<section class="page-head"><div class="wrap"><h1>${esc(t)}</h1>${p ? `<p>${esc(p)}</p>` : ""}</div></section>`;
const waLink = n => { const d = String(n || "").replace(/\D/g, ""); return d ? "https://wa.me/" + (d.startsWith("0") ? "62" + d.slice(1) : d) : ""; };
const clip = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n).trim() + "…" : t; };

function applyBrand() {
  const s = S.settings;
  document.title = s.nama + " – " + (s.tagline || "Website Resmi");
  $("#brand-name").textContent = s.nama;
  $("#brand-tag").textContent = s.tagline || "";
  const logo = safeUrl(s.logo);
  $(".brand-logo").innerHTML = logo ? `<img src="${esc(logo)}" alt="Logo">` : "🕌";
  const wa = waLink(s.wa);
  const sosmed = [["Facebook", s.facebook], ["Instagram", s.instagram], ["YouTube", s.youtube]]
    .filter(([, u]) => safeUrl(u)).map(([n, u]) => `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${n}</a></li>`).join("");
  $("#footer").innerHTML = `<div class="wrap"><div class="foot">
    <div><h4>${esc(s.nama)}</h4><p>${esc(s.tagline || "")}</p>${s.alamat ? `<p class="small">${esc(s.alamat)}</p>` : ""}</div>
    <div><h4>Menu</h4><ul><li><a href="#/profil">Profil</a></li><li><a href="#/guru">Guru & Staf</a></li><li><a href="#/galeri">Galeri</a></li><li><a href="#/pengumuman">Pengumuman</a></li><li><a href="#/ppdb">PPDB</a></li><li><a href="presensi.html">Presensi Guru</a></li></ul></div>
    <div><h4>Hubungi Kami</h4><ul>${s.telp ? `<li>☎ ${esc(s.telp)}</li>` : ""}${wa ? `<li><a href="${wa}" target="_blank" rel="noopener">WhatsApp</a></li>` : ""}${s.email ? `<li>✉ ${esc(s.email)}</li>` : ""}${sosmed}</ul></div>
  </div><div class="copy">© ${new Date().getFullYear()} ${esc(s.nama)}. Hak cipta dilindungi.</div></div>`;
}

/* ---------- Halaman ---------- */
function pgBeranda() {
  const s = S.settings;
  const hero = safeUrl(s.heroGambar);
  const stats = [["statSiswa", "Peserta Didik"], ["statGuru", "Guru & Staf"], ["statRombel", "Rombel"], ["statPrestasi", "Prestasi"]]
    .filter(([k]) => String(s[k] || "").trim());
  const peng = [...S.pengumuman].sort(byTgl).slice(0, 3);
  const gal = [...S.galeri].sort(byTgl).slice(0, 4);
  return `
  <section class="hero ${hero ? "has-img" : ""}" ${hero ? `style="background-image:url('${esc(hero)}')"` : ""}><div class="wrap">
    <span class="eyebrow">${s.ppdbBuka ? "PPDB " + esc(s.ppdbTahun) + " dibuka" : esc(s.tagline)}</span>
    <h1>${esc(s.heroJudul)}</h1><p>${esc(s.heroSub)}</p>
    <div class="cta"><a class="btn btn-gold" href="#/ppdb">Daftar PPDB</a><a class="btn btn-ghost" href="#/profil">Kenali Kami</a></div>
  </div></section>
  ${stats.length ? `<div class="wrap"><div class="stats">${stats.map(([k, l]) => `<div class="stat"><b>${esc(s[k])}</b><span>${l}</span></div>`).join("")}</div></div>` : ""}
  <section class="section"><div class="wrap"><div class="sambutan">
    <div class="foto">${img(s.sambutanFoto, s.sambutanNama, "👤")}</div>
    <div><span class="tag">Sambutan ${esc(s.sambutanNama)}</span><h2 style="margin-top:10px">${esc(s.sambutanJudul)}</h2>${nl2p(s.sambutanTeks)}${s.kepala ? `<p><strong>${esc(s.kepala)}</strong><br><span class="muted small">${esc(s.sambutanNama)}</span></p>` : ""}</div>
  </div></div></section>
  <section class="section alt"><div class="wrap"><div class="sec-head"><div><h2>Program Unggulan</h2><p>Kegiatan yang membentuk karakter dan prestasi peserta didik</p></div></div>
    <div class="grid g4">${[...S.program].sort(byUrut).map(p => `<div class="card prog"><div class="ic">${esc(p.ikon || "⭐")}</div><h3>${esc(p.judul)}</h3><p class="muted small">${esc(p.deskripsi)}</p></div>`).join("")}</div></div></section>
  <section class="section"><div class="wrap"><div class="sec-head"><div><h2>Pengumuman Terbaru</h2></div><a class="btn btn-ghost btn-sm" href="#/pengumuman">Lihat semua</a></div>
    ${peng.length ? `<div class="grid g3">${peng.map(cardPeng).join("")}</div>` : empty("Belum ada pengumuman.")}</div></section>
  <section class="section alt"><div class="wrap"><div class="sec-head"><div><h2>Sarana & Fasilitas</h2></div></div>
    <div class="grid g4">${[...S.fasilitas].sort(byUrut).map(f => `<div class="card"><div class="thumb">${img(f.foto, f.nama, "🏫")}</div><div class="card-body"><h3>${esc(f.nama)}</h3><p class="muted small" style="margin:0">${esc(f.deskripsi)}</p></div></div>`).join("")}</div></div></section>
  ${gal.length ? `<section class="section"><div class="wrap"><div class="sec-head"><div><h2>Galeri Kegiatan</h2></div><a class="btn btn-ghost btn-sm" href="#/galeri">Lihat semua</a></div>
    <div class="grid g4 g-keep2">${gal.map(g => `<div class="card"><div class="thumb">${img(g.foto, g.judul, "📷")}</div><div class="card-body small"><strong>${esc(g.judul)}</strong></div></div>`).join("")}</div></div></section>` : ""}`;
}

const cardPeng = p => `<a href="#/pengumuman/${esc(p.id)}" class="card" style="text-decoration:none;color:inherit">
  ${safeUrl(p.gambar) ? `<div class="thumb">${img(p.gambar, p.judul)}</div>` : ""}
  <div class="card-body"><span class="tag">${esc(fmtDate(p.tanggal))}</span><h3 style="margin-top:8px">${esc(p.judul)}</h3><p class="muted small" style="margin:0">${esc(clip(p.isi, 110))}</p></div></a>`;

function pgProfil() {
  const s = S.settings;
  const rows = [["Nama Madrasah", s.nama], ["NPSN", s.npsn], ["NSM", s.nsm], ["Status", s.statusSekolah], ["Akreditasi", s.akreditasi],
    ["Kepala Madrasah", s.kepala], ["Tahun Berdiri", s.tahunBerdiri], ["Kurikulum", s.kurikulum], ["Alamat", s.alamat]].filter(([, v]) => String(v || "").trim());
  return head("Profil Madrasah", s.nama) + `<section class="section"><div class="wrap"><div class="grid g2" style="align-items:start">
    <div><h2>Identitas</h2><table class="info">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>
    <div><h2>Visi</h2><div class="card card-body"><p style="margin:0">${esc(s.visi)}</p></div>
    <h2 style="margin-top:24px">Misi</h2><ol class="list-clean">${lines(s.misi).map(m => `<li>${esc(m)}</li>`).join("")}</ol></div></div>
    ${String(s.sejarah || "").trim() ? `<h2 style="margin-top:36px">Sejarah Singkat</h2><div class="prose">${nl2p(s.sejarah)}</div>` : ""}</div></section>`;
}

function pgGuru() {
  const list = [...S.guru].sort(byUrut);
  return head("Guru & Tenaga Kependidikan", "Pendidik yang berdedikasi untuk peserta didik") + `<section class="section"><div class="wrap">${list.length ?
    `<div class="grid g4">${list.map(g => `<div class="card guru"><div class="thumb">${img(g.foto, g.nama, "👤")}</div><div class="card-body"><h3>${esc(g.nama)}</h3><div class="muted small">${esc(g.jabatan)}${g.mapel ? " · " + esc(g.mapel) : ""}</div></div></div>`).join("")}</div>` : empty("Data guru belum tersedia.")}</div></section>`;
}

function pgGaleri() {
  const list = [...S.galeri].sort(byTgl);
  return head("Galeri Kegiatan", "Momen kegiatan madrasah") + `<section class="section"><div class="wrap">${list.length ?
    `<div class="gallery">${list.map(g => `<figure data-src="${esc(safeUrl(g.foto))}" data-cap="${esc(g.judul)}"><div class="${safeUrl(g.foto) ? "" : "ph"}">${img(g.foto, g.judul, "📷")}</div><figcaption><strong>${esc(g.judul)}</strong>${g.tanggal ? `<br><span class="muted">${esc(fmtDate(g.tanggal))}</span>` : ""}</figcaption></figure>`).join("")}</div>` : empty("Belum ada foto kegiatan.")}</div></section>`;
}

function pgPengumuman(id) {
  if (id) {
    const p = S.pengumuman.find(x => x.id === id);
    if (!p) return head("Pengumuman") + `<div class="wrap section">${empty("Pengumuman tidak ditemukan.")}<p style="text-align:center"><a href="#/pengumuman">← Kembali</a></p></div>`;
    return head(p.judul, fmtDate(p.tanggal)) + `<section class="section"><div class="wrap prose">${safeUrl(p.gambar) ? img(p.gambar, p.judul) : ""}${nl2p(p.isi)}<a class="btn btn-ghost btn-sm" href="#/pengumuman">← Semua pengumuman</a></div></section>`;
  }
  const list = [...S.pengumuman].sort(byTgl);
  return head("Pengumuman", "Informasi terbaru dari madrasah") + `<section class="section"><div class="wrap">${list.length ? `<div class="grid g3">${list.map(cardPeng).join("")}</div>` : empty("Belum ada pengumuman.")}</div></section>`;
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
  return head("PPDB " + s.ppdbTahun, s.nama) + `<section class="section"><div class="wrap"><div class="grid g2" style="align-items:start">
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
  const rows = [["Alamat", s.alamat], ["Telepon", s.telp], ["Email", s.email], ["Jam layanan", s.jam]].filter(([, v]) => String(v || "").trim());
  return head("Kontak", "Kami senang mendengar dari Anda") + `<section class="section"><div class="wrap"><div class="contact-grid">
    <div>${rows.length ? `<table class="info">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("")}</table>` : empty("Informasi kontak belum diisi.")}
      ${wa ? `<p style="margin-top:16px"><a class="btn" href="${wa}" target="_blank" rel="noopener">Chat WhatsApp</a></p>` : ""}
      ${mapSrc ? `<iframe class="map" style="margin-top:16px" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapSrc)}" title="Peta lokasi"></iframe>` : ""}</div>
    <form class="form card card-body" id="f-kontak" novalidate><h3>Kirim Pesan</h3>
      <label class="f">Nama <span class="req">*</span><input name="nama" required maxlength="100"></label>
      <label class="f">Email (opsional)<input type="email" name="email" maxlength="120"></label>
      <label class="f">Pesan <span class="req">*</span><textarea name="pesan" required maxlength="1500"></textarea></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit">Kirim Pesan</button><div id="kontak-msg"></div></form></div></div></section>`;
}

/* ---------- Form handler ---------- */
async function submitForm(form, col, msgEl, build, okText) {
  const msg = $(msgEl);
  if (form.website.value) return; // honeypot
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
    submitForm(e.target, "pesan", "#kontak-msg", d => ({ nama: t(d.nama), email: t(d.email), pesan: t(d.pesan), dibaca: false }),
      "Terima kasih, pesan Anda sudah kami terima."); });
  if (route === "galeri") $$(".gallery figure").forEach(f => f.addEventListener("click", () => {
    if (!f.dataset.src) return;
    const lb = document.createElement("div"); lb.className = "lightbox";
    lb.innerHTML = `<div><img src="${esc(f.dataset.src)}" alt=""><p>${esc(f.dataset.cap)}</p></div>`;
    lb.addEventListener("click", () => lb.remove()); document.body.appendChild(lb); }));
}

/* ---------- Router ---------- */
function render() {
  const [route = "", id] = location.hash.replace(/^#\/?/, "").split("/");
  const pages = { "": pgBeranda, profil: pgProfil, guru: pgGuru, galeri: pgGaleri, pengumuman: () => pgPengumuman(id), ppdb: pgPpdb, kontak: pgKontak };
  $("#app").innerHTML = (pages[route] || pgBeranda)();
  $$("#nav a[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === route));
  $("#nav").classList.remove("open"); $("#burger").setAttribute("aria-expanded", "false");
  bind(route);
  window.scrollTo(0, 0);
}

/* ---------- PWA ---------- */
let deferred;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#install").hidden = false; });
$("#install").addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true; });
$("#burger").addEventListener("click", () => { const o = $("#nav").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", o); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- Start ---------- */
window.addEventListener("hashchange", render);
loadData().then(() => { applyBrand(); render(); }).catch(e => { console.error(e); $("#app").innerHTML = empty("Gagal memuat data. Muat ulang halaman."); });
