// Modul akademik & keuangan: Siswa/Kelas, Presensi siswa, Nilai & Rapor, Keuangan.
// Semua data bersifat privat (hanya admin) lewat firestore.rules.
import {
  db, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, listCol
} from "./firebase.js";
import { $, $$, esc, safeUrl, toast, today, fmtDate, compressImage } from "./util.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const KEY = t => String(t || "").replace(/[^0-9A-Za-z]+/g, "-");
const rp = n => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0));
const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
const byNama = (a, b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id");
const byUrut = (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama || "").localeCompare(String(b.nama || ""), "id");
const csvCell = v => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
function downloadCsv(name, rows) {
  const out = rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + out], { type: "text/csv;charset=utf-8" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  text = text.replace(/^﻿/, "");
  const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}

/* ---------- Konfigurasi akademik ---------- */
const defTapel = () => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };
export const DEF = () => ({ tapel: defTapel(), semester: "Ganjil", bTugas: 20, bUH: 20, bUTS: 25, bUAS: 35, kkm: 70, kepala: "", nipKepala: "", tempat: "Bengkalis", jenjang: "MI" });
export async function cfg() {
  try { const d = await getDoc(doc(db, "akademik", "config")); return { ...DEF(), ...(d.exists() ? d.data() : {}) }; } catch { return DEF(); }
}
const akhir = (n, c) => {
  if (!n) return null;
  const parts = [[n.tugas, c.bTugas], [n.uh, c.bUH], [n.uts, c.bUTS], [n.uas, c.bUAS]].filter(([v]) => num(v) !== null);
  const w = parts.reduce((s, [, b]) => s + Number(b), 0);
  if (!parts.length || !w) return null;
  return Math.round(parts.reduce((s, [v, b]) => s + Number(v) * Number(b), 0) / w * 10) / 10;
};
const predikat = v => v === null ? "–" : v >= 90 ? "A" : v >= 80 ? "B" : v >= 70 ? "C" : "D";
const tapelRange = (tapel, sem) => {
  const y = parseInt(String(tapel).slice(0, 4), 10) || new Date().getFullYear();
  return sem === "Genap" ? [`${y + 1}-01-01`, `${y + 1}-06-30`] : [`${y}-07-01`, `${y}-12-31`];
};
const tapelYear = tapel => { const y = parseInt(String(tapel).slice(0, 4), 10) || new Date().getFullYear(); return [`${y}-07-01`, `${y + 1}-06-30`]; };
const optRombel = list => [["", "— Pilih rombel —"], ...[...list].sort(byUrut).map(r => [r.id, r.nama])];
const selHTML = (id, opts, val = "") => `<select id="${id}" style="margin:0;width:auto;min-width:150px">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const wibToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());

export function akademikTabs(ctx) {
  const { fieldHTML, readForm, modal, errMsg, wireImages } = ctx;
  const logErr = e => { console.error(e); toast(errMsg(e), "err"); };

  /* ================= Pengaturan Akademik ================= */
  async function akad(main) {
    const c = await cfg();
    const F = [
      { k: "tapel", l: "Tahun pelajaran aktif (mis. 2026/2027)", req: 1 }, { k: "semester", l: "Semester aktif", t: "select", opts: ["Ganjil", "Genap"] },
      { k: "bTugas", l: "Bobot Tugas (%)", t: "number" }, { k: "bUH", l: "Bobot Ulangan Harian (%)", t: "number" },
      { k: "bUTS", l: "Bobot UTS (%)", t: "number" }, { k: "bUAS", l: "Bobot UAS (%)", t: "number" }, { k: "kkm", l: "KKM / kriteria ketuntasan", t: "number" },
      { k: "kepala", l: "Nama kepala madrasah (untuk rapor)" }, { k: "nipKepala", l: "NIP kepala madrasah" }, { k: "tempat", l: "Tempat penerbitan rapor" }];
    main.innerHTML = `<div class="top"><h1>Pengaturan Akademik</h1></div><div class="settings-grp"><form class="form" id="f-akad">${F.map(f => fieldHTML(f, c[f.k])).join("")}
      <p class="muted small" style="margin:0">Nilai akhir = rata-rata berbobot dari komponen yang sudah diisi (komponen kosong tidak dihitung). Bobot tidak harus berjumlah 100.</p>
      <button class="btn" type="submit">Simpan</button></form></div>`;
    $("#f-akad").addEventListener("submit", async e => {
      e.preventDefault();
      try { await setDoc(doc(db, "akademik", "config"), { ...readForm(e.target, F), updatedAt: serverTimestamp() }, { merge: true }); window.__tapel = e.target.tapel.value.trim(); toast("Tersimpan"); } catch (err) { logErr(err); }
    });
  }

  /* ================= Data Siswa ================= */
  const SF = [
    { k: "nama", l: "Nama lengkap", req: 1 }, { k: "nisn", l: "NISN" }, { k: "nis", l: "NIS" }, { k: "jk", l: "Jenis kelamin", t: "select", opts: ["Laki-laki", "Perempuan"] },
    { k: "tempatLahir", l: "Tempat lahir" }, { k: "tglLahir", l: "Tanggal lahir", t: "date" }, { k: "alamat", l: "Alamat", t: "textarea", rows: 2 },
    { k: "namaAyah", l: "Nama ayah" }, { k: "namaIbu", l: "Nama ibu" }, { k: "wali", l: "Nama wali (bila ada)" }, { k: "hp", l: "No. HP/WA orang tua/wali" },
    { k: "rombelId", l: "Rombel", t: "select", opts: [] }, { k: "statusMasuk", l: "Jenis penerimaan", t: "select", opts: ["Baru", "Pindahan"] },
    { k: "asalSekolah", l: "Asal sekolah (untuk pindahan)" }, { k: "tahunMasuk", l: "Tahun masuk" },
    { k: "status", l: "Status", t: "select", opts: ["aktif", "lulus", "pindah", "keluar"] }];

  async function siswa(main) {
    const [rombel, rows] = await Promise.all([listCol("rombel"), listCol("siswa")]);
    const rmap = Object.fromEntries(rombel.map(r => [r.id, r.nama]));
    const c = await cfg();
    const flt = { r: "", s: "aktif", q: "" };
    main.innerHTML = `<div class="top noprint"><h1>Data Siswa</h1><div class="acts"><button class="btn btn-ghost" id="imp">Impor CSV</button><button class="btn btn-ghost" id="csv">Unduh CSV</button><button class="btn" id="add">+ Tambah Siswa</button></div></div>
      <div class="acts noprint" style="margin-bottom:14px;flex-wrap:wrap">${selHTML("fr", [["", "Semua rombel"], ["-", "Tanpa rombel"], ...rombel.sort(byUrut).map(r => [r.id, r.nama])])}
      ${selHTML("fs", [["", "Semua status"], ["aktif", "Aktif"], ["lulus", "Lulus"], ["pindah", "Pindah"], ["keluar", "Keluar"]], "aktif")}
      <input id="fq" placeholder="Cari nama/NISN…" style="margin:0;width:200px"></div><div id="list"></div>`;
    const view = () => rows.filter(s => (!flt.r || (flt.r === "-" ? !s.rombelId : s.rombelId === flt.r)) && (!flt.s || (s.status || "aktif") === flt.s)
      && (!flt.q || (String(s.nama) + " " + String(s.nisn || "")).toLowerCase().includes(flt.q))).sort(byNama);
    const draw = () => {
      const v = view();
      $("#list").innerHTML = `<div class="tbl-wrap">${v.length ? `<table class="t"><thead><tr><th>No</th><th>Nama</th><th>NISN</th><th>L/P</th><th>Rombel</th><th>Status</th><th></th></tr></thead><tbody>
      ${v.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.nama)}</td><td>${esc(s.nisn || "–")}</td><td>${esc((s.jk || "")[0] || "–")}</td><td>${esc(rmap[s.rombelId] || "–")}</td><td><span class="pill ${s.status === "aktif" || !s.status ? "diterima" : "baru"}">${esc(s.status || "aktif")}</span></td>
      <td><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${esc(s.id)}">Ubah</button><button class="btn btn-ghost btn-sm" data-m="${esc(s.id)}">Mutasi</button><button class="btn btn-danger btn-sm" data-d="${esc(s.id)}">Hapus</button></div></td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="border:0">Belum ada siswa untuk filter ini.</div>`}</div><p class="muted small">${v.length} siswa</p>`;
    };
    draw();
    $("#fr").onchange = e => { flt.r = e.target.value; draw(); }; $("#fs").onchange = e => { flt.s = e.target.value; draw(); };
    $("#fq").oninput = e => { flt.q = e.target.value.trim().toLowerCase(); draw(); };

    const riwayat = (s, rid, aksi, nama) => addDoc(collection(db, "riwayat_rombel"), { siswaId: s, siswaNama: nama || "", tapel: c.tapel, rombelId: rid || "", rombelNama: rmap[rid] || "", aksi, createdAt: serverTimestamp() });
    const edit = r => {
      const fields = SF.map(f => f.k === "rombelId" ? { ...f, opts: [["", "— Belum ada —"], ...rombel.sort(byUrut).map(x => [x.id, x.nama])] } : f);
      const init = r || { status: "aktif", jk: "Laki-laki", statusMasuk: "Baru", tahunMasuk: c.tapel.slice(0, 4), rombelId: flt.r && flt.r !== "-" ? flt.r : "" };
      const m = modal(`<h3>${r ? "Ubah" : "Tambah"} Siswa</h3><form class="form" id="f-s">${fields.map(f => fieldHTML(f, init[f.k])).join("")}
        <div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelector("#f-s").onsubmit = async e => {
        e.preventDefault(); const b = e.target.querySelector("button[type=submit]"); b.disabled = true;
        try {
          const data = readForm(e.target, fields);
          if (r) await updateDoc(doc(db, "siswa", r.id), { ...data, updatedAt: serverTimestamp() });
          else {
            const ref = await addDoc(collection(db, "siswa"), { ...data, createdAt: serverTimestamp() });
            if (data.statusMasuk === "Pindahan") await addDoc(collection(db, "mutasi"), { siswaId: ref.id, nama: data.nama, jenis: "masuk", tanggal: today(), keterangan: data.asalSekolah || "", createdAt: serverTimestamp() });
            r = { id: ref.id };
          }
          if (data.rombelId && data.rombelId !== (init.rombelId || "")) await riwayat(r.id, data.rombelId, "penempatan", data.nama);
          m.remove(); toast("Tersimpan"); await siswa(main);
        } catch (err) { logErr(err); b.disabled = false; }
      };
    };
    $("#add").onclick = () => edit(null);
    $("#list").addEventListener("click", async e => {
      const be = e.target.closest("[data-e]"), bm = e.target.closest("[data-m]"), bd = e.target.closest("[data-d]");
      if (be) edit(rows.find(x => x.id === be.dataset.e));
      if (bm) {
        const s = rows.find(x => x.id === bm.dataset.m);
        const m = modal(`<h3>Mutasi Keluar</h3><p class="muted">${esc(s.nama)}</p><form class="form" id="f-mut">
          <label class="f">Jenis<select name="status"><option value="pindah">Pindah sekolah</option><option value="keluar">Keluar / berhenti</option></select></label>
          <label class="f">Tanggal<input type="date" name="tanggal" value="${today()}" required></label>
          <label class="f">Sekolah tujuan / alasan<input name="ket" maxlength="200" required></label>
          <div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan mutasi</button></div></form>`);
        m.querySelector("[data-x]").onclick = () => m.remove();
        m.querySelector("#f-mut").onsubmit = async ev => {
          ev.preventDefault(); const f = ev.target;
          try {
            await addDoc(collection(db, "mutasi"), { siswaId: s.id, nama: s.nama, jenis: "keluar", tanggal: f.tanggal.value, keterangan: f.ket.value.trim(), rombelNama: rmap[s.rombelId] || "", createdAt: serverTimestamp() });
            await updateDoc(doc(db, "siswa", s.id), { status: f.status.value, updatedAt: serverTimestamp() });
            m.remove(); toast("Mutasi dicatat"); await siswa(main);
          } catch (err) { logErr(err); }
        };
      }
      if (bd && confirm("Hapus data siswa ini? Presensi dan nilai lama tetap tersimpan. Disarankan memakai Mutasi bila siswa hanya pindah.")) {
        try { await deleteDoc(doc(db, "siswa", bd.dataset.d)); toast("Dihapus"); await siswa(main); } catch (err) { logErr(err); }
      }
    });
    $("#csv").onclick = () => downloadCsv(`siswa-${today()}.csv`, [["Nama", "NISN", "NIS", "JK", "Tempat lahir", "Tgl lahir", "Rombel", "Ayah", "Ibu", "Wali", "HP", "Alamat", "Status"]]
      .concat(view().map(s => [s.nama, s.nisn, s.nis, s.jk, s.tempatLahir, s.tglLahir, rmap[s.rombelId] || "", s.namaAyah, s.namaIbu, s.wali, s.hp, s.alamat, s.status || "aktif"])));
    $("#imp").onclick = () => {
      const m = modal(`<h3>Impor Siswa dari CSV</h3><p class="muted small">Kolom (baris pertama judul): <b>nama, nisn, nis, jk, tempatLahir, tglLahir, rombel, namaAyah, namaIbu, hp, alamat</b>. Tanggal format YYYY-MM-DD, jk = Laki-laki/Perempuan, rombel harus sama dengan nama rombel yang sudah dibuat.</p>
        <p><button class="btn btn-ghost btn-sm" id="tpl">Unduh templat</button></p><label class="f">Berkas CSV<input type="file" id="cf" accept=".csv,text/csv"></label><div id="prev" class="muted small" style="margin-top:10px"></div>
        <div class="btns"><button type="button" class="btn btn-ghost" data-x>Tutup</button><button class="btn" id="go" disabled>Impor</button></div>`);
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelector("#tpl").onclick = () => downloadCsv("templat-siswa.csv", [["nama", "nisn", "nis", "jk", "tempatLahir", "tglLahir", "rombel", "namaAyah", "namaIbu", "hp", "alamat"], ["Contoh Siswa", "0123456789", "1001", "Laki-laki", "Bengkalis", "2018-05-20", rombel[0] ? rombel[0].nama : "1A", "Ayah", "Ibu", "08123456789", "Alamat"]]);
      let parsed = [];
      m.querySelector("#cf").onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        const rr = parseCsv(await f.text()); const h = rr.shift().map(x => x.trim());
        const idx = k => h.findIndex(x => x.toLowerCase() === k.toLowerCase());
        const byName = Object.fromEntries(rombel.map(r => [String(r.nama).toLowerCase(), r.id]));
        parsed = rr.map(r => { const g = k => idx(k) >= 0 ? String(r[idx(k)] || "").trim() : ""; const rn = g("rombel");
          return { nama: g("nama"), nisn: g("nisn"), nis: g("nis"), jk: /^p/i.test(g("jk")) ? "Perempuan" : "Laki-laki", tempatLahir: g("tempatLahir"), tglLahir: g("tglLahir"), rombelId: byName[rn.toLowerCase()] || "", rombelNama: rn,
            namaAyah: g("namaAyah"), namaIbu: g("namaIbu"), wali: "", hp: g("hp"), alamat: g("alamat"), statusMasuk: "Baru", asalSekolah: "", tahunMasuk: c.tapel.slice(0, 4), status: "aktif" }; }).filter(x => x.nama);
        const bad = parsed.filter(x => x.rombelNama && !x.rombelId).length;
        m.querySelector("#prev").innerHTML = `${parsed.length} baris siap diimpor.${bad ? ` <b style="color:var(--red)">${bad} baris memakai nama rombel yang belum ada (rombel dikosongkan).</b>` : ""}`;
        m.querySelector("#go").disabled = !parsed.length;
      };
      m.querySelector("#go").onclick = async ev => {
        ev.target.disabled = true;
        try {
          for (const part of chunk(parsed, 200)) {
            const b = writeBatch(db);
            part.forEach(p => { const { rombelNama, ...d } = p; b.set(doc(collection(db, "siswa")), { ...d, createdAt: serverTimestamp() }); });
            await b.commit();
          }
          m.remove(); toast(`${parsed.length} siswa diimpor`); await siswa(main);
        } catch (err) { logErr(err); ev.target.disabled = false; }
      };
    };
  }

  /* ================= Kenaikan Kelas & Kelulusan ================= */
  async function naik(main) {
    const [rombel, rows, c] = await Promise.all([listCol("rombel"), listCol("siswa"), cfg()]);
    const rmap = Object.fromEntries(rombel.map(r => [r.id, r.nama]));
    main.innerHTML = `<div class="top"><h1>Kenaikan Kelas & Kelulusan</h1></div>
      <div class="settings-grp"><p class="muted small" style="margin-top:0">Tahun pelajaran aktif: <b>${esc(c.tapel)}</b>. Pilih rombel asal, tentukan tujuan, centang siswa, lalu proses. Setiap perpindahan dicatat di riwayat rombel.</p>
      <div class="acts" style="flex-wrap:wrap">${selHTML("ra", optRombel(rombel))}<span>→ tujuan</span>${selHTML("rt", [["", "— Pilih tujuan —"], ["LULUS", "Lulus"], ...rombel.sort(byUrut).map(r => [r.id, r.nama])])}</div>
      <div id="lst" style="margin-top:14px"></div></div>
      <div class="top" style="margin-top:26px"><h2 style="margin:0">Riwayat rombel terbaru</h2></div><div id="rw"></div>`;
    $("#ra").onchange = () => {
      const rid = $("#ra").value; const l = rows.filter(s => s.rombelId === rid && (s.status || "aktif") === "aktif").sort(byNama);
      $("#lst").innerHTML = rid ? `<div class="tbl-wrap"><table class="t"><thead><tr><th><input type="checkbox" id="all" checked style="margin:0"></th><th>Nama</th><th>NISN</th></tr></thead><tbody>${l.map(s => `<tr><td><input type="checkbox" class="ck" value="${esc(s.id)}" checked style="margin:0"></td><td>${esc(s.nama)}</td><td>${esc(s.nisn || "–")}</td></tr>`).join("")}</tbody></table></div>
        <p style="margin-top:12px"><button class="btn" id="proc" ${l.length ? "" : "disabled"}>Proses</button> <span class="muted small">Siswa yang tidak dicentang (mis. tinggal kelas) tetap di rombel asal.</span></p>` : "";
      const all = $("#all"); if (all) all.onchange = () => $$(".ck").forEach(x => x.checked = all.checked);
      const pr = $("#proc");
      if (pr) pr.onclick = async () => {
        const tujuan = $("#rt").value; const ids = $$(".ck:checked").map(x => x.value);
        if (!tujuan) return toast("Pilih tujuan terlebih dahulu", "err");
        if (!ids.length) return toast("Pilih minimal satu siswa", "err");
        if (tujuan === rid) return toast("Tujuan sama dengan rombel asal", "err");
        if (!confirm(`Proses ${ids.length} siswa ke ${tujuan === "LULUS" ? "status LULUS" : rmap[tujuan]}?`)) return;
        pr.disabled = true;
        try {
          for (const part of chunk(ids, 150)) {
            const b = writeBatch(db);
            part.forEach(id => {
              const s = rows.find(x => x.id === id);
              b.update(doc(db, "siswa", id), tujuan === "LULUS" ? { status: "lulus", rombelId: "", updatedAt: serverTimestamp() } : { rombelId: tujuan, updatedAt: serverTimestamp() });
              b.set(doc(collection(db, "riwayat_rombel")), { siswaId: id, siswaNama: s.nama, tapel: c.tapel, rombelId: tujuan === "LULUS" ? "" : tujuan, rombelNama: tujuan === "LULUS" ? "" : rmap[tujuan], dariRombel: rmap[rid] || "", aksi: tujuan === "LULUS" ? "lulus" : "naik", createdAt: serverTimestamp() });
            });
            await b.commit();
          }
          toast("Selesai diproses"); await naik(main);
        } catch (err) { logErr(err); pr.disabled = false; }
      };
    };
    const rw = (await listCol("riwayat_rombel")).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 40);
    $("#rw").innerHTML = `<div class="tbl-wrap">${rw.length ? `<table class="t"><thead><tr><th>Tanggal</th><th>Siswa</th><th>Aksi</th><th>Dari</th><th>Ke</th><th>Tapel</th></tr></thead><tbody>${rw.map(r => `<tr><td>${esc(fmtDate(r.createdAt))}</td><td>${esc(r.siswaNama)}</td><td>${esc(r.aksi)}</td><td>${esc(r.dariRombel || "–")}</td><td>${esc(r.rombelNama || (r.aksi === "lulus" ? "Lulus" : "–"))}</td><td>${esc(r.tapel)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="border:0">Belum ada riwayat.</div>`}</div>`;
  }

  /* ================= Presensi Siswa ================= */
  const ST = [["H", "Hadir"], ["S", "Sakit"], ["I", "Izin"], ["A", "Alpa"]];
  async function absen(main) {
    const [rombel, siswaAll] = await Promise.all([listCol("rombel"), listCol("siswa")]);
    main.innerHTML = `<div class="top"><h1>Presensi Siswa</h1><div class="acts" style="flex-wrap:wrap">${selHTML("ar", optRombel(rombel))}<input type="date" id="at" value="${wibToday()}" style="margin:0;width:auto"><button class="btn" id="go">Tampilkan</button></div></div><div id="out"></div>`;
    $("#go").onclick = async () => {
      const rid = $("#ar").value, tgl = $("#at").value; if (!rid || !tgl) return toast("Pilih rombel dan tanggal", "err");
      const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
      try {
        const sl = siswaAll.filter(s => s.rombelId === rid && (s.status || "aktif") === "aktif").sort(byNama);
        const ref = doc(db, "presensi_siswa", `${rid}_${tgl}`); const snap = await getDoc(ref);
        const old = snap.exists() ? snap.data() : null; const data = old ? old.data || {} : {}; const cat = old ? old.catatan || {} : {};
        const rn = (rombel.find(r => r.id === rid) || {}).nama || "";
        out.innerHTML = `<p class="muted">${old ? "Presensi sudah tersimpan; perubahan memerlukan alasan." : "Belum ada presensi untuk tanggal ini (pilihan awal: Hadir)."}</p>
          <div class="tbl-wrap">${sl.length ? `<table class="t"><thead><tr><th>No</th><th>Nama</th>${ST.map(([k, l]) => `<th>${l}</th>`).join("")}<th>Catatan</th></tr></thead><tbody>
          ${sl.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.nama)}</td>${ST.map(([k]) => `<td><input type="radio" name="st_${esc(s.id)}" value="${k}" ${(data[s.id] || "H") === k ? "checked" : ""} style="margin:0"></td>`).join("")}<td><input name="ct_${esc(s.id)}" value="${esc(cat[s.id] || "")}" maxlength="120" style="margin:0;min-width:140px"></td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="border:0">Belum ada siswa aktif di rombel ini.</div>`}</div>
          <div class="acts" style="margin-top:14px"><button class="btn btn-ghost" id="allh">Semua hadir</button><button class="btn" id="save" ${sl.length ? "" : "disabled"}>Simpan presensi</button></div>
          ${old && (old.koreksi || []).length ? `<h3 style="margin-top:22px">Riwayat koreksi</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Waktu</th><th>Siswa</th><th>Perubahan</th><th>Alasan</th></tr></thead><tbody>${old.koreksi.map(k => `<tr><td>${esc(fmtDate(k.waktu))}</td><td>${esc(k.nama)}</td><td>${esc(k.dari)} → ${esc(k.ke)}</td><td>${esc(k.alasan)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
        $("#allh").onclick = () => $$("input[type=radio][value=H]", out).forEach(x => x.checked = true);
        $("#save").onclick = async () => {
          const nd = {}, nc = {};
          sl.forEach(s => { nd[s.id] = (out.querySelector(`input[name="st_${s.id}"]:checked`) || {}).value || "H"; const t = (out.querySelector(`input[name="ct_${s.id}"]`) || {}).value.trim(); if (t) nc[s.id] = t; });
          const diffs = old ? sl.filter(s => (data[s.id] || "H") !== nd[s.id]).map(s => ({ siswaId: s.id, nama: s.nama, dari: data[s.id] || "H", ke: nd[s.id] })) : [];
          const commit = async alasan => {
            try {
              const kor = [...(old && old.koreksi || []), ...diffs.map(d => ({ ...d, alasan, waktu: new Date().toISOString() }))];
              await setDoc(ref, { rombelId: rid, rombelNama: rn, tanggal: tgl, data: nd, catatan: nc, koreksi: kor, updatedAt: serverTimestamp() });
              toast("Presensi tersimpan"); $("#go").click();
            } catch (e) { logErr(e); }
          };
          if (!diffs.length) return commit("");
          const m = modal(`<h3>Alasan koreksi</h3><p class="muted small">${diffs.length} perubahan status: ${diffs.map(d => esc(d.nama) + " (" + d.dari + "→" + d.ke + ")").join(", ")}</p><form class="form"><label class="f">Alasan <span class="req">*</span><textarea name="al" required maxlength="200" rows="3"></textarea></label><div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan koreksi</button></div></form>`);
          m.querySelector("[data-x]").onclick = () => m.remove();
          m.querySelector("form").onsubmit = ev => { ev.preventDefault(); const a = ev.target.al.value.trim(); m.remove(); commit(a); };
        };
      } catch (e) { logErr(e); out.innerHTML = ""; }
    };
  }

  /* ================= Rekap Presensi Siswa ================= */
  async function rekapSiswa(main) {
    const [rombel, siswaAll, c] = await Promise.all([listCol("rombel"), listCol("siswa"), cfg()]);
    const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    main.innerHTML = `<div class="top noprint"><h1>Rekap Presensi Siswa</h1></div><div class="acts noprint" style="flex-wrap:wrap;margin-bottom:14px">${selHTML("rr", optRombel(rombel))}
      ${selHTML("rm", [["bulan", "Bulanan"], ["semester", "Semester aktif"], ["tahun", "Tahun pelajaran aktif"]])}<input type="month" id="rb" value="${ym}" style="margin:0;width:auto"><button class="btn" id="go">Tampilkan</button></div><div id="out"></div>`;
    $("#rm").onchange = () => { $("#rb").hidden = $("#rm").value !== "bulan"; };
    $("#go").onclick = async () => {
      const rid = $("#rr").value; if (!rid) return toast("Pilih rombel", "err");
      const mode = $("#rm").value; let a, b, label;
      if (mode === "bulan") { const [y, m] = $("#rb").value.split("-").map(Number); a = `${y}-${String(m).padStart(2, "0")}-01`; b = `${y}-${String(m).padStart(2, "0")}-31`; label = `${BULAN[m - 1]} ${y}`; }
      else if (mode === "semester") { [a, b] = tapelRange(c.tapel, c.semester); label = `Semester ${c.semester} ${c.tapel}`; }
      else { [a, b] = tapelYear(c.tapel); label = `Tahun pelajaran ${c.tapel}`; }
      const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
      try {
        const recs = (await listColWhere("presensi_siswa", "rombelId", rid)).filter(r => r.tanggal >= a && r.tanggal <= b);
        const sl = siswaAll.filter(s => s.rombelId === rid && (s.status || "aktif") === "aktif").sort(byNama);
        const rows = sl.map(s => { const o = { H: 0, S: 0, I: 0, A: 0 }; recs.forEach(r => { const v = (r.data || {})[s.id]; if (v && o[v] !== undefined) o[v]++; }); const t = o.H + o.S + o.I + o.A; return { s, ...o, t, p: t ? Math.round(o.H / t * 100) : 0 }; });
        const rn = (rombel.find(r => r.id === rid) || {}).nama;
        out.innerHTML = `<h2 class="print-only">Rekap Presensi Siswa ${esc(rn)} – ${esc(label)}</h2><p class="muted noprint">${esc(rn)} · ${esc(label)} · ${recs.length} hari tercatat</p>
          <div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>No</th><th>Nama</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Hari</th><th>% Hadir</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.s.nama)}</td><td>${r.H}</td><td>${r.S}</td><td>${r.I}</td><td>${r.A}</td><td>${r.t}</td><td>${r.p}%</td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="border:0">Tidak ada siswa.</div>`}</div>
          <div class="acts noprint" style="margin-top:14px"><button class="btn btn-ghost" id="csv" ${rows.length ? "" : "disabled"}>Unduh CSV</button><button class="btn" id="prn" ${rows.length ? "" : "disabled"}>Cetak / Simpan PDF</button></div>`;
        const csv = $("#csv"); if (csv) csv.onclick = () => downloadCsv(`rekap-presensi-${rn}-${a}.csv`, [["No", "Nama", "Hadir", "Sakit", "Izin", "Alpa", "Hari", "Persen"]].concat(rows.map((r, i) => [i + 1, r.s.nama, r.H, r.S, r.I, r.A, r.t, r.p])));
        const prn = $("#prn"); if (prn) prn.onclick = () => window.print();
      } catch (e) { logErr(e); out.innerHTML = ""; }
    };
  }
  async function listColWhere(name, field, val) {
    const { query, where, getDocs } = await import("./firebase.js");
    const s = await getDocs(query(collection(db, name), where(field, "==", val)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /* ================= Nilai ================= */
  async function nilai(main) {
    const [rombel, mapel, siswaAll, c] = await Promise.all([listCol("rombel"), listCol("mapel"), listCol("siswa"), cfg()]);
    main.innerHTML = `<div class="top"><h1>Input Nilai</h1><div class="acts" style="flex-wrap:wrap">${selHTML("nr", optRombel(rombel))}${selHTML("nm", [["", "— Mata pelajaran —"], ...[...mapel].sort(byUrut).map(m => [m.id, m.nama])])}<button class="btn" id="go">Tampilkan</button></div></div>
      <p class="muted small">${esc(c.tapel)} · Semester ${esc(c.semester)} · KKM ${esc(c.kkm)} · bobot Tugas ${c.bTugas}% / UH ${c.bUH}% / UTS ${c.bUTS}% / UAS ${c.bUAS}% (ubah di Pengaturan Akademik)</p><div id="out"></div>`;
    $("#go").onclick = async () => {
      const rid = $("#nr").value, mid = $("#nm").value; if (!rid || !mid) return toast("Pilih rombel dan mata pelajaran", "err");
      const sl = siswaAll.filter(s => s.rombelId === rid && (s.status || "aktif") === "aktif").sort(byNama);
      const ref = doc(db, "nilai", `${KEY(c.tapel)}_${c.semester}_${rid}_${mid}`); const snap = await getDoc(ref); const data = snap.exists() ? snap.data().data || {} : {};
      const inp = (s, k) => `<input type="number" min="0" max="100" step="0.1" data-s="${esc(s.id)}" data-k="${k}" value="${esc(data[s.id] && data[s.id][k] !== undefined ? data[s.id][k] : "")}" style="margin:0;width:80px">`;
      $("#out").innerHTML = `<div class="tbl-wrap">${sl.length ? `<table class="t"><thead><tr><th>No</th><th>Nama</th><th>Tugas</th><th>UH</th><th>UTS</th><th>UAS</th><th>Akhir</th><th>Ket.</th></tr></thead><tbody>
        ${sl.map((s, i) => `<tr data-r="${esc(s.id)}"><td>${i + 1}</td><td>${esc(s.nama)}</td><td>${inp(s, "tugas")}</td><td>${inp(s, "uh")}</td><td>${inp(s, "uts")}</td><td>${inp(s, "uas")}</td><td class="ak"><b>–</b></td><td class="kt">–</td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="border:0">Belum ada siswa aktif.</div>`}</div>
        <p style="margin-top:14px"><button class="btn" id="save" ${sl.length ? "" : "disabled"}>Simpan nilai</button></p>`;
      const collect = () => { const o = {}; $$("tr[data-r]", $("#out")).forEach(tr => { const e = {}; $$("input", tr).forEach(i => { const v = num(i.value); if (v !== null) e[i.dataset.k] = Math.min(100, Math.max(0, v)); }); if (Object.keys(e).length) o[tr.dataset.r] = e; }); return o; };
      const calc = () => $$("tr[data-r]", $("#out")).forEach(tr => { const e = {}; $$("input", tr).forEach(i => { const v = num(i.value); if (v !== null) e[i.dataset.k] = v; }); const a = akhir(e, c); tr.querySelector(".ak").innerHTML = `<b>${a === null ? "–" : a}</b>`; const kt = tr.querySelector(".kt"); kt.textContent = a === null ? "–" : (a >= c.kkm ? "Tuntas" : "Belum tuntas"); kt.style.color = a !== null && a < c.kkm ? "var(--red)" : ""; });
      $("#out").addEventListener("input", calc); calc();
      const sv = $("#save"); if (sv) sv.onclick = async () => {
        try { await setDoc(ref, { tapel: c.tapel, semester: c.semester, rombelId: rid, mapelId: mid, data: collect(), updatedAt: serverTimestamp() }); toast("Nilai tersimpan"); } catch (e) { logErr(e); }
      };
    };
  }

  /* ================= Rapor ================= */
  const SIKAP = ["Sangat Baik", "Baik", "Cukup", "Perlu Bimbingan"];
  const RS = { draf: "Draf", diperiksa: "Diperiksa wali kelas", publikasi: "Dipublikasikan" };
  async function rapor(main) {
    const [rombel, c] = await Promise.all([listCol("rombel"), cfg()]);
    main.innerHTML = `<div class="top"><h1>Rapor</h1><div class="acts" style="flex-wrap:wrap">${selHTML("pr", optRombel(rombel))}<button class="btn" id="go">Tampilkan</button></div></div>
      <p class="muted small">${esc(c.tapel)} · Semester ${esc(c.semester)}. Alur: <b>Draf</b> → <b>Diperiksa wali kelas</b> → <b>Dipublikasikan</b>. Nilai diambil dari menu Input Nilai; presensi dari Presensi Siswa.</p><div id="out"></div>`;
    $("#go").onclick = () => show($("#pr").value);
    async function show(rid) {
      if (!rid) return toast("Pilih rombel", "err");
      const out = $("#out"); out.innerHTML = `<div class="loading">Memuat…</div>`;
      try {
        const [siswaAll, mapel, rapAll] = await Promise.all([listCol("siswa"), listCol("mapel"), listColWhere("rapor", "rombelId", rid)]);
        const sl = siswaAll.filter(s => s.rombelId === rid && (s.status || "aktif") === "aktif").sort(byNama);
        const rn = (rombel.find(r => r.id === rid) || {}).nama;
        const rmap = Object.fromEntries(rapAll.filter(r => r.tapel === c.tapel && r.semester === c.semester).map(r => [r.siswaId, r]));
        out.innerHTML = `<div class="tbl-wrap">${sl.length ? `<table class="t"><thead><tr><th>No</th><th>Nama</th><th>Status rapor</th><th></th></tr></thead><tbody>${sl.map((s, i) => { const r = rmap[s.id]; return `<tr><td>${i + 1}</td><td>${esc(s.nama)}</td>
          <td>${r ? `<span class="pill ${r.status === "publikasi" ? "diterima" : "baru"}">${esc(RS[r.status])}</span>` : `<span class="muted">Belum dibuat</span>`}</td>
          <td><div class="acts">${r ? `<button class="btn btn-ghost btn-sm" data-ed="${esc(s.id)}">Ubah</button>${r.status === "draf" ? `<button class="btn btn-ghost btn-sm" data-st="diperiksa" data-id="${esc(s.id)}">Tandai diperiksa</button>` : ""}${r.status === "diperiksa" ? `<button class="btn btn-sm" data-st="publikasi" data-id="${esc(s.id)}">Publikasikan</button>` : ""}${r.status !== "draf" ? `<button class="btn btn-ghost btn-sm" data-st="draf" data-id="${esc(s.id)}">Kembalikan ke draf</button>` : ""}<button class="btn btn-ghost btn-sm" data-pr="${esc(s.id)}">Cetak</button>` : ""}</div></td></tr>`; }).join("")}</tbody></table>` : `<div class="empty" style="border:0">Belum ada siswa aktif.</div>`}</div>
          <p style="margin-top:14px"><button class="btn" id="gen" ${sl.length ? "" : "disabled"}>Buat / perbarui draf semua siswa</button> <span class="muted small">Rapor yang sudah diperiksa/dipublikasikan tidak ditimpa.</span></p>`;
        const gen = $("#gen");
        if (gen) gen.onclick = async () => {
          gen.disabled = true;
          try {
            const nv = (await listColWhere("nilai", "rombelId", rid)).filter(x => x.tapel === c.tapel && x.semester === c.semester);
            const [a, b] = tapelRange(c.tapel, c.semester);
            const pres = (await listColWhere("presensi_siswa", "rombelId", rid)).filter(x => x.tanggal >= a && x.tanggal <= b);
            const mp = [...mapel].sort(byUrut);
            for (const part of chunk(sl.filter(s => !rmap[s.id] || rmap[s.id].status === "draf"), 150)) {
              const bt = writeBatch(db);
              part.forEach(s => {
                const nilaiRows = mp.map(m => { const d = nv.find(x => x.mapelId === m.id); const v = d ? akhir((d.data || {})[s.id], c) : null; return { mapelId: m.id, nama: m.nama, kelompok: m.kelompok || "", akhir: v, predikat: predikat(v) }; }).filter(x => x.akhir !== null);
                const ab = { S: 0, I: 0, A: 0 }; pres.forEach(p => { const v = (p.data || {})[s.id]; if (ab[v] !== undefined) ab[v]++; });
                const old = rmap[s.id] || {};
                bt.set(doc(db, "rapor", `${KEY(c.tapel)}_${c.semester}_${s.id}`), {
                  siswaId: s.id, nama: s.nama, nisn: s.nisn || "", nis: s.nis || "", rombelId: rid, rombelNama: rn, tapel: c.tapel, semester: c.semester, status: "draf", nilai: nilaiRows,
                  sikap: old.sikap || "Baik", catatan: old.catatan || "", sakit: ab.S, izin: ab.I, alpa: ab.A, updatedAt: serverTimestamp()
                });
              });
              await bt.commit();
            }
            toast("Draf rapor dibuat"); show(rid);
          } catch (e) { logErr(e); gen.disabled = false; }
        };
        out.onclick = async e => {
          const st = e.target.closest("[data-st]"), ed = e.target.closest("[data-ed]"), pr = e.target.closest("[data-pr]");
          if (st) {
            const r = rmap[st.dataset.id];
            if (st.dataset.st === "publikasi" && !(r.nilai || []).length && !confirm("Rapor ini belum memiliki nilai. Tetap publikasikan?")) return;
            try { await updateDoc(doc(db, "rapor", `${KEY(c.tapel)}_${c.semester}_${st.dataset.id}`), { status: st.dataset.st, updatedAt: serverTimestamp() }); show(rid); } catch (err) { logErr(err); }
          }
          if (ed) {
            const r = rmap[ed.dataset.ed];
            const m = modal(`<h3>Ubah Rapor – ${esc(r.nama)}</h3><form class="form" id="f-r"><label class="f">Sikap<select name="sikap">${SIKAP.map(x => `<option ${r.sikap === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
              <div class="row"><label class="f">Sakit (hari)<input type="number" name="sakit" min="0" value="${esc(r.sakit || 0)}"></label><label class="f">Izin (hari)<input type="number" name="izin" min="0" value="${esc(r.izin || 0)}"></label></div>
              <label class="f">Alpa (hari)<input type="number" name="alpa" min="0" value="${esc(r.alpa || 0)}"></label>
              <label class="f">Catatan wali kelas<textarea name="catatan" rows="4" maxlength="500">${esc(r.catatan || "")}</textarea></label>
              <div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
            m.querySelector("[data-x]").onclick = () => m.remove();
            m.querySelector("#f-r").onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
              try { await updateDoc(doc(db, "rapor", `${KEY(c.tapel)}_${c.semester}_${ed.dataset.ed}`), { sikap: f.sikap.value, sakit: Number(f.sakit.value) || 0, izin: Number(f.izin.value) || 0, alpa: Number(f.alpa.value) || 0, catatan: f.catatan.value.trim(), updatedAt: serverTimestamp() }); m.remove(); show(rid); } catch (err) { logErr(err); } };
          }
          if (pr) cetakRapor(rmap[pr.dataset.pr], siswaAll.find(x => x.id === pr.dataset.pr), c);
        };
      } catch (e) { logErr(e); out.innerHTML = ""; }
    }
  }
  function cetakRapor(r, s, c) {
    const w = window.open("", "_blank"); if (!w) return toast("Izinkan pop-up untuk mencetak rapor", "err");
    const rows = (r.nilai || []).map((n, i) => `<tr><td>${i + 1}</td><td>${esc(n.nama)}</td><td style="text-align:center">${n.akhir}</td><td style="text-align:center">${esc(n.predikat)}</td><td style="text-align:center">${n.akhir >= c.kkm ? "Tuntas" : "Belum tuntas"}</td></tr>`).join("");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Rapor ${esc(r.nama)}</title><style>body{font:13px/1.5 Arial,sans-serif;margin:28px;color:#111}h2,h3{text-align:center;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #444;padding:5px 8px}th{background:#eee}.id td{border:0;padding:2px 6px}.sg{display:flex;justify-content:space-between;margin-top:38px;text-align:center}.sg div{width:40%}</style>
      <h2>LAPORAN HASIL BELAJAR (RAPOR)</h2><h3>MI BAHRUL ULUM</h3><hr>
      <table class="id"><tr><td>Nama</td><td>: ${esc(r.nama)}</td><td>Kelas</td><td>: ${esc(r.rombelNama)}</td></tr><tr><td>NISN / NIS</td><td>: ${esc(r.nisn || "-")} / ${esc(r.nis || "-")}</td><td>Semester</td><td>: ${esc(r.semester)}</td></tr><tr><td></td><td></td><td>Tahun pelajaran</td><td>: ${esc(r.tapel)}</td></tr></table>
      <table><thead><tr><th>No</th><th>Mata Pelajaran</th><th>Nilai Akhir</th><th>Predikat</th><th>Keterangan</th></tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center">Belum ada nilai</td></tr>`}</tbody></table>
      <table style="width:50%"><tr><th colspan="2">Ketidakhadiran</th></tr><tr><td>Sakit</td><td>${r.sakit || 0} hari</td></tr><tr><td>Izin</td><td>${r.izin || 0} hari</td></tr><tr><td>Tanpa keterangan</td><td>${r.alpa || 0} hari</td></tr></table>
      <p><b>Sikap:</b> ${esc(r.sikap || "-")}</p><p><b>Catatan wali kelas:</b><br>${esc(r.catatan || "-")}</p>
      <div class="sg"><div>Orang tua/wali<br><br><br><br>( ........................ )</div><div>${esc(c.tempat)}, ${esc(fmtDate(today()))}<br>Kepala Madrasah<br><br><br><br><u>${esc(c.kepala || "........................")}</u><br>${c.nipKepala ? "NIP. " + esc(c.nipKepala) : ""}</div></div>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  /* ================= Keuangan ================= */
  const KF = [
    { k: "tanggal", l: "Tanggal", t: "date", req: 1 }, { k: "jenis", l: "Jenis", t: "select", opts: ["Penerimaan", "Pengeluaran"] },
    { k: "kategori", l: "Kategori (mis. BOS, Operasional, ATK)", req: 1 }, { k: "uraian", l: "Uraian", req: 1 }, { k: "jumlah", l: "Jumlah (Rp)", t: "number", req: 1 },
    { k: "bukti", l: "Bukti transaksi (foto/nota, opsional)", t: "image", w: 900, q: .7, lim: 120000 }];
  async function kas(main) {
    const rows = (await listCol("kas")).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    const now = new Date(); const ym0 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    main.innerHTML = `<div class="top noprint"><h1>Buku Kas</h1><div class="acts"><button class="btn" id="add">+ Transaksi</button></div></div>
      <div class="acts noprint" style="margin-bottom:14px"><input type="month" id="bm" value="${ym0}" style="margin:0;width:auto"><button class="btn btn-ghost" id="semua">Semua periode</button></div><div id="out"></div>`;
    let ym = ym0;
    const draw = () => {
      const sign = r => (r.jenis === "Penerimaan" ? 1 : -1) * (Number(r.jumlah) || 0);
      const awal = ym ? rows.filter(r => String(r.tanggal).slice(0, 7) < ym).reduce((s, r) => s + sign(r), 0) : 0;
      const v = rows.filter(r => !ym || String(r.tanggal).slice(0, 7) === ym);
      let saldo = awal, tin = 0, tout = 0;
      const body = v.map(r => { const j = Number(r.jumlah) || 0; if (r.jenis === "Penerimaan") tin += j; else tout += j; saldo += sign(r);
        return `<tr><td>${esc(fmtDate(r.tanggal))}</td><td>${esc(r.uraian)}</td><td>${esc(r.kategori)}</td><td style="text-align:right">${r.jenis === "Penerimaan" ? rp(j) : ""}</td><td style="text-align:right">${r.jenis === "Pengeluaran" ? rp(j) : ""}</td><td style="text-align:right">${rp(saldo)}</td>
        <td class="noprint">${safeUrl(r.bukti) ? `<a href="${esc(safeUrl(r.bukti))}" target="_blank" rel="noopener"><img src="${esc(safeUrl(r.bukti))}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover"></a>` : "–"}</td>
        <td class="noprint"><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${esc(r.id)}">Ubah</button><button class="btn btn-danger btn-sm" data-d="${esc(r.id)}">Hapus</button></div></td></tr>`; }).join("");
      $("#out").innerHTML = `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div class="kpi"><b style="font-size:1.4rem">${rp(awal)}</b><span>Saldo awal</span></div><div class="kpi"><b style="font-size:1.4rem">${rp(tin)}</b><span>Penerimaan</span></div><div class="kpi"><b style="font-size:1.4rem">${rp(tout)}</b><span>Pengeluaran</span></div><div class="kpi"><b style="font-size:1.4rem">${rp(saldo)}</b><span>Saldo akhir</span></div></div>
        <h2 class="print-only">Buku Kas MI Bahrul Ulum – ${ym ? esc(BULAN[+ym.slice(5) - 1] + " " + ym.slice(0, 4)) : "Semua periode"}</h2>
        <div class="tbl-wrap">${v.length ? `<table class="t"><thead><tr><th>Tanggal</th><th>Uraian</th><th>Kategori</th><th>Penerimaan</th><th>Pengeluaran</th><th>Saldo</th><th class="noprint">Bukti</th><th class="noprint"></th></tr></thead><tbody>${body}</tbody></table>` : `<div class="empty" style="border:0">Belum ada transaksi pada periode ini.</div>`}</div>
        <div class="acts noprint" style="margin-top:14px"><button class="btn btn-ghost" id="csv" ${v.length ? "" : "disabled"}>Unduh CSV</button><button class="btn" id="prn" ${v.length ? "" : "disabled"}>Cetak / Simpan PDF</button></div>`;
      const csv = $("#csv"); if (csv) csv.onclick = () => { let s = awal; downloadCsv(`buku-kas-${ym || "semua"}.csv`, [["Tanggal", "Uraian", "Kategori", "Penerimaan", "Pengeluaran", "Saldo"]].concat(v.map(r => { s += sign(r); return [r.tanggal, r.uraian, r.kategori, r.jenis === "Penerimaan" ? r.jumlah : "", r.jenis === "Pengeluaran" ? r.jumlah : "", s]; }))); };
      const prn = $("#prn"); if (prn) prn.onclick = () => window.print();
    };
    draw();
    $("#bm").onchange = e => { ym = e.target.value; draw(); }; $("#semua").onclick = () => { ym = ""; draw(); };
    const edit = r => {
      const m = modal(`<h3>${r ? "Ubah" : "Tambah"} Transaksi</h3><form class="form" id="f-k">${KF.map(f => fieldHTML(f, r ? r[f.k] : { tanggal: today(), jenis: "Pengeluaran" }[f.k])).join("")}<div class="btns"><button type="button" class="btn btn-ghost" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelector("#f-k").onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector("button[type=submit]"); b.disabled = true;
        try { const d = readForm(e.target, KF); if (!(d.jumlah > 0)) throw new Error("Jumlah harus lebih dari 0"); if (r) await updateDoc(doc(db, "kas", r.id), { ...d, updatedAt: serverTimestamp() }); else await addDoc(collection(db, "kas"), { ...d, createdAt: serverTimestamp() }); m.remove(); toast("Tersimpan"); await kas(main); }
        catch (err) { logErr(err); b.disabled = false; } };
    };
    $("#add").onclick = () => edit(null);
    $("#out").addEventListener("click", async e => {
      const be = e.target.closest("[data-e]"), bd = e.target.closest("[data-d]");
      if (be) edit(rows.find(x => x.id === be.dataset.e));
      if (bd && confirm("Hapus transaksi ini?")) { try { await deleteDoc(doc(db, "kas", bd.dataset.d)); toast("Dihapus"); await kas(main); } catch (err) { logErr(err); } }
    });
  }

  async function realisasi(main) {
    const [ang, kasAll, c] = await Promise.all([listCol("anggaran"), listCol("kas"), cfg()]);
    main.innerHTML = `<div class="top noprint"><h1>Realisasi Anggaran</h1><div class="acts"><input id="tp" value="${esc(c.tapel)}" style="margin:0;width:130px" aria-label="Tahun pelajaran"><button class="btn" id="go">Tampilkan</button></div></div><div id="out"></div>`;
    const draw = () => {
      const tp = $("#tp").value.trim(); const [a, b] = tapelYear(tp);
      const A = ang.filter(x => x.tapel === tp); const K = kasAll.filter(x => x.tanggal >= a && x.tanggal <= b);
      const jenisOf = x => x.jenis === "Penerimaan" ? "Penerimaan" : "Pengeluaran";
      const keys = new Map();
      A.forEach(x => keys.set(jenisOf(x) + "|" + x.kategori, { jenis: jenisOf(x), kat: x.kategori, ang: 0, real: 0 }));
      A.forEach(x => keys.get(jenisOf(x) + "|" + x.kategori).ang += Number(x.jumlah) || 0);
      K.forEach(x => { const k = x.jenis + "|" + x.kategori; if (!keys.has(k)) keys.set(k, { jenis: x.jenis, kat: x.kategori, ang: 0, real: 0 }); keys.get(k).real += Number(x.jumlah) || 0; });
      const rows = [...keys.values()].sort((p, q) => p.jenis.localeCompare(q.jenis) || p.kat.localeCompare(q.kat));
      $("#out").innerHTML = `<h2 class="print-only">Realisasi Anggaran MI Bahrul Ulum – ${esc(tp)}</h2><div class="tbl-wrap">${rows.length ? `<table class="t"><thead><tr><th>Jenis</th><th>Kategori</th><th>Anggaran</th><th>Realisasi</th><th>Sisa</th><th>%</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.jenis)}</td><td>${esc(r.kat)}</td><td style="text-align:right">${rp(r.ang)}</td><td style="text-align:right">${rp(r.real)}</td><td style="text-align:right;${r.jenis === "Pengeluaran" && r.real > r.ang ? "color:var(--red);font-weight:700" : ""}">${rp(r.ang - r.real)}</td><td>${r.ang ? Math.round(r.real / r.ang * 100) + "%" : "–"}</td></tr>`).join("")}</tbody></table>` : `<div class="empty" style="border:0">Belum ada anggaran atau transaksi untuk tahun pelajaran ini. Isi menu Anggaran dan Buku Kas.</div>`}</div>
        <p class="muted small">Realisasi dihitung dari Buku Kas (Jul–Jun) dengan jenis dan kategori yang sama dengan anggaran. Kategori tanpa anggaran tetap ditampilkan (merah bila pengeluaran melebihi anggaran).</p>
        <div class="acts noprint"><button class="btn btn-ghost" id="csv" ${rows.length ? "" : "disabled"}>Unduh CSV</button><button class="btn" id="prn" ${rows.length ? "" : "disabled"}>Cetak / Simpan PDF</button></div>`;
      const csv = $("#csv"); if (csv) csv.onclick = () => downloadCsv(`realisasi-${KEY(tp)}.csv`, [["Jenis", "Kategori", "Anggaran", "Realisasi", "Sisa"]].concat(rows.map(r => [r.jenis, r.kat, r.ang, r.real, r.ang - r.real])));
      const prn = $("#prn"); if (prn) prn.onclick = () => window.print();
    };
    $("#go").onclick = draw; draw();
  }

  return { akad, siswa, naik, absen, rekapSiswa, nilai, rapor, kas, realisasi };
}
