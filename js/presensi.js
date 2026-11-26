import {
  configured, db, auth, collection, doc, getDoc, getDocs, writeBatch, serverTimestamp, query, where,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "./firebase.js";
import { $, esc, toast, compressImage } from "./util.js";
import { DEFAULT_PRESENSI, wib, hhmm, haversine, isLate, toDate } from "./presensi-core.js";

const root = $("#root");
const S = { user: null, peg: null, cfg: { ...DEFAULT_PRESENSI }, today: null, hist: [], clock: null };
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const SLABEL = { hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", dinas: "Dinas luar", alpa: "Alpa" };

/* ---------- Layar login ---------- */
function viewLogin(msg = "") {
  stopClock();
  root.innerHTML = `<div class="pwrap p-login"><div class="card card-body"><h2>Presensi Guru</h2><p class="muted">MI Bahrul Ulum</p>
    <form class="form" id="f-login"><label class="f">Email<input type="email" name="email" required autocomplete="username"></label>
    <label class="f">Kata sandi<input type="password" name="pw" required autocomplete="current-password"></label>
    <button class="btn" type="submit">Masuk</button><div id="login-msg">${msg}</div>
    <button class="btn btn-ghost btn-sm" type="button" id="forgot">Lupa kata sandi</button></form>
    <p style="margin:14px 0 0"><a href="index.html">← Ke website</a></p></div></div>`;
  $("#f-login").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector("button[type=submit]"); b.disabled = true;
    try { await signInWithEmailAndPassword(auth, f.email.value.trim(), f.pw.value); }
    catch { $("#login-msg").innerHTML = `<div class="alert warn">Email atau kata sandi salah.</div>`; b.disabled = false; }
  });
  $("#forgot").addEventListener("click", async () => {
    const em = $("#f-login").email.value.trim(); if (!em) return toast("Isi email terlebih dahulu", "err");
    try { await sendPasswordResetEmail(auth, em); toast("Tautan reset dikirim ke email."); } catch { toast("Gagal mengirim tautan reset", "err"); }
  });
}
function viewMsg(title, text, out = true) {
  stopClock();
  root.innerHTML = `<div class="pwrap p-login"><div class="card card-body"><h2>${esc(title)}</h2><p>${text}</p>
    ${out ? `<button class="btn btn-ghost" id="out">Keluar</button>` : `<a class="btn btn-ghost" href="index.html">← Ke website</a>`}</div></div>`;
  if (out) $("#out").addEventListener("click", () => signOut(auth));
}

/* ---------- Data ---------- */
const docId = (uid, tgl) => `${uid}_${tgl}`;
async function loadAll() {
  const uid = S.user.uid;
  const [cfgSnap, todaySnap, hist] = await Promise.all([
    getDoc(doc(db, "settings", "presensi")),
    getDoc(doc(db, "presensi", docId(uid, wib().date))),
    getDocs(query(collection(db, "presensi"), where("uid", "==", uid)))
  ]);
  S.cfg = { ...DEFAULT_PRESENSI, ...(cfgSnap.exists() ? cfgSnap.data() : {}) };
  S.today = todaySnap.exists() ? todaySnap.data() : null;
  const bulan = wib().date.slice(0, 7);
  S.hist = hist.docs.map(d => d.data()).filter(r => String(r.tanggal).startsWith(bulan)).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/* ---------- Layar utama ---------- */
const tglPanjang = () => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
const jamDetik = () => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date()).replace(/\./g, ":");
function stopClock() { if (S.clock) { clearInterval(S.clock); S.clock = null; } }

