export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Hanya izinkan URL http(s) atau gambar data: */
export function safeUrl(u) {
  u = String(u || "").trim();
  return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(u) ? u : "";
}

/** Teks multi-baris -> paragraf aman */
export const nl2p = t => String(t || "").split(/\n{2,}|\r\n\r\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

/** Teks multi-baris -> array baris tidak kosong */
export const lines = t => String(t || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
export function fmtDate(v) {
  if (!v) return "";
  let d;
  if (typeof v === "string") d = new Date(v.length <= 10 ? v + "T00:00:00" : v);
  else if (v.toDate) d = v.toDate();
  else d = new Date(v);
  if (isNaN(d)) return "";
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}
export const today = () => new Date().toISOString().slice(0, 10);

export function toast(msg, type = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/** Kompres gambar di browser -> data URL JPEG (agar muat di Firestore tanpa Firebase Storage).
 *  limit = batas panjang string data URL (karakter); dokumen Firestore maks 1 MB. */
export function compressImage(file, maxW = 1000, quality = 0.75, limit = 300000) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("File harus berupa gambar"));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = Math.min(img.width, maxW), q = quality, out = "";
      for (let i = 0; i < 8; i++) {
        const c = document.createElement("canvas");
        c.width = Math.round(w);
        c.height = Math.round(img.height * (w / img.width));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q);
        if (out.length <= limit) return resolve(out);
        if (q > 0.45) q -= 0.1; else w *= 0.8;
      }
      reject(new Error("Gambar terlalu besar, pilih gambar yang lebih kecil"));
    };
    img.onerror = () => reject(new Error("Gambar tidak dapat dibaca"));
    img.src = url;
  });
}
