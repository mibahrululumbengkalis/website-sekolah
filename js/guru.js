// Portal guru: presensi guru (tautan), presensi siswa (wali kelas), input nilai (guru mapel), rapor (wali kelas)
import {
  configured, db, auth, collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp, query, where,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "./firebase.js";
import { $, $$, esc, toast, fmtDate } from "./util.js";
import { cfg, akhir } from "./admin-akademik.js";

const root = $("#root");
const S = { user: null, peg: null, rombel: {}, mapel: {}, c: null, tab: "home" };
const KEY = t => String(t || "").replace(/[^0-9A-Za-z]+/g, "-");
const wibToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
const byNama = (a, b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id");
const sel = (id, opts, val = "") => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const errText = e => e && e.code === "permission-denied" ? "Ditolak server. Anda belum ditugaskan untuk data ini atau data sudah dikunci." : (e.message || "Terjadi kesalahan");

function viewLogin(msg = "") {
  root.innerHTML = `<div class="pwrap p-login"><div class="card card-body"><img src="icons/logo-192.png" alt="" style="width:72px;height:72px;display:block;margin:0 auto 10px"><h2 style="text-align:center">Portal Guru</h2><p class="muted">MI Bahrul Ulum</p>
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
function viewMsg(title, text) {
  root.innerHTML = `<div class="pwrap p-login"><div class="card card-body"><h2>${esc(title)}</h2><p>${text}</p><button class="btn btn-ghost" id="out">Keluar</button></div></div>`;
  $("#out").addEventListener("click", () => signOut(auth));
}

/* ---------- Kerangka ---------- */
const walas = () => (S.peg.walas || []).filter(r => S.rombel[r]);
const ajar = () => (S.peg.ajar || []).map(x => x.split("|")).filter(([r, m]) => S.rombel[r] && S.mapel[m]);
function tabsList() {
  const t = [["home", "Beranda"]];
  if (walas().length) t.push(["absen", "Presensi Siswa"]);
  if (ajar().length) t.push(["nilai", "Input Nilai"]);
  if (walas().length) t.push(["rapor", "Rapor"]);
  return t;
}
function frame() {
  root.innerHTML = `<div class="pwrap"><div class="p-head"><div><h1>${esc(S.peg.nama)}</h1><small>${esc(S.peg.jabatan || "Guru")} · TP ${esc(S.c.tapel)} ${esc(S.c.semester)}</small></div><button class="btn btn-ghost btn-sm" id="out">Keluar</button></div>
    <div class="gtabs">${tabsList().map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="gmain"></div></div>`;
  $("#out").onclick = () => signOut(auth);
  $$(".gtabs button").forEach(b => b.onclick = () => { S.tab = b.dataset.t; frame(); });
  const m = $("#gmain");
  ({ home, absen, nilai, rapor }[S.tab] || home)(m).catch(e => { console.error(e); m.innerHTML = `<div class="alert warn">${esc(errText(e))}</div>`; });
}

async function home(m) {
  const w = walas().map(r => S.rombel[r]), a = ajar();
  const grp = {}; a.forEach(([r, mm]) => { (grp[S.mapel[mm]] = grp[S.mapel[mm]] || []).push(S.rombel[r]); });
  m.innerHTML = `<div class="gcard"><h3>Presensi guru</h3><p class="muted small" style="margin-top:0">Presensi masuk/pulang dengan lokasi dan selfie.</p><a class="btn btn-lg" href="presensi.html">Buka Presensi Guru</a></div>
    <div class="gcard"><h3>Penugasan Anda</h3>
    ${w.length ? `<p style="margin:0 0 6px"><b>Wali kelas:</b></p>${w.map(x => `<span class="chip">${esc(x)}</span>`).join("")}` : ""}
    ${Object.keys(grp).length ? `<p style="margin:10px 0 6px"><b>Mengajar:</b></p>${Object.entries(grp).map(([mp, rs]) => `<div style="margin-bottom:6px"><b>${esc(mp)}</b> → ${rs.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>`).join("")}` : ""}
    ${!w.length && !Object.keys(grp).length ? `<div class="empty">Belum ada penugasan. Hubungi admin untuk menetapkan wali kelas / mapel yang Anda ajar.</div>` : ""}</div>
    <p style="text-align:center"><a href="index.html">← Ke website</a></p>`;
}

async function siswaOf(rid) {
  const s = await getDocs(query(collection(db, "siswa"), where("rombelId", "==", rid)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => (x.status || "aktif") === "aktif").sort(byNama);
}

/* ---------- Presensi siswa ---------- */
const ST = [["H", "H"], ["S", "S"], ["I", "I"], ["A", "A"]];
async function absen(m) {
  const rs = walas();
  m.innerHTML = `<div class="gcard"><h3>Presensi Siswa</h3><div class="gsel">${sel("ar", rs.map(r => [r, S.rombel[r]]), rs[0])}<input type="date" id="at" value="${wibToday()}" max="${wibToday()}"><button class="btn" id="go">Tampilkan</button></div><p class="muted small" style="margin:0">H = Hadir, S = Sakit, I = Izin, A = Alpa</p></div><div id="out"></div>`;
  $("#go").onclick = async () => {
    const rid = $("#ar").value, tgl = $("#at").value; if (!tgl) return toast("Pilih tanggal", "err");
    const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
    try {
      const sl = await siswaOf(rid);
      const ref = doc(db, "presensi_siswa", `${rid}_${tgl}`); const snap = await getDoc(ref);
      const old = snap.exists() ? snap.data() : null; const data = old ? old.data || {} : {}; const cat = old ? old.catatan || {} : {};
      out.innerHTML = `<div class="gcard"><p class="muted small" style="margin-top:0">${old ? "Presensi sudah tersimpan; perubahan status memerlukan alasan." : "Belum ada presensi pada tanggal ini (pilihan awal: Hadir)."}</p>
        ${sl.length ? `<div class="wrapx"><table class="gtbl"><thead><tr><th>Nama</th>${ST.map(([k, l]) => `<th class="c">${l}</th>`).join("")}<th>Catatan</th></tr></thead><tbody>
        ${sl.map(s => `<tr><td>${esc(s.nama)}</td>${ST.map(([k]) => `<td class="c"><input type="radio" name="st_${esc(s.id)}" value="${k}" ${(data[s.id] || "H") === k ? "checked" : ""}></td>`).join("")}<td><input type="text" name="ct_${esc(s.id)}" value="${esc(cat[s.id] || "")}" maxlength="120"></td></tr>`).join("")}</tbody></table></div>
        <div class="gsel" style="margin-top:12px"><button class="btn btn-ghost" id="allh">Semua hadir</button><button class="btn" id="save">Simpan presensi</button></div>` : `<div class="empty">Belum ada siswa aktif di rombel ini.</div>`}</div>`;
      const allh = $("#allh"); if (allh) allh.onclick = () => $$("input[type=radio][value=H]", out).forEach(x => x.checked = true);
      const sv = $("#save"); if (!sv) return;
      sv.onclick = async () => {
        const nd = {}, nc = {};
        sl.forEach(s => { nd[s.id] = (out.querySelector(`input[name="st_${s.id}"]:checked`) || {}).value || "H"; const t = (out.querySelector(`input[name="ct_${s.id}"]`) || {}).value.trim(); if (t) nc[s.id] = t; });
        const diffs = old ? sl.filter(s => (data[s.id] || "H") !== nd[s.id]).map(s => ({ siswaId: s.id, nama: s.nama, dari: data[s.id] || "H", ke: nd[s.id] })) : [];
        const commit = async alasan => {
          try {
            const kor = [...(old && old.koreksi || []), ...diffs.map(d => ({ ...d, alasan, waktu: new Date().toISOString() }))];
            await setDoc(ref, { rombelId: rid, rombelNama: S.rombel[rid], tanggal: tgl, data: nd, catatan: nc, koreksi: kor, updatedAt: serverTimestamp() });
            toast("Presensi tersimpan"); $("#go").click();
          } catch (e) { toast(errText(e), "err"); }
        };
        if (!diffs.length) return commit("");
        const a = prompt(`Ada ${diffs.length} perubahan status. Tulis alasan koreksi:`);
        if (a && a.trim()) commit(a.trim().slice(0, 200)); else toast("Alasan koreksi wajib diisi", "err");
      };
    } catch (e) { toast(errText(e), "err"); out.innerHTML = ""; }
  };
}

/* ---------- Input nilai ---------- */
async function nilai(m) {
  const a = ajar();
  m.innerHTML = `<div class="gcard"><h3>Input Nilai</h3><div class="gsel">${sel("nk", a.map(([r, mm]) => [r + "|" + mm, `${S.mapel[mm]} – ${S.rombel[r]}`]))}<button class="btn" id="go">Tampilkan</button></div>
    <p class="muted small" style="margin:0">KKM ${esc(S.c.kkm)} · bobot Tugas ${S.c.bTugas}% / UH ${S.c.bUH}% / UTS ${S.c.bUTS}% / UAS ${S.c.bUAS}%</p></div><div id="out"></div>`;
  $("#go").onclick = async () => {
    const [rid, mid] = $("#nk").value.split("|"); const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
    try {
      const sl = await siswaOf(rid); const c = S.c;
      const ref = doc(db, "nilai", `${KEY(c.tapel)}_${c.semester}_${rid}_${mid}`); const snap = await getDoc(ref); const data = snap.exists() ? snap.data().data || {} : {};
      const inp = (s, k) => `<input type="number" min="0" max="100" step="0.1" data-s="${esc(s.id)}" data-k="${k}" value="${esc(data[s.id] && data[s.id][k] !== undefined ? data[s.id][k] : "")}">`;
      out.innerHTML = `<div class="gcard">${sl.length ? `<div class="wrapx"><table class="gtbl"><thead><tr><th>Nama</th><th>Tugas</th><th>UH</th><th>UTS</th><th>UAS</th><th>Akhir</th></tr></thead><tbody>
        ${sl.map(s => `<tr data-r="${esc(s.id)}"><td>${esc(s.nama)}</td><td>${inp(s, "tugas")}</td><td>${inp(s, "uh")}</td><td>${inp(s, "uts")}</td><td>${inp(s, "uas")}</td><td class="ak"><b>–</b></td></tr>`).join("")}</tbody></table></div>
        <p style="margin:12px 0 0"><button class="btn" id="save">Simpan nilai</button></p>` : `<div class="empty">Belum ada siswa aktif.</div>`}</div>`;
      const rowVals = tr => { const e = {}; $$("input", tr).forEach(i => { const v = num(i.value); if (v !== null) e[i.dataset.k] = Math.min(100, Math.max(0, v)); }); return e; };
      const calc = () => $$("tr[data-r]", out).forEach(tr => { const v = akhir(rowVals(tr), c); const td = tr.querySelector(".ak"); td.innerHTML = `<b>${v === null ? "–" : v}</b>`; td.style.color = v !== null && v < c.kkm ? "var(--red)" : ""; });
      out.addEventListener("input", calc); calc();
      const sv = $("#save"); if (sv) sv.onclick = async () => {
        const o = {}; $$("tr[data-r]", out).forEach(tr => { const e = rowVals(tr); if (Object.keys(e).length) o[tr.dataset.r] = e; });
        try { await setDoc(ref, { tapel: c.tapel, semester: c.semester, rombelId: rid, mapelId: mid, data: o, updatedAt: serverTimestamp() }); toast("Nilai tersimpan"); } catch (e) { toast(errText(e), "err"); }
      };
    } catch (e) { toast(errText(e), "err"); out.innerHTML = ""; }
  };
}

/* ---------- Rapor wali kelas ---------- */
const SIKAP = ["Sangat Baik", "Baik", "Cukup", "Perlu Bimbingan"];
const RS = { draf: "Draf", diperiksa: "Sudah diperiksa", publikasi: "Dipublikasikan" };
async function rapor(m) {
  const rs = walas(); const c = S.c;
  m.innerHTML = `<div class="gcard"><h3>Rapor Kelas</h3><div class="gsel">${sel("pr", rs.map(r => [r, S.rombel[r]]), rs[0])}<button class="btn" id="go">Tampilkan</button></div>
    <p class="muted small" style="margin:0">Draf rapor dibuat oleh admin dari nilai & presensi. Anda melengkapi sikap/catatan lalu menandai <b>diperiksa</b>; admin yang mempublikasikan.</p></div><div id="out"></div>`;
  $("#go").onclick = async () => {
    const rid = $("#pr").value; const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
    try {
      const snap = await getDocs(query(collection(db, "rapor"), where("rombelId", "==", rid)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.tapel === c.tapel && r.semester === c.semester).sort(byNama);
      out.innerHTML = `<div class="gcard">${list.length ? `<table class="gtbl"><thead><tr><th>Nama</th><th>Status</th><th></th></tr></thead><tbody>${list.map(r => `<tr><td>${esc(r.nama)}</td><td>${esc(RS[r.status] || r.status)}</td><td>${r.status === "publikasi" ? "" : `<button class="btn btn-ghost btn-sm" data-ed="${esc(r.id)}">Lengkapi</button>`}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Belum ada draf rapor untuk rombel ini di semester aktif. Minta admin membuat draf rapor.</div>`}</div>`;
      out.onclick = ev => {
        const b = ev.target.closest("[data-ed]"); if (!b) return; const r = list.find(x => x.id === b.dataset.ed);
        const ov = document.createElement("div"); ov.className = "cam";
        ov.innerHTML = `<div class="box" style="max-height:92vh;overflow:auto"><p><strong>${esc(r.nama)}</strong> · ${(r.nilai || []).length} mapel bernilai</p><form class="form" id="f-r">
          <label class="f">Sikap<select name="sikap">${SIKAP.map(x => `<option ${r.sikap === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
          <label class="f">Sakit (hari)<input type="number" name="sakit" min="0" value="${esc(r.sakit || 0)}"></label><label class="f">Izin (hari)<input type="number" name="izin" min="0" value="${esc(r.izin || 0)}"></label><label class="f">Alpa (hari)<input type="number" name="alpa" min="0" value="${esc(r.alpa || 0)}"></label>
          <label class="f">Catatan wali kelas<textarea name="catatan" rows="4" maxlength="500">${esc(r.catatan || "")}</textarea></label>
          <label class="f"><input type="checkbox" name="ok" ${r.status === "diperiksa" ? "checked" : ""}> Tandai sudah diperiksa</label>
          <div class="row"><button type="button" class="btn btn-ghost" id="cn">Batal</button><button class="btn" type="submit">Simpan</button></div></form></div>`;
        document.body.appendChild(ov); ov.querySelector("#cn").onclick = () => ov.remove();
        ov.querySelector("#f-r").onsubmit = async e => {
          e.preventDefault(); const f = e.target;
          try {
            await updateDoc(doc(db, "rapor", r.id), { sikap: f.sikap.value, sakit: Number(f.sakit.value) || 0, izin: Number(f.izin.value) || 0, alpa: Number(f.alpa.value) || 0, catatan: f.catatan.value.trim(), status: f.ok.checked ? "diperiksa" : "draf", updatedAt: serverTimestamp() });
            ov.remove(); toast("Tersimpan"); $("#go").click();
          } catch (er) { toast(errText(er), "err"); }
        };
      };
    } catch (e) { toast(errText(e), "err"); out.innerHTML = ""; }
  };
}

/* ---------- Start ---------- */
if (!configured) viewMsg("Firebase belum dikonfigurasi", "Isi <code>firebase-config.js</code> terlebih dahulu.");
else onAuthStateChanged(auth, async user => {
  S.user = user;
  if (!user) return viewLogin();
  try {
    const p = await getDoc(doc(db, "pegawai", user.uid));
    if (!p.exists() || p.data().aktif !== true) return viewMsg("Akun belum aktif", "Akun Anda belum terdaftar atau dinonaktifkan sebagai guru. Hubungi admin madrasah. Jika Anda admin, masuk lewat <a href=\"admin.html\">halaman admin</a>.");
    S.peg = p.data();
    const [rb, mp] = await Promise.all([getDocs(collection(db, "rombel")), getDocs(collection(db, "mapel"))]);
    S.rombel = Object.fromEntries(rb.docs.map(d => [d.id, d.data().nama])); S.mapel = Object.fromEntries(mp.docs.map(d => [d.id, d.data().nama]));
    S.c = await cfg();
    if (!tabsList().some(([k]) => k === S.tab)) S.tab = "home";
    frame();
  } catch (e) { console.error(e); viewMsg("Gagal memuat", "Periksa koneksi lalu muat ulang halaman."); }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