function statusToday() {
  const t = S.today;
  if (!t) return { label: "Belum presensi", cls: "alpa" };
  if (t.status === "hadir") return { label: t.masuk && isLate(t.masuk.waktu, S.cfg) ? "Hadir (terlambat)" : "Hadir", cls: t.masuk && isLate(t.masuk.waktu, S.cfg) ? "terlambat" : "hadir" };
  return { label: SLABEL[t.status] || t.status, cls: t.status };
}
function viewHome() {
  const c = S.cfg, t = S.today, st = statusToday();
  const canMasuk = !t, canPulang = t && t.status === "hadir" && !t.pulang;
  root.innerHTML = `<div class="pwrap">
    <div class="p-head"><div><h1>${esc(S.peg.nama)}</h1><small>${esc(S.peg.jabatan || "Guru")}</small></div><button class="btn btn-ghost btn-sm" id="out">Keluar</button></div>
    <div class="clock"><div class="time" id="clk">${jamDetik()}</div><div class="date">${esc(tglPanjang())}</div>
      <div class="rule">Masuk ${esc(c.jamMasuk)} (toleransi ${esc(c.toleransi)} menit) · Pulang ${esc(c.jamPulang)}</div></div>
    <div class="stat-card"><h3>Presensi hari ini <span class="pill ${st.cls}" style="float:right">${esc(st.label)}</span></h3>
      <div class="srow"><div class="sbox"><b>${t && t.masuk ? hhmm(t.masuk.waktu) : "–"}</b><span>Jam masuk</span></div>
      <div class="sbox"><b>${t && t.pulang ? hhmm(t.pulang.waktu) : "–"}</b><span>Jam pulang</span></div></div>
      ${t && t.ket ? `<p class="muted small" style="margin:10px 0 0">Keterangan: ${esc(t.ket)}</p>` : ""}</div>
    ${c.aktif ? `<div class="acts-col">
      ${canMasuk ? `<button class="btn btn-lg" id="b-masuk">Presensi Masuk</button><button class="btn btn-lg btn-out" id="b-izin">Ajukan Izin / Sakit / Dinas Luar</button>` : ""}
      ${canPulang ? `<button class="btn btn-lg" id="b-pulang">Presensi Pulang</button>` : ""}
      ${!canMasuk && !canPulang ? `<div class="alert">Presensi hari ini sudah lengkap. Terima kasih.</div>` : ""}</div>`
      : `<div class="alert warn" style="margin-top:14px">Presensi online sedang dinonaktifkan oleh admin.</div>`}
    <div class="hist"><h3>Riwayat bulan ini</h3>${S.hist.length ? S.hist.map(r => {
      const late = r.status === "hadir" && r.masuk && isLate(r.masuk.waktu, c);
      const k = late ? "terlambat" : r.status;
      return `<div class="hrow"><div><strong>${esc(r.tanggal.split("-").reverse().join("-"))}</strong><small>${r.status === "hadir" ? `Masuk ${hhmm(r.masuk && r.masuk.waktu)} · Pulang ${hhmm(r.pulang && r.pulang.waktu)}` : esc(r.ket || "")}</small></div><span class="pill ${k}">${esc(SLABEL[k] || k)}</span></div>`;
    }).join("") : `<div class="empty">Belum ada catatan presensi bulan ini.</div>`}</div>
    <p style="text-align:center;margin-top:20px"><a href="index.html">← Ke website</a></p></div>`;
  $("#out").addEventListener("click", () => signOut(auth));
  stopClock(); S.clock = setInterval(() => { const el = $("#clk"); if (el) el.textContent = jamDetik(); }, 1000);
  if ($("#b-masuk")) $("#b-masuk").addEventListener("click", () => presensi("masuk"));
  if ($("#b-pulang")) $("#b-pulang").addEventListener("click", () => presensi("pulang"));
  if ($("#b-izin")) $("#b-izin").addEventListener("click", izinForm);
}

/* ---------- Lokasi & kamera ---------- */
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Perangkat tidak mendukung GPS."));
    navigator.geolocation.getCurrentPosition(resolve, e => reject(new Error(
      e.code === 1 ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser lalu coba lagi."
        : e.code === 3 ? "Lokasi tidak ditemukan (waktu habis). Pindah ke tempat terbuka lalu coba lagi." : "Lokasi tidak dapat ditentukan.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
function takeSelfie() {
  return new Promise(resolve => {
    const ov = document.createElement("div"); ov.className = "cam";
    ov.innerHTML = `<div class="box"><p><strong>Ambil foto selfie</strong> sebagai bukti presensi.</p><div id="stage"></div><div class="row" id="btns"></div></div>`;
    document.body.appendChild(ov);
    const stage = ov.querySelector("#stage"), btns = ov.querySelector("#btns");
    let stream = null;
    const done = v => { if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); resolve(v); };
    const review = url => {
      stage.innerHTML = `<img class="shot" src="${url}" alt="Foto selfie">`;
      btns.innerHTML = `<button class="btn btn-ghost" id="re">Ulangi</button><button class="btn" id="ok">Gunakan</button>`;
      btns.querySelector("#re").onclick = () => live();
      btns.querySelector("#ok").onclick = () => done(url);
    };
    const fileFallback = () => {
      stage.innerHTML = `<p class="muted">Kamera langsung tidak tersedia. Gunakan kamera perangkat:</p><input type="file" accept="image/*" capture="user" id="fi">`;
      btns.innerHTML = `<button class="btn btn-ghost" id="cn">Batal</button>`;
      btns.querySelector("#cn").onclick = () => done(null);
      stage.querySelector("#fi").onchange = async e => {
        try { review(await compressImage(e.target.files[0], 320, 0.6, 60000)); } catch (err) { toast(err.message, "err"); }
      };
    };
    const live = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw 0;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
        stage.innerHTML = `<video autoplay playsinline muted></video>`;
        const v = stage.querySelector("video"); v.srcObject = stream; await v.play();
        btns.innerHTML = `<button class="btn btn-ghost" id="cn">Batal</button><button class="btn" id="sn">Ambil foto</button>`;
        btns.querySelector("#cn").onclick = () => done(null);
        btns.querySelector("#sn").onclick = () => {
          const w = 320, h = Math.round(w * (v.videoHeight || 4) / (v.videoWidth || 3));
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          const x = cv.getContext("2d"); x.translate(w, 0); x.scale(-1, 1); x.drawImage(v, 0, 0, w, h); // cermin agar sesuai pratinjau
          let q = 0.6, out = cv.toDataURL("image/jpeg", q);
          while (out.length > 60000 && q > 0.3) { q -= 0.1; out = cv.toDataURL("image/jpeg", q); }
          if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
          review(out);
        };
      } catch { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; fileFallback(); }
    };
    live();
  });
}

