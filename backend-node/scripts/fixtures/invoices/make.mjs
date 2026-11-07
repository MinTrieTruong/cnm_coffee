// Dựng ảnh hoá đơn mẫu (HTML → PNG bằng Edge headless) + đáp án JSON cạnh ảnh:
//   node scripts/fixtures/invoices/make.mjs
// Cần playwright-core (dùng bản trong tests/qa). Ảnh khớp đơn mua mẫu của scripts/seedInvoiceDemo.ts.
import { createRequire } from "module";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../../tests/qa/package.json"));
const { chromium } = require("playwright-core");

const SUP = { name: "CÔNG TY TNHH THỰC PHẨM MINH PHÁT", addr: "12 Nguyễn Trãi, P.2, Q.5, TP.HCM", tax: "0312 456 789" };
const vnd = (n) => n.toLocaleString("vi-VN");

/** Hoá đơn in: rows = [tên, đvt, sl, đơn giá, hsd?, lô?] */
function printed({ no, date, rows, discount = 0, note = "" }) {
  const total = rows.reduce((s, r) => s + r[2] * r[3], 0) - discount;
  return `
  <div class="inv">
    <div class="head"><div><b>${SUP.name}</b><br>${SUP.addr}<br>MST: ${SUP.tax}</div><div class="r">HOÁ ĐƠN BÁN HÀNG<br><span>Số: <b>${no}</b></span><br><span>Ngày: ${date}</span></div></div>
    <div class="to">Khách hàng: <b>TD COFFEE - CHI NHÁNH 1</b> · 114 Dương Quảng Hàm, Gò Vấp</div>
    <table><thead><tr><th>STT</th><th>Tên hàng hoá</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>HSD / Lô</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td><td class="n">${vnd(r[3])}</td><td class="n">${vnd(r[2] * r[3])}</td><td>${[r[4], r[5] ? `Lô ${r[5]}` : ""].filter(Boolean).join(" · ")}</td></tr>`).join("")}</tbody></table>
    ${discount ? `<div class="sum">Chiết khấu: -${vnd(discount)}</div>` : ""}
    <div class="sum">TỔNG CỘNG: <b>${vnd(total)} đ</b></div>
    ${note ? `<div class="note">${note}</div>` : ""}
    <div class="sign"><div>Người giao hàng</div><div>Người nhận hàng</div></div>
  </div>`;
}

/** Phiếu giao hàng viết tay */
function handwritten({ no, date, rows }) {
  const total = rows.reduce((s, r) => s + r[2] * r[3], 0);
  return `
  <div class="inv hand">
    <div class="ht">PHIẾU GIAO HÀNG &nbsp; số ${no}</div>
    <div>Minh Phát — giao cho TD Coffee &nbsp;&nbsp; ngày ${date}</div>
    <table><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="n">${r[2]} ${r[1]}</td><td class="n">x ${vnd(r[3])}</td><td class="n">= ${vnd(r[2] * r[3])}</td></tr>`).join("")}</tbody></table>
    <div class="sum">Tổng: ${vnd(total)}đ</div>
  </div>`;
}

const CSS = `
  body { margin: 0; background: #ddd; font-family: "Times New Roman", serif; }
  .inv { width: 820px; margin: 0; padding: 28px 32px; background: #fff; color: #111; font-size: 15px; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .head .r { text-align: right; font-size: 20px; font-weight: bold; } .head .r span { font-size: 14px; font-weight: normal; }
  .to { margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #333; padding: 6px 7px; } th { background: #eee; }
  td.n { text-align: right; white-space: nowrap; }
  .sum { text-align: right; margin-top: 10px; font-size: 17px; } .note { margin-top: 8px; font-style: italic; }
  .sign { display: flex; justify-content: space-around; margin-top: 40px; height: 60px; font-weight: bold; }
  .hand { font-family: "Ink Free", "Segoe Print", "Segoe Script", cursive; background: #fbf7e9; transform: rotate(-1.2deg); font-size: 19px; color: #1d2a6b; }
  .hand .ht { font-size: 24px; margin-bottom: 6px; } .hand td { border: 0; border-bottom: 1px dashed #99a; padding: 9px 6px; }
  .blur { filter: blur(5.5px) contrast(0.75); }
`;

