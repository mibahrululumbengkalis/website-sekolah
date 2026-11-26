import {
  db, auth, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, Timestamp,
  listCol, createStaffAccount, sendPasswordResetEmail
} from "./firebase.js";
import { $, $$, esc, toast } from "./util.js";
import { DEFAULT_PRESENSI, wib, toDate, hhmm, fromWib, haversine, isLate, rekapBulan, daysOfMonth } from "./presensi-core.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SL = { hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", dinas: "Dinas luar", alpa: "Alpa", belum: "Belum presensi" };
const tglID = t => t.split("-").reverse().join("-");
const pill = k => `<span class="pill ${k === "belum" ? "baru" : k === "hadir" ? "diterima" : k === "alpa" ? "ditolak" : k === "terlambat" ? "baru" : ""}">${esc(SL[k] || k)}</span>`;

async function loadCfg() {
  const s = await getDoc(doc(db, "settings", "presensi"));
  return { ...DEFAULT_PRESENSI, ...(s.exists() ? s.data() : {}) };
}
const csvCell = v => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; // cegah formula injection
function downloadCsv(name, rows) {
  const out = rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + out], { type: "text/csv;charset=utf-8" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function presensiTabs(ctx) {
  const { fieldHTML, readForm, modal, errMsg, wireImages } = ctx;

  /* ---- Form koreksi/input manual oleh admin ---- */
  function koreksi(peg, tanggal, rec, after) {
    const jam = v => { const d = toDate(v); return d ? wib(d).time : ""; };
    const m = modal(`<h3>${rec ? "Ubah" : "Input"} presensi</h3><p class="muted">${esc(peg.nama)} · ${esc(tglID(tanggal))}</p>
      <form class="form" id="f-kor">
        <label class="f">Status<select name="status"><option value="hadir">Hadir</option><option value="izin">Izin</option><option value="sakit">Sakit</option><option value="dinas">Dinas luar</option></select></label>
        <div class="row"><label class="f">Jam masuk<input type="time" name="masuk" value="${esc(jam(rec && rec.masuk && rec.masuk.waktu))}"></label>
        <label class="f">Jam pulang<input type="time" name="pulang" value="${esc(jam(rec && rec.pulang && rec.pulang.waktu))}"></label></div>
        <label class="f">Keterangan<textarea name="ket" maxlength="300" rows="3">${esc(rec && rec.ket || "")}</textarea></label>
        <div class="btns">${rec ? `<button type="button" class="btn btn-danger" data-del style="margin-right:auto">Hapus catatan</button>` : ""}<button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
    const f = m.querySelector("#f-kor"); if (rec) f.status.value = rec.status;
    m.querySelector("[data-x]").onclick = () => m.remove();
    const del = m.querySelector("[data-del]");
    if (del) del.onclick = async () => {
      if (!confirm("Hapus catatan presensi ini? Hari tsb akan dihitung belum presensi/alpa.")) return;
      try { await deleteDoc(doc(db, "presensi", `${peg.id}_${tanggal}`)); m.remove(); toast("Dihapus"); after(); } catch (e) { toast(errMsg(e), "err"); }
    };
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const st = f.status.value;
      const data = { uid: peg.id, nama: peg.nama, tanggal, status: st, manual: true };
      if (st === "hadir") {
        if (!f.masuk.value) return toast("Isi jam masuk untuk status Hadir", "err");
        data.masuk = { waktu: Timestamp.fromDate(fromWib(tanggal, f.masuk.value)), manual: true };
        if (f.pulang.value) data.pulang = { waktu: Timestamp.fromDate(fromWib(tanggal, f.pulang.value)), manual: true };
      } else {
        if (!f.ket.value.trim()) return toast("Isi keterangan", "err");
      }
      if (f.ket.value.trim()) data.ket = f.ket.value.trim();
      try { await setDoc(doc(db, "presensi", `${peg.id}_${tanggal}`), data); m.remove(); toast("Tersimpan"); after(); } catch (err) { toast(errMsg(err), "err"); }
    });
  }

  async function lihatFoto(peg, tanggal) {
    const m = modal(`<h3>Foto presensi</h3><p class="muted">${esc(peg.nama)} · ${esc(tglID(tanggal))}</p><div id="fotos" class="loading">Memuat…</div><div class="btns"><button class="btn" data-x>Tutup</button></div>`);
    m.querySelector("[data-x]").onclick = () => m.remove();
    try {
      const out = [];
      for (const j of ["masuk", "pulang"]) {
        const s = await getDoc(doc(db, "presensi_foto", `${peg.id}_${tanggal}_${j}`));
        if (s.exists() && /^data:image\//.test(s.data().foto)) out.push(`<figure style="margin:0 0 14px"><img src="${esc(s.data().foto)}" alt="Selfie ${j}" style="width:100%;max-width:300px;border-radius:12px"><figcaption class="muted small">${j === "masuk" ? "Masuk" : "Pulang"}</figcaption></figure>`);
      }
      m.querySelector("#fotos").className = "";
      m.querySelector("#fotos").innerHTML = out.join("") || `<div class="empty">Tidak ada foto (mungkin sudah dibersihkan atau input manual).</div>`;
    } catch (e) { m.querySelector("#fotos").innerHTML = esc(errMsg(e)); }
  }

  /* ---- Presensi hari ini ---- */
  async function hari(main) {
    const cfg = await loadCfg(), t = wib().date;
    const [pegAll, snap] = await Promise.all([listCol("pegawai"), getDocs(query(collection(db, "presensi"), where("tanggal", "==", t)))]);
    const peg = pegAll.filter(p => p.aktif).sort((a, b) => a.nama.localeCompare(b.nama));
    const recs = new Map(snap.docs.map(d => [d.data().uid, d.data()]));
    let n = { hadir: 0, terlambat: 0, izinx: 0, belum: 0 };
    const rows = peg.map(p => {
      const r = recs.get(p.id); let k = "belum";
      if (r) { k = r.status === "hadir" ? (r.masuk && isLate(r.masuk.waktu, cfg) ? "terlambat" : "hadir") : r.status; }
      if (k === "hadir") n.hadir++; else if (k === "terlambat") { n.hadir++; n.terlambat++; } else if (k === "belum") n.belum++; else n.izinx++;
      return { p, r, k };
    });
    main.innerHTML = `<div class="top"><h1>Presensi Hari Ini</h1><span class="muted">${esc(tglID(t))}</span></div>
      <div class="kpis"><div class="kpi"><b>${n.hadir}</b><span>Hadir</span></div><div class="kpi"><b>${n.terlambat}</b><span>Terlambat</span></div><div class="kpi"><b>${n.izinx}</b><span>Izin/Sakit/Dinas</span></div><div class="kpi"><b>${n.belum}</b><span>Belum presensi</span></div></div>
      <div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>Nama</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Jarak</th><th></th></tr></thead><tbody>
      ${rows.map(({ p, r, k }) => `<tr><td>${esc(p.nama)}<br><span class="muted small">${esc(p.jabatan || "")}</span></td><td>${pill(k)}${r && r.ket ? `<br><span class="muted small">${esc(r.ket)}</span>` : ""}</td>
        <td>${hhmm(r && r.masuk && r.masuk.waktu)}</td><td>${hhmm(r && r.pulang && r.pulang.waktu)}</td>
        <td>${r && r.masuk && r.masuk.jarak != null ? esc(r.masuk.jarak) + " m" : "–"}</td>
        <td><div class="acts">${r && r.status === "hadir" && !(r.masuk && r.masuk.manual) ? `<button class="btn btn-ghost btn-sm" data-f="${esc(p.id)}">Foto</button>` : ""}<button class="btn btn-ghost btn-sm" data-k="${esc(p.id)}">${r ? "Ubah" : "Input"}</button></div></td></tr>`).join("")}
      </tbody></table>` : `<div class="empty" style="border:0">Belum ada akun guru aktif. Tambahkan di menu <a href="#pegawai">Akun Guru</a>.</div>`}</div>`;
    main.addEventListener("click", e => {
      const f = e.target.closest("[data-f]"), k = e.target.closest("[data-k]");
      if (f) lihatFoto(peg.find(x => x.id === f.dataset.f), t);
      if (k) { const p = peg.find(x => x.id === k.dataset.k); koreksi(p, t, recs.get(p.id), () => ctx.refresh()); }
    });
  }

  /* ---- Rekap bulanan ---- */
  async function rekap(main) {
    const cfg = await loadCfg();
    const pegAll = (await listCol("pegawai")).filter(p => p.aktif).sort((a, b) => a.nama.localeCompare(b.nama));
    const ym0 = wib().date.slice(0, 7);
    main.innerHTML = `<div class="top noprint"><h1>Rekap Presensi</h1><div class="acts"><input type="month" id="ym" value="${ym0}" style="margin:0;width:auto"><button class="btn" id="go">Tampilkan</button></div></div><div id="out"></div>`;
    const show = async () => {
      const ym = $("#ym").value; if (!ym) return;
      const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
      try {
        const snap = await getDocs(query(collection(db, "presensi"), where("tanggal", ">=", `${ym}-01`), where("tanggal", "<=", `${ym}-31`)));
        const recs = new Map(snap.docs.map(d => [`${d.data().uid}_${d.data().tanggal}`, d.data()]));
        const rows = rekapBulan(ym, pegAll, recs, cfg);
        const [y, m] = ym.split("-").map(Number);
        out.innerHTML = `<h2 class="print-only">Rekap Presensi Guru MI Bahrul Ulum – ${BULAN[m - 1]} ${y}</h2>
          <div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>No</th><th>Nama</th><th>Hari kerja</th><th>Hadir</th><th>Terlambat</th><th>Izin</th><th>Sakit</th><th>Dinas</th><th>Alpa</th><th>Tanpa pulang</th><th>% Hadir</th><th class="noprint"></th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nama)}</td><td>${r.hariKerja}</td><td>${r.hadir}</td><td>${r.terlambat}</td><td>${r.izin}</td><td>${r.sakit}</td><td>${r.dinas}</td><td>${r.alpa}</td><td>${r.tanpaPulang}</td><td>${r.persen}%</td><td class="noprint"><button class="btn btn-ghost btn-sm" data-d="${esc(r.id)}">Detail</button></td></tr>`).join("")}
          </tbody></table>` : `<div class="empty" style="border:0">Belum ada akun guru aktif.</div>`}</div>
          <p class="muted small">% Hadir = (Hadir + Dinas luar) ÷ Hari kerja. Alpa = hari kerja tanpa catatan presensi (libur dan sebelum tanggal mulai guru tidak dihitung; hari ini baru dihitung setelah jam pulang). Terlambat dihitung dari jam server terhadap pengaturan saat ini.</p>
          <div class="acts noprint"><button class="btn btn-ghost" id="csv" ${rows.length ? "" : "disabled"}>Unduh CSV</button><button class="btn" id="prn" ${rows.length ? "" : "disabled"}>Cetak / Simpan PDF</button></div>`;
        const csv = $("#csv");
        if (csv) csv.onclick = () => downloadCsv(`rekap-presensi-${ym}.csv`, [["No", "Nama", "Hari kerja", "Hadir", "Terlambat", "Izin", "Sakit", "Dinas", "Alpa", "Tanpa pulang", "Persen hadir"]]
          .concat(rows.map((r, i) => [i + 1, r.nama, r.hariKerja, r.hadir, r.terlambat, r.izin, r.sakit, r.dinas, r.alpa, r.tanpaPulang, r.persen + "%"])));
        const prn = $("#prn"); if (prn) prn.onclick = () => window.print();
        out.onclick = e => {
          const b = e.target.closest("[data-d]"); if (!b) return;
          const r = rows.find(x => x.id === b.dataset.d), p = pegAll.find(x => x.id === r.id);
          const mm = modal(`<h3>${esc(r.nama)} – ${BULAN[m - 1]} ${y}</h3><div class="tbl-wrap" style="max-height:60vh"><table class="t"><thead><tr><th>Tanggal</th><th>Status</th><th>Masuk</th><th>Pulang</th><th></th></tr></thead><tbody>
            ${r.detail.map(d => `<tr><td>${esc(tglID(d.tanggal))}</td><td>${pill(d.status)}${d.ket ? `<br><span class="muted small">${esc(d.ket)}</span>` : ""}</td><td>${esc(d.masuk)}</td><td>${esc(d.pulang)}</td><td><button class="btn btn-ghost btn-sm" data-k="${esc(d.tanggal)}">Ubah</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Tidak ada data.</td></tr>`}
            </tbody></table></div><div class="btns"><button class="btn" data-x>Tutup</button></div>`);
          mm.querySelector("[data-x]").onclick = () => mm.remove();
          mm.addEventListener("click", ev => {
            const k = ev.target.closest("[data-k]"); if (!k) return;
            const d = r.detail.find(x => x.tanggal === k.dataset.k);
            mm.remove(); koreksi(p, d.tanggal, d.rec, show);
          });
        };
      } catch (e) { out.innerHTML = `<div class="alert warn">${esc(errMsg(e))}</div>`; }
    };
    $("#go").onclick = show; await show();
  }

  /* ---- Akun guru ---- */
  async function pegawai(main) {
    const rows = (await listCol("pegawai")).sort((a, b) => a.nama.localeCompare(b.nama));
    main.innerHTML = `<div class="top"><h1>Akun Guru (Presensi)</h1><button class="btn" id="add">+ Tambah akun guru</button></div>
      <p class="muted small">Setiap guru login di <code>presensi.html</code> dengan email dan kata sandi di bawah. Gunakan email aktif milik guru agar fitur “Lupa kata sandi” berfungsi.</p>
      <div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>Nama</th><th>Jabatan</th><th>Email</th><th>Mulai</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(p => `<tr><td>${esc(p.nama)}</td><td>${esc(p.jabatan || "")}</td><td>${esc(p.email || "")}</td><td>${esc(p.mulai ? tglID(p.mulai) : "")}</td><td>${p.aktif ? '<span class="pill diterima">Aktif</span>' : '<span class="pill ditolak">Nonaktif</span>'}</td>
        <td><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${esc(p.id)}">Ubah</button><button class="btn btn-ghost btn-sm" data-r="${esc(p.id)}">Reset sandi</button></div></td></tr>`).join("")}
      </tbody></table>` : `<div class="empty" style="border:0">Belum ada akun guru.</div>`}</div>`;
    $("#add").onclick = () => {
      const m = modal(`<h3>Tambah akun guru</h3><form class="form" id="f-peg">
        <label class="f">Nama lengkap <span class="req">*</span><input name="nama" required maxlength="100"></label>
        <label class="f">Jabatan<input name="jabatan" maxlength="80" placeholder="Guru Kelas / Guru Mapel / Staf"></label>
        <label class="f">Email <span class="req">*</span><input type="email" name="email" required></label>
        <label class="f">Kata sandi awal (min. 8 karakter) <span class="req">*</span><input type="text" name="pw" required minlength="8" autocomplete="off"></label>
        <label class="f">Mulai dihitung presensi sejak <span class="req">*</span><input type="date" name="mulai" required value="${wib().date}"></label>
        <p class="muted small" style="margin:0">Sampaikan kata sandi awal secara pribadi; guru dapat menggantinya lewat “Lupa kata sandi”.</p>
        <div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Buat akun</button></div></form>`);
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelector("#f-peg").addEventListener("submit", async e => {
        e.preventDefault(); const f = e.target, b = f.querySelector("button[type=submit]"); b.disabled = true;
        let uid = null;
        try {
          uid = await createStaffAccount(f.email.value.trim(), f.pw.value);
          await setDoc(doc(db, "pegawai", uid), { nama: f.nama.value.trim(), jabatan: f.jabatan.value.trim(), email: f.email.value.trim(), mulai: f.mulai.value, aktif: true });
          m.remove(); toast("Akun guru dibuat"); ctx.refresh();
        } catch (err) {
          const code = err && err.code || "";
          toast(code === "auth/email-already-in-use" ? "Email sudah terdaftar." : code === "auth/weak-password" ? "Kata sandi terlalu lemah." : uid ? "Akun dibuat tetapi data gagal disimpan: " + errMsg(err) : errMsg(err), "err");
          b.disabled = false;
        }
      });
    };
    main.addEventListener("click", async e => {
      const be = e.target.closest("[data-e]"), br = e.target.closest("[data-r]");
      if (br) {
        const p = rows.find(x => x.id === br.dataset.r);
        if (!p.email) return toast("Email tidak tersedia", "err");
        try { await sendPasswordResetEmail(auth, p.email); toast("Tautan reset dikirim ke " + p.email); } catch { toast("Gagal mengirim tautan reset", "err"); }
      }
      if (be) {
        const p = rows.find(x => x.id === be.dataset.e);
        const m = modal(`<h3>Ubah data guru</h3><form class="form" id="f-pe">
          <label class="f">Nama lengkap <span class="req">*</span><input name="nama" required maxlength="100" value="${esc(p.nama)}"></label>
          <label class="f">Jabatan<input name="jabatan" maxlength="80" value="${esc(p.jabatan || "")}"></label>
          <label class="f">Mulai dihitung presensi<input type="date" name="mulai" value="${esc(p.mulai || "")}"></label>
          <label class="f"><input type="checkbox" name="aktif" ${p.aktif ? "checked" : ""}>Akun aktif (guru nonaktif tidak bisa presensi dan tidak masuk rekap)</label>
          <p class="muted small" style="margin:0">Email: ${esc(p.email || "")} (tidak dapat diubah dari sini)</p>
          <div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
        m.querySelector("[data-x]").onclick = () => m.remove();
        m.querySelector("#f-pe").addEventListener("submit", async ev => {
          ev.preventDefault(); const f = ev.target;
          try { await updateDoc(doc(db, "pegawai", p.id), { nama: f.nama.value.trim(), jabatan: f.jabatan.value.trim(), mulai: f.mulai.value, aktif: f.aktif.checked }); m.remove(); toast("Tersimpan"); ctx.refresh(); } catch (err) { toast(errMsg(err), "err"); }
        });
      }
    });
  }

  /* ---- Pengaturan presensi ---- */
  const FIELDS = [
    { k: "aktif", l: "Presensi online aktif", t: "checkbox" },
    { k: "jamMasuk", l: "Jam masuk", t: "time" }, { k: "toleransi", l: "Toleransi keterlambatan (menit)", t: "number" },
    { k: "jamPulang", l: "Jam pulang", t: "time" },
    { k: "hariKerja", l: "Hari kerja (angka: 1=Senin … 7=Minggu, pisahkan koma)" },
    { k: "libur", l: "Tanggal libur (format YYYY-MM-DD, satu per baris)", t: "textarea", rows: 4 },
    { k: "lat", l: "Lintang (latitude) madrasah" }, { k: "lng", l: "Bujur (longitude) madrasah" },
    { k: "radius", l: "Radius presensi (meter)", t: "number" },
    { k: "wajibSelfie", l: "Wajib foto selfie", t: "checkbox" }
  ];
  async function setelan(main) {
    const cfg = await loadCfg();
    main.innerHTML = `<div class="top"><h1>Pengaturan Presensi</h1></div><form id="f-ps">
      <div class="settings-grp"><h3>Jam kerja & hari</h3><div class="form">${FIELDS.slice(0, 6).map(f => fieldHTML(f, cfg[f.k])).join("")}</div></div>
      <div class="settings-grp"><h3>Lokasi & bukti</h3><div class="form">${FIELDS.slice(6).map(f => fieldHTML(f, cfg[f.k])).join("")}
        <button type="button" class="btn btn-ghost" id="gps">Gunakan lokasi saya sekarang (lakukan saat berada di madrasah)</button>
        <p class="muted small" style="margin:0">Verifikasi lokasi dilakukan di aplikasi guru dan dapat dikelabui dengan aplikasi lokasi palsu. Jarak dan akurasi GPS disimpan sebagai bahan pemeriksaan.</p></div></div>
      <button class="btn" type="submit">Simpan pengaturan</button></form>
      <div class="settings-grp" style="margin-top:22px"><h3>Pembersihan foto selfie</h3>
        <p class="muted small">Foto selfie memuat data pribadi guru dan memakai kuota penyimpanan Firestore. Hapus foto yang sudah tidak diperlukan (catatan presensi tetap tersimpan).</p>
        <div class="acts"><label class="f" style="margin:0">Hapus foto lebih lama dari (hari)<input type="number" id="hari" value="60" min="7" style="width:120px"></label><button class="btn btn-danger" id="clean" style="align-self:end">Hapus foto lama</button></div></div>`;
    $("#gps").onclick = () => {
      if (!navigator.geolocation) return toast("GPS tidak didukung", "err");
      navigator.geolocation.getCurrentPosition(p => {
        const f = $("#f-ps"); f.lat.value = p.coords.latitude.toFixed(6); f.lng.value = p.coords.longitude.toFixed(6);
        toast(`Lokasi terisi (akurasi ±${Math.round(p.coords.accuracy)} m). Klik Simpan.`);
      }, () => toast("Gagal mengambil lokasi. Izinkan akses lokasi.", "err"), { enableHighAccuracy: true, timeout: 20000 });
    };
    $("#f-ps").addEventListener("submit", async e => {
      e.preventDefault(); const b = e.target.querySelector("button[type=submit]"); b.disabled = true;
      try {
        const d = readForm(e.target, FIELDS);
        if (d.lat !== "" && (isNaN(parseFloat(d.lat)) || Math.abs(parseFloat(d.lat)) > 90)) throw new Error("Lintang tidak valid");
        if (d.lng !== "" && (isNaN(parseFloat(d.lng)) || Math.abs(parseFloat(d.lng)) > 180)) throw new Error("Bujur tidak valid");
        if (!/^\d{1,2}:\d{2}$/.test(d.jamMasuk) || !/^\d{1,2}:\d{2}$/.test(d.jamPulang)) throw new Error("Isi jam masuk dan jam pulang");
        d.lat = String(d.lat).replace(",", "."); d.lng = String(d.lng).replace(",", ".");
        await setDoc(doc(db, "settings", "presensi"), d, { merge: true });
        toast("Pengaturan presensi tersimpan");
      } catch (err) { toast(errMsg(err), "err"); }
      b.disabled = false;
    });
    $("#clean").onclick = async () => {
      const hari = Math.max(7, parseInt($("#hari").value, 10) || 60);
      if (!confirm(`Hapus semua foto selfie presensi yang lebih lama dari ${hari} hari? Tindakan tidak dapat dibatalkan.`)) return;
      try {
        const cutoff = Timestamp.fromDate(new Date(Date.now() - hari * 864e5));
        const snap = await getDocs(query(collection(db, "presensi_foto"), where("waktu", "<", cutoff)));
        for (let i = 0; i < snap.docs.length; i += 20) await Promise.all(snap.docs.slice(i, i + 20).map(d => deleteDoc(d.ref)));
        toast(`${snap.size} foto dihapus`);
      } catch (err) { toast(errMsg(err), "err"); }
    };
  }

  return { hari, rekap, pegawai, setelan };
}
