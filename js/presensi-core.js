// Logika murni presensi (tanpa Firebase) agar mudah diuji. Zona waktu: WIB (Asia/Jakarta, UTC+7).
export const DEFAULT_PRESENSI = {
  aktif: true, jamMasuk: "07:00", toleransi: 15, jamPulang: "13:00",
  hariKerja: "1,2,3,4,5,6", libur: "", lat: "", lng: "", radius: 100, wajibSelfie: true
};

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

/** Pecah waktu menjadi komponen WIB: {date:'YYYY-MM-DD', time:'HH:MM', hm:menit sejak 00:00} */
export function wib(d = new Date()) {
  const o = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}`, hm: (+o.hour) * 60 + (+o.minute) };
}
export const toDate = v => (v && v.toDate) ? v.toDate() : (v ? new Date(v) : null);
export const hhmm = v => { const d = toDate(v); return d ? wib(d).time : "–"; };
export const toMin = s => { const [h, m] = String(s || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
/** Tanggal+jam WIB -> Date */
export const fromWib = (tanggal, jam) => new Date(`${tanggal}T${jam}:00+07:00`);

/** Jarak dua koordinat dalam meter (rumus haversine) */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const parseHari = s => new Set(String(s || "").split(/[,\s]+/).map(Number).filter(n => n >= 1 && n <= 7));
export const parseLibur = s => new Set(String(s || "").split(/[\s,;]+/).filter(x => /^\d{4}-\d{2}-\d{2}/.test(x)).map(x => x.slice(0, 10)));
/** 1=Senin ... 7=Minggu untuk string tanggal YYYY-MM-DD */
export function hariKe(tanggal) {
  const [y, m, d] = tanggal.split("-").map(Number);
  const g = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return g === 0 ? 7 : g;
}
export function daysOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}
export const isLate = (waktu, cfg) => wib(toDate(waktu)).hm > toMin(cfg.jamMasuk) + (Number(cfg.toleransi) || 0);

/**
 * Rekap bulanan.
 * pegawai: [{id,nama,jabatan,mulai,aktif}], recs: Map "uid_tanggal" -> dokumen presensi, now: Date
 * Alpa = hari kerja (bukan libur, sejak tanggal mulai, sampai hari ini) tanpa catatan.
 * Hari ini baru dihitung alpa setelah jam pulang lewat.
 */
export function rekapBulan(ym, pegawai, recs, cfg, now = new Date()) {
  const hk = parseHari(cfg.hariKerja), libur = parseLibur(cfg.libur), nw = wib(now);
  const days = daysOfMonth(ym);
  const workdays = days.filter(d => hk.has(hariKe(d)) && !libur.has(d) &&
    (d < nw.date || (d === nw.date && nw.hm > toMin(cfg.jamPulang))));
  return pegawai.map(p => {
    const r = { id: p.id, nama: p.nama, jabatan: p.jabatan || "", hadir: 0, terlambat: 0, izin: 0, sakit: 0, dinas: 0, alpa: 0, tanpaPulang: 0, hariKerja: 0, detail: [] };
    const mulai = p.mulai || "0000-00-00";
    for (const d of days) {
      const rec = recs.get(`${p.id}_${d}`);
      const wajib = workdays.includes(d) && d >= mulai;
      if (wajib) r.hariKerja++;
      if (rec) {
        if (rec.status === "hadir") {
          r.hadir++;
          const late = rec.masuk && rec.masuk.waktu && isLate(rec.masuk.waktu, cfg);
          if (late) r.terlambat++;
          if (!rec.pulang && d < nw.date) r.tanpaPulang++;
          r.detail.push({ tanggal: d, status: late ? "terlambat" : "hadir", masuk: hhmm(rec.masuk && rec.masuk.waktu), pulang: hhmm(rec.pulang && rec.pulang.waktu), ket: rec.ket || "", rec });
        } else if (["izin", "sakit", "dinas"].includes(rec.status)) {
          r[rec.status]++;
          r.detail.push({ tanggal: d, status: rec.status, masuk: "–", pulang: "–", ket: rec.ket || "", rec });
        }
      } else if (wajib) {
        r.alpa++;
        r.detail.push({ tanggal: d, status: "alpa", masuk: "–", pulang: "–", ket: "", rec: null });
      }
    }
    r.persen = r.hariKerja ? Math.round(((r.hadir + r.dinas) / r.hariKerja) * 100) : 0;
    return r;
  });
}