// Hạn dùng tương lai (hôm nay ~ 07/11/2026); cận hạn < 30 ngày
const cases = [
  {
    file: "inv1-chuan",
    html: printed({ no: "MP-001245", date: "06/11/2026", rows: [
      ["Sữa tươi thanh trùng 1L", "hộp", 48, 36000, "HSD 20/11/2026", "ST1106"],
      ["Sữa đặc Ngôi Sao 380g", "lon", 24, 35000, "HSD 15/09/2027", "SD2210"],
      ["Kem béo thực vật Rich's 1L", "hộp", 12, 92000, "HSD 10/05/2027"],
      ["Đường cát trắng 1kg", "bịch", 20, 23000],
      ["Nước cốt dừa 400ml", "lon", 24, 21000, "HSD 01/08/2027"],
    ] }),
    answer: { readable: true, invoiceNo: "MP-001245", lines: {
      "Sữa Tươi": { receivedQty: 48, expiryDate: "2026-11-20" }, "Sữa Đặc": { receivedQty: 24, expiryDate: "2027-09-15" },
      "Kem Béo": { receivedQty: 12, expiryDate: "2027-05-10" }, "Đường Cát": { receivedQty: 20, expiryDate: null }, "Nước Cốt Dừa": { receivedQty: 24, expiryDate: "2027-08-01" },
    }, flags: ["NEAR_EXPIRY:Sữa Tươi"] },
  },
  {
    file: "inv2-quy-doi-thung",
    html: printed({ no: "MP-001302", date: "07/11/2026", rows: [
      ["Sữa tươi TT 1L (thùng 24 hộp)", "thùng", 2, 864000, "HSD 05/01/2027"],
      ["Sữa đặc Ngôi Sao (thùng 48 lon)", "thùng", 0.5, 1680000],
    ], note: "Quy cách: sữa tươi 24 hộp/thùng, sữa đặc 48 lon/thùng (giao nửa thùng)." }),
    answer: { readable: true, invoiceNo: "MP-001302", lines: { "Sữa Tươi": { receivedQty: 48, expiryDate: "2027-01-05" }, "Sữa Đặc": { receivedQty: 24, expiryDate: null } }, flags: [] },
  },
  {
    file: "inv3-gia-khac-giao-thieu",
    html: printed({ no: "MP-001377", date: "07/11/2026", rows: [
      ["Kem béo thực vật Rich's 1L", "hộp", 12, 99000, "HSD 12/06/2027"],
      ["Đường cát trắng 1kg", "bịch", 15, 23000],
    ] }),
    answer: { readable: true, invoiceNo: "MP-001377", lines: { "Kem Béo": { receivedQty: 12, expiryDate: "2027-06-12" }, "Đường Cát": { receivedQty: 15, expiryDate: null } }, flags: ["PRICE:Kem Béo", "SHORT:Đường Cát"] },
  },
  {
    file: "inv4-ngoai-don-mua",
    html: printed({ no: "MP-001401", date: "07/11/2026", rows: [
      ["Nước cốt dừa 400ml", "lon", 24, 21000, "HSD 01/10/2027"],
      ["Bột cacao nguyên chất 500g", "gói", 5, 85000],
      ["Đường cát trắng 1kg", "bịch", 20, 23000],
    ] }),
    answer: { readable: true, invoiceNo: "MP-001401", lines: { "Nước Cốt Dừa": { receivedQty: 24, expiryDate: "2027-10-01" }, "Đường Cát": { receivedQty: 20, expiryDate: null } }, unmatched: ["cacao"], flags: [] },
  },
  {
    file: "inv5-viet-tay",
    html: handwritten({ no: "0457", date: "7/11/2026", rows: [["Sữa tươi 1L", "hộp", 24, 36000], ["Sữa đặc", "lon", 24, 35000], ["Đường", "bịch", 10, 23000]] }),
    answer: { readable: true, invoiceNo: "0457", lines: { "Sữa Tươi": { receivedQty: 24, expiryDate: null }, "Sữa Đặc": { receivedQty: 24, expiryDate: null }, "Đường Cát": { receivedQty: 10, expiryDate: null } }, flags: [] },
  },
  {
    file: "inv6-anh-mo",
    blur: true,
    html: printed({ no: "MP-001455", date: "07/11/2026", rows: [["Sữa tươi thanh trùng 1L", "hộp", 48, 36000], ["Kem béo thực vật Rich's 1L", "hộp", 12, 92000]] }),
    answer: { readable: false, lines: {}, flags: [] },
  },
  {
    file: "inv7-can-han",
    html: printed({ no: "MP-001502", date: "07/11/2026", rows: [["Kem béo thực vật Rich's 1L", "hộp", 12, 92000, "HSD 22/11/2026", "KB0911"], ["Sữa đặc Ngôi Sao 380g", "lon", 24, 35000, "HSD 30/04/2027"]] }),
    answer: { readable: true, invoiceNo: "MP-001502", lines: { "Kem Béo": { receivedQty: 12, expiryDate: "2026-11-22" }, "Sữa Đặc": { receivedQty: 24, expiryDate: "2027-04-30" } }, flags: ["NEAR_EXPIRY:Kem Béo"] },
  },
];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1.4 });
for (const c of cases) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><div style="padding:20px;display:inline-block" class="${c.blur ? "blur" : ""}">${c.html}</div>`);
  const png = await page.locator("body > div").screenshot({ path: path.join(here, `${c.file}.png`), type: "png" });
  // Độ nét như giao diện đo (frontend lib/imageSharpness.ts) — gửi kèm khi đọc, giống luồng thật
  const sharpness = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = Math.min(1000, img.width);
    const H = Math.round((img.height * W) / img.width);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let s = 0;
    let s2 = 0;
    let n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let xx = 1; xx < W - 1; xx++) {
        const i = y * W + xx;
        const l = g[i - 1] + g[i + 1] + g[i - W] + g[i + W] - 4 * g[i];
        s += l;
        s2 += l * l;
        n++;
      }
    }
    return Math.round(s2 / n - (s / n) ** 2);
  }, `data:image/png;base64,${png.toString("base64")}`);
  writeFileSync(path.join(here, `${c.file}.json`), JSON.stringify({ ...c.answer, sharpness }, null, 2) + "\n");
  console.log("✓", c.file);
}
await browser.close();