/* ---------- Presensi masuk / pulang ---------- */
let busy = false;
async function presensi(jenis) {
  if (busy) return; busy = true;
  const btn = $(jenis === "masuk" ? "#b-masuk" : "#b-pulang"); if (btn) { btn.disabled = true; btn.textContent = "Memeriksa lokasi…"; }
  try {
    const c = S.cfg, lat0 = num(c.lat), lng0 = num(c.lng), r = num(c.radius) || 100;
    if (lat0 === null || lng0 === null) throw new Error("Lokasi madrasah belum diatur oleh admin.");
    const pos = await getPosition();
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const jarak = haversine(lat, lng, lat0, lng0);
    if (jarak > r) throw new Error(`Anda berada sekitar ${Math.round(jarak)} m dari madrasah. Presensi hanya dapat dilakukan dalam radius ${r} m (akurasi GPS ±${Math.round(accuracy)} m).`);
    let foto = null;
    if (c.wajibSelfie) {
      if (btn) btn.textContent = "Ambil selfie…";
      foto = await takeSelfie();
      if (!foto) throw new Error("Presensi dibatalkan: foto selfie diperlukan.");
    }
    const uid = S.user.uid, tgl = wib().date;
    const posData = { waktu: serverTimestamp(), lat: +lat.toFixed(6), lng: +lng.toFixed(6), akurasi: Math.round(accuracy), jarak: Math.round(jarak) };
    const b = writeBatch(db);
    if (foto) b.set(doc(db, "presensi_foto", `${uid}_${tgl}_${jenis}`), { uid, tanggal: tgl, jenis, foto, waktu: serverTimestamp() });
    if (jenis === "masuk") b.set(doc(db, "presensi", docId(uid, tgl)), { uid, nama: S.peg.nama, tanggal: tgl, status: "hadir", masuk: posData });
    else b.update(doc(db, "presensi", docId(uid, tgl)), { pulang: posData });
    await b.commit();
    toast(jenis === "masuk" ? "Presensi masuk tercatat." : "Presensi pulang tercatat.");
    await loadAll();
  } catch (e) {
    console.warn(e);
    const denied = e && e.code === "permission-denied";
    toast(denied ? "Ditolak server. Periksa tanggal & jam perangkat (harus otomatis) atau Anda sudah presensi." : (e.message || "Gagal presensi"), "err");
  }
  busy = false; viewHome();
}

/* ---------- Izin / sakit / dinas ---------- */
function izinForm() {
  const ov = document.createElement("div"); ov.className = "cam";
  ov.innerHTML = `<div class="box"><p><strong>Ajukan keterangan hari ini</strong></p><form class="form" id="f-izin">
    <label class="f">Jenis<select name="status" required><option value="izin">Izin</option><option value="sakit">Sakit</option><option value="dinas">Dinas luar</option></select></label>
    <label class="f">Keterangan<textarea name="ket" required maxlength="300" placeholder="Alasan singkat"></textarea></label>
    <div class="row"><button type="button" class="btn btn-ghost" id="cn">Batal</button><button class="btn" type="submit">Kirim</button></div></form></div>`;
  document.body.appendChild(ov);
  ov.querySelector("#cn").onclick = () => ov.remove();
  ov.querySelector("#f-izin").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target; const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const uid = S.user.uid, tgl = wib().date;
      const b = writeBatch(db);
      b.set(doc(db, "presensi", docId(uid, tgl)), { uid, nama: S.peg.nama, tanggal: tgl, status: f.status.value, ket: f.ket.value.trim() });
      await b.commit(); ov.remove(); toast("Keterangan tercatat."); await loadAll(); viewHome();
    } catch (err) {
      console.error(err);
      toast(err.code === "permission-denied" ? "Ditolak server. Periksa tanggal & jam perangkat atau Anda sudah presensi hari ini." : "Gagal mengirim", "err");
      btn.disabled = false;
    }
  });
}

/* ---------- Start ---------- */
if (!configured) viewMsg("Firebase belum dikonfigurasi", "Isi <code>firebase-config.js</code> terlebih dahulu.", false);
else onAuthStateChanged(auth, async user => {
  S.user = user;
  if (!user) return viewLogin();
  try {
    const p = await getDoc(doc(db, "pegawai", user.uid));
    if (!p.exists() || p.data().aktif !== true) return viewMsg("Akun belum aktif", "Akun Anda belum terdaftar atau dinonaktifkan sebagai guru. Hubungi admin madrasah.");
    S.peg = p.data();
    await loadAll();
    viewHome();
  } catch (e) { console.error(e); viewMsg("Gagal memuat", "Periksa koneksi lalu muat ulang halaman."); }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
