/**
 * B20 Kho (trừ theo định mức, âm kho, tự ẩn món), B25 Báo cáo (đối chiếu CSDL), C30 hiệu năng sơ bộ.
 */
import { call, sql, sql1, check, group, save, newCustomer, staffLogin } from "./lib.mjs";

const cashier = await staffLogin("cashier");
const admin = await staffLogin("admin");
const owner = await staffLogin("owner");
const sh = await call("GET", "/api/shifts/open", { token: cashier });
if (!sh.body?.shift) await call("POST", "/api/shifts/open", { token: cashier, body: { startingCash: 0 } });
const c = await newCustomer("kho");
async function sell(productId, quantity) {
  const o = (await call("POST", "/api/orders", { token: c.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId, quantity, size: "M" }] } })).body;
  const p = await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o.id, method: "Transfer_QR" } });
  return { o, p };
}
const stock = (itemId) => Number(sql1(`SELECT Stock_Qty q FROM Store_Inventory WHERE Store_ID=1 AND Item_ID=${itemId}`)?.q);

if (group("B20 Kho — trừ theo định mức, âm kho, tự ẩn món")) {
  const pid = 2;
  const formula = sql(`SELECT Item_ID, Qty_Size_M, Qty_Per_Unit FROM Product_Formulas WHERE Product_ID=${pid}`);
  if (!formula.length) check("Món có định mức", null, "bỏ qua: món 2 chưa có định mức");
  else {
    const before = Object.fromEntries(formula.map((f) => [f.Item_ID, stock(f.Item_ID)]));
    const { o, p } = await sell(pid, 2);
    const after = Object.fromEntries(formula.map((f) => [f.Item_ID, stock(f.Item_ID)]));
    const dropped = formula.every((f) => after[f.Item_ID] < before[f.Item_ID]);
    check("Bán 2 ly trừ tồn mọi nguyên liệu trong định mức", p.status === 200 && dropped, formula.map((f) => `#${f.Item_ID}: ${before[f.Item_ID]}→${after[f.Item_ID]}`).join(", "));
    const tx = Number(sql1(`SELECT COUNT(*) n FROM Inventory_Transactions WHERE Ref_ID='ORDER-${o.id}' AND Tx_Type='SELL'`)?.n);
    check("Có phiếu xuất kho SELL tham chiếu đơn", tx === formula.length, `${tx} dòng`);

    // Hết một nguyên liệu → món tự ẩn / chặn đặt; không để tồn âm
    const item = formula[0].Item_ID;
    const keep = stock(item);
    sql(`UPDATE Store_Inventory SET Stock_Qty=0 WHERE Store_ID=1 AND Item_ID=${item}`);
    const menu = await call("GET", "/api/menu?store=1");
    const prod = (menu.body.products ?? []).find((x) => x.id === pid);
    check("Hết nguyên liệu → món hiện 'hết hàng' trên menu", !prod || prod.outOfStock === true, `outOfStock=${prod?.outOfStock}`);
    const order = await call("POST", "/api/orders", { token: c.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId: pid, quantity: 1, size: "M" }] } });
    check("Hết nguyên liệu → không đặt được món", order.status === 400, `status ${order.status}`);
    if (order.status === 201) await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: order.body.id, method: "Transfer_QR" } });
    check("Tồn kho không bị âm sau khi bán lúc hết nguyên liệu", stock(item) >= 0, `tồn #${item} = ${stock(item)}`);
    sql(`UPDATE Store_Inventory SET Stock_Qty=${keep} WHERE Store_ID=1 AND Item_ID=${item}`);
    // Đặt lúc còn đủ, tới lúc thanh toán đã hết → trừ kho không xuống âm
    const late = (await call("POST", "/api/orders", { token: c.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId: pid, quantity: 1, size: "M" }] } })).body;
    sql(`UPDATE Store_Inventory SET Stock_Qty=0 WHERE Store_ID=1 AND Item_ID=${item}`);
    const latePay = await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: late.id, method: "Transfer_QR" } });
    check("Hết nguyên liệu giữa lúc đặt và thanh toán: vẫn thanh toán, tồn kho không âm", latePay.status === 200 && stock(item) >= 0, `pay ${latePay.status}, tồn #${item} = ${stock(item)}`);
    sql(`UPDATE Store_Inventory SET Stock_Qty=${keep} WHERE Store_ID=1 AND Item_ID=${item}`);
  }
}

if (group("B25 Báo cáo — đối chiếu CSDL")) {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const rep = await call("GET", `/api/admin/reports/revenue?from=${today}&to=${today}`, { token: owner, headers: { "X-Store-Id": "1" } });
  const db = sql1(`SELECT COALESCE(SUM(p.Amount),0) s FROM Payments p JOIN Orders o ON o.Order_ID=p.Order_ID
    WHERE o.Store_ID=1 AND o.Status='Paid' AND p.Method<>'Points' AND DATE(CONVERT_TZ(p.Payment_Time,'+00:00','+07:00'))='${today}'`);
  const ship = sql1(`SELECT COALESCE(SUM(t.f),0) s FROM (SELECT DISTINCT o.Order_ID, o.Shipping_Fee f FROM Payments p JOIN Orders o ON o.Order_ID=p.Order_ID
    WHERE o.Store_ID=1 AND o.Status='Paid' AND p.Amount>0 AND DATE(CONVERT_TZ(p.Payment_Time,'+00:00','+07:00'))='${today}') t`);
  const expect = Number(db.s) - Number(ship.s);
  check("Doanh thu hôm nay trên báo cáo = SUM(Payments) − phí ship trong CSDL", rep.status === 200 && rep.body.total === expect, `báo cáo ${rep.body?.total} · CSDL ${expect} (status ${rep.status})`);
  const all = await call("GET", `/api/admin/reports/revenue?from=${today}&to=${today}`, { token: owner });
  const s2 = await call("GET", `/api/admin/reports/revenue?from=${today}&to=${today}`, { token: owner, headers: { "X-Store-Id": "2" } });
  check("Tổng chuỗi = CN1 + CN2", all.body?.total === (rep.body?.total ?? 0) + (s2.body?.total ?? 0), `${all.body?.total} vs ${rep.body?.total}+${s2.body?.total}`);
  const a2 = await call("GET", `/api/admin/reports/revenue?from=${today}&to=${today}`, { token: await staffLogin("admin2"), headers: { "X-Store-Id": "1" } });
  check("Quản lý CN2 gửi X-Store-Id=1 vẫn chỉ thấy CN2", a2.body?.total === s2.body?.total, `${a2.body?.total} (CN2 ${s2.body?.total})`);
  const bad = await call("GET", `/api/admin/reports/revenue?from=khong-phai-ngay&to=2026-13-45`, { token: admin });
  check("Ngày báo cáo sai định dạng không gây 500", bad.status !== 500, `status ${bad.status}`);
  const exp = await call("GET", `/api/admin/reports/orders/export?from=${today}&to=${today}`, { token: admin });
  check("Xuất Excel đơn hàng chạy được", exp.status === 200, `status ${exp.status} ${exp.headers?.get?.("content-type") ?? ""}`);
}

if (group("C30 Hiệu năng sơ bộ (> 1s là chậm)")) {
  const slow = [];
  const eps = [
    ["GET", "/api/menu?storeId=1", null], ["GET", "/api/homepage?storeId=1", null], ["GET", "/api/site-info", null],
    ["GET", "/api/pos/tables", cashier], ["GET", "/api/pos/pending-orders", cashier], ["GET", "/api/pos/bills", cashier],
    ["GET", "/api/kds/queue", await staffLogin("kitchen")], ["GET", "/api/admin/reports/dashboard", admin],
    ["GET", "/api/admin/reports/profit", admin], ["GET", "/api/admin/reports/top-products", admin],
    ["GET", "/api/admin/customers", admin], ["GET", "/api/admin/staff", admin], ["GET", "/api/admin/inventory", admin],
    ["GET", "/api/cash/overview", admin], ["GET", "/api/admin/audit-logs", owner], ["GET", "/api/reports/stores-compare", owner],
  ];
  for (const [m, p, t] of eps) {
    const r = await call(m, p, { token: t ?? undefined });
    if (r.ms > 1000 || r.status >= 500) slow.push(`${p} ${r.ms}ms (${r.status})`);
  }
  check(`${eps.length} API chính phản hồi < 1s với dữ liệu seed`, slow.length === 0, slow.join(" · ") || "tất cả < 1s");
}

save("07-inventory-reports-perf.json");
