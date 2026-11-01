/**
 * B17/B19 POS & ca két, A7 voucher, A12 mini game, C29 giao dịch đồng thời.
 */
import { call, sql, sql1, check, group, save, newCustomer, staffLogin, short } from "./lib.mjs";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const line = (productId = 2, quantity = 1) => ({ productId, quantity, size: "M" });
const takeaway = async (token, productId = 2, quantity = 1, storeId = 1) =>
  (await call("POST", "/api/orders", { token, body: { orderType: "Takeaway", storeId, lines: [line(productId, quantity)] } })).body;
const status = (id) => sql1(`SELECT Status s FROM Orders WHERE Order_ID=${id}`)?.s;

/** Đóng ca đang mở (nếu có) rồi mở ca mới với tiền đầu ca 0 */
async function freshShift(token) {
  const cur = await call("GET", "/api/shifts/open", { token });
  if (cur.body?.shift?.id || cur.body?.id) {
    const close = await call("POST", "/api/shifts/close", { token, body: { actualCash: 0, note: "QA đóng ca cũ" } });
    if (close.status !== 200) throw new Error("Không đóng được ca cũ " + short(close.body));
  }
  return call("POST", "/api/shifts/open", { token, body: { startingCash: 0 } });
}

const cashier = await staffLogin("cashier");
const cashierB = await staffLogin("TN_Ha");
const cashier2 = await staffLogin("cashier2");
const admin = await staffLogin("admin");
const owner = await staffLogin("owner");

/* ───────── POS thanh toán ───────── */
group("B17 POS thanh toán");
{
  const s = await freshShift(cashier);
  check("Thu ngân mở ca (đầu ca 0đ)", s.status === 201, `status ${s.status} ${short(s.body)}`);
  const dupOpen = await call("POST", "/api/shifts/open", { token: cashier, body: { startingCash: 0 } });
  check("Mở ca lần 2 khi đang có ca → 409", dupOpen.status === 409, `status ${dupOpen.status}`);
  const waiter = await staffLogin("waiter");
  const wOpen = await call("POST", "/api/shifts/open", { token: waiter, body: {} });
  check("Phục vụ không mở được ca thu ngân", wOpen.status === 403, `status ${wOpen.status}`);

  const c = await newCustomer("POS");
  const o = await takeaway(c.token);
  const less = await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o.id, method: "Cash", cashGiven: 1000 } });
  check("Tiền mặt khách đưa < tổng bill bị từ chối", less.status === 400, `status ${less.status} change=${less.body?.change} → đơn ${status(o.id)}`);

  const o2 = await takeaway(c.token);
  const weird = await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o2.id, method: "MienPhi" } });
  check("Phương thức thanh toán lạ bị từ chối", weird.status === 400, `status ${weird.status} → đơn ${status(o2.id)}`);

  const o3 = await takeaway(c.token);
  const cross = await call("POST", "/api/pos/pay", { token: cashier2, body: { orderId: o3.id, method: "Transfer" } });
  check("Thu ngân CN2 không thanh toán được đơn CN1", cross.status === 400 || cross.status === 403, `status ${cross.status}`);
  const bills2 = await call("GET", "/api/pos/bills", { token: cashier2 });
  const leaks = JSON.stringify(bills2.body).includes(`"id":${o.id},`);
  check("Lịch sử bill CN2 không chứa đơn CN1", !leaks, `status ${bills2.status}`);

  // Hai thu ngân bấm thanh toán cùng một đơn
  await freshShift(cashierB);
  const o4 = await takeaway(c.token, 2, 2);
  const [p1, p2] = await Promise.all([
    call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o4.id, method: "Transfer" } }),
    call("POST", "/api/pos/pay", { token: cashierB, body: { orderId: o4.id, method: "Transfer" } }),
  ]);
  const pays = Number(sql1(`SELECT COUNT(*) n FROM Payments WHERE Order_ID=${o4.id}`)?.n);
  check("2 thu ngân thanh toán cùng đơn cùng lúc → chỉ 1 Payment", pays === 1, `mã ${p1.status}/${p2.status}, Payments=${pays}`);
  const ptx = Number(sql1(`SELECT COUNT(*) n FROM Point_Transactions WHERE Order_ID=${o4.id}`)?.n ?? 0);
  check("…và điểm chỉ cộng 1 lần", ptx <= 1, `Point_Transactions=${ptx}`);
}

/* ───────── Ca & két: tiền dự kiến ───────── */
group("B19 Ca & két — tiền dự kiến = đầu ca + TM thu + thu khác − chi");
{
  const s = await freshShift(cashier);
  const c = await newCustomer("Két");
  let cashSales = 0;
  for (const q of [1, 2]) {
    const o = await takeaway(c.token, 1, q);
    const p = await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o.id, method: "Cash", cashGiven: 500000 } });
    if (p.status === 200) cashSales += p.body.totalAmount;
  }
  const oT = await takeaway(c.token, 3, 1);
  await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: oT.id, method: "Transfer" } });
  const inE = await call("POST", "/api/cash/entries", { token: cashier, body: { type: "IN", category: "OTHER_INCOME", amount: 50000, fund: "DRAWER", description: "Thu khác QA" } });
  check("Phiếu thu khác vào ngăn kéo", inE.status === 201, `status ${inE.status} ${short(inE.body)}`);
  const noPhoto = await call("POST", "/api/cash/entries", { token: cashier, body: { type: "OUT", category: "SUPPLIES", amount: 20000, fund: "DRAWER", description: "Mua đá" } });
  check("Phiếu chi của thu ngân bắt buộc ảnh chứng từ", noPhoto.status === 400, `status ${noPhoto.status}`);
  const outE = await call("POST", "/api/cash/entries", { token: cashier, body: { type: "OUT", category: "SUPPLIES", amount: 20000, fund: "DRAWER", description: "Mua đá", photo: PNG } });
  check("Phiếu chi có ảnh", outE.status === 201, `status ${outE.status} ${short(outE.body)}`);
  const neg = await call("POST", "/api/cash/entries", { token: cashier, body: { type: "IN", category: "OTHER_INCOME", amount: -5000, fund: "DRAWER", description: "âm" } });
  check("Phiếu số tiền âm bị từ chối", neg.status === 400, `status ${neg.status}`);
  const over = await call("POST", "/api/cash/entries", { token: cashier, body: { type: "OUT", category: "SUPPLIES", amount: 150000000, fund: "DRAWER", description: "Chi vượt quỹ", photo: PNG } });
  check("Chi vượt số dư ngăn kéo bị chặn hoặc chờ duyệt", over.status === 400 || over.body?.status === "PENDING", `status ${over.status} ${over.body?.status ?? ""}`);
  const rent = await call("POST", "/api/cash/entries", { token: cashier, body: { type: "OUT", category: "RENT", amount: 1000, fund: "DRAWER", description: "x", photo: PNG } });
  check("Thu ngân không lập được phiếu chi chỉ dành cho quản lý (RENT)", rent.status === 403, `status ${rent.status}`);

  const expected = 0 + cashSales + 50000 - 20000;
  const wrong = await call("POST", "/api/shifts/close", { token: cashier, body: { actualCash: expected + 1000 } });
  check("Đếm lệch mà không ghi lý do → yêu cầu đếm lại", wrong.status === 400 && wrong.body?.code === "COUNT_MISMATCH", `status ${wrong.status}`);
  check("Thông báo lệch cho thu ngân không lộ số tiền dự kiến (đếm mù)", !JSON.stringify(wrong.body).includes(String(expected)), short(wrong.body));
  const close = await call("POST", "/api/shifts/close", { token: cashier, body: { actualCash: expected } });
  check(`Kết ca: dự kiến ${expected} = 0 + TM ${cashSales} + 50.000 − 20.000, lệch 0`, close.status === 200 && close.body?.drawer?.expectedCash === expected && close.body?.differenceAmt === 0, `status ${close.status} drawer=${short(close.body?.drawer)}`);
  const audit = sql1(`SELECT COUNT(*) n FROM Audit_Logs WHERE Action IN ('SHIFT_OPEN','SHIFT_CLOSE','CASH_ENTRY')`);
  check("Mở/đóng ca và phiếu thu chi có ghi nhật ký", Number(audit?.n) > 0, `${audit?.n} dòng`);
}

/* ───────── Voucher ───────── */
group("A7 Voucher");
const mkVoucher = async (patch = {}) => {
  const code = "QA" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const end = new Date(Date.now() + 7 * 864e5).toISOString();
  const r = await call("POST", "/api/vouchers/admin", { token: owner, body: { code, discountValue: 10000, minBillValue: 0, endDate: end, quantity: 100, voucherType: "public", storeIds: [1], ...patch } });
  return { code, r };
};
async function payWithVoucher(cust, code, productId = 2, qty = 1) {
  const o = await takeaway(cust.token, productId, qty);
  const rq = await call("POST", `/api/orders/${o.id}/request-payment`, { token: cust.token, body: { voucherCode: code } });
  const pay = rq.status === 200 ? await call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o.id, method: "Transfer" } }) : null;
  return { o, rq, pay };
}
{
  await freshShift(cashier);
  const neg = await mkVoucher({ discountValue: -50000 });
  check("Tạo voucher giá trị âm bị từ chối", neg.r.status === 400, `status ${neg.r.status}`);
  const backwards = await mkVoucher({ startDate: new Date(Date.now() + 9 * 864e5).toISOString() });
  check("Tạo voucher ngày bắt đầu sau ngày kết thúc bị từ chối", backwards.r.status === 400, `status ${backwards.r.status}`);

  const c = await newCustomer("Voucher");
  const minV = await mkVoucher({ minBillValue: 500000 });
  const rMin = await payWithVoucher(c, minV.code);
  check("Đơn dưới giá trị tối thiểu không dùng được voucher", rMin.rq.status === 400, `status ${rMin.rq.status} ${short(rMin.rq.body)}`);
  const exp = await mkVoucher({ endDate: new Date(Date.now() - 864e5).toISOString(), startDate: new Date(Date.now() - 3 * 864e5).toISOString() });
  const rExp = await payWithVoucher(c, exp.code);
  check("Voucher hết hạn bị từ chối", rExp.rq.status === 400, `status ${rExp.rq.status} ${short(rExp.rq.body)}`);
  const cn2 = await mkVoucher({ storeIds: [2] });
  const rCn2 = await payWithVoucher(c, cn2.code);
  check("Voucher chỉ áp dụng CN2 không dùng được ở CN1", rCn2.rq.status === 400, `status ${rCn2.rq.status} ${short(rCn2.rq.body)}`);
  const h = new Date().getHours();
  const gold = await mkVoucher({ goldHourStart: (h + 2) % 24, goldHourEnd: (h + 3) % 24 || 24 });
  const rGold = await payWithVoucher(c, gold.code);
  check("Voucher giờ vàng ngoài khung giờ bị từ chối", rGold.rq.status === 400, `status ${rGold.rq.status} ${short(rGold.rq.body)}`);

  const ok = await mkVoucher();
  const first = await payWithVoucher(c, ok.code);
  check("Dùng voucher hợp lệ: thanh toán trừ đúng 10.000đ", first.pay?.status === 200 && first.pay.body.discountAmt >= 10000, `rq ${first.rq.status}, pay ${first.pay?.status} discount ${first.pay?.body?.discountAmt}`);
  const second = await payWithVoucher(c, ok.code);
  check("Cùng khách dùng lại voucher lần 2 bị chặn", second.rq.status === 400, `rq ${second.rq.status} ${short(second.rq.body)} pay ${second.pay?.status}`);

  // Hết lượt: voucher còn 1 lượt, 2 khách cùng giữ mã rồi thu ngân thanh toán cả hai
  const one = await mkVoucher({ quantity: 1 });
  const [k1, k2] = [await newCustomer("V1"), await newCustomer("V2")];
  const oA = await takeaway(k1.token);
  const oB = await takeaway(k2.token);
  const [rqA, rqB] = await Promise.all([
    call("POST", `/api/orders/${oA.id}/request-payment`, { token: k1.token, body: { voucherCode: one.code } }),
    call("POST", `/api/orders/${oB.id}/request-payment`, { token: k2.token, body: { voucherCode: one.code } }),
  ]);
  await Promise.all([oA, oB].map((o) => call("POST", "/api/pos/pay", { token: cashier, body: { orderId: o.id, method: "Transfer" } })));
  const used = sql1(`SELECT Used_Count u, Quantity q FROM Vouchers WHERE Code='${one.code}'`);
  check("Voucher còn 1 lượt, 2 khách dùng cùng lúc → chỉ 1 lượt bị dùng", Number(used?.u) <= Number(used?.q), `giữ mã ${rqA.status}/${rqB.status}, Used_Count=${used?.u}/${used?.q}`);
}

/* ───────── Mini game ───────── */
group("A12 Mini game (vòng quay) — không vượt số lượng giải");
{
  const camp = sql1(`SELECT Campaign_ID id FROM Game_Campaigns ORDER BY Campaign_ID LIMIT 1`) ?? sql1(`SELECT id FROM Game_Campaigns LIMIT 1`);
  const cid = camp?.id;
  if (!cid) check("Có chiến dịch mini game mẫu", null, "bỏ qua: không có chiến dịch");
  else {
    // Giải hiếm còn đúng 1 cái, tỉ lệ rất cao để 10 người quay cùng lúc
    const prizes = sql(`SELECT * FROM Game_Prizes WHERE Campaign_ID=${cid} AND Is_Active=1 ORDER BY Prize_ID`);
    const target = prizes.find((p) => p.Kind === "POINTS") ?? prizes[0];
    const pid = target.Prize_ID;
    sql(`UPDATE Game_Prizes SET Weight=0 WHERE Campaign_ID=${cid}; UPDATE Game_Prizes SET Weight=100, Quantity=Won_Count+1, Daily_Limit=NULL WHERE Prize_ID=${pid}; UPDATE Game_Campaigns SET Max_Plays_Per_Day=50 WHERE Campaign_ID=${cid}`);
    const none = prizes.find((p) => p.Kind === "NONE");
    const players = [];
    for (let i = 0; i < 10; i++) {
      const k = await newCustomer("Quay " + i);
      sql(`INSERT INTO Game_Tickets (Campaign_ID, Customer_ID, Source, Status, Expires_At, Created_At) VALUES (${cid}, ${k.id}, 'ADMIN', 'UNUSED', DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())`);
      players.push(k);
    }
    const before = Number(sql1(`SELECT Won_Count w FROM Game_Prizes WHERE Prize_ID=${pid}`)?.w);
    const plays = await Promise.all(players.map((k) => call("POST", `/api/games/${cid}/play`, { token: k.token, body: { storeId: 1 } })));
    const after = sql1(`SELECT Won_Count w, Quantity q FROM Game_Prizes WHERE Prize_ID=${pid}`);
    const won = plays.filter((p) => p.body?.prize?.id === Number(pid)).length;
    check("10 người quay cùng lúc giải còn 1 → chỉ 1 người trúng", won === 1 && Number(after.w) <= Number(after.q), `trúng ${won}, Won_Count ${before}→${after.w}/${after.q}, mã: ${[...new Set(plays.map((p) => p.status))].join(",")}`);
    check("Hết giải thì rơi về ô không trúng (không lỗi)", plays.every((p) => p.status === 200), plays.filter((p) => p.status !== 200).map((p) => short(p.body)).join(" | ") || (none ? "có ô NONE" : ""));
    const k = players[0];
    const noTicket = await call("POST", `/api/games/${cid}/play`, { token: k.token, body: { storeId: 1 } });
    check("Hết lượt thì không quay được", noTicket.status === 400, `status ${noTicket.status} ${short(noTicket.body)}`);
    const anon = await call("POST", `/api/games/${cid}/play`, { body: { storeId: 1 } });
    check("Chưa đăng nhập không quay được", anon.status === 401 || anon.status === 403, `status ${anon.status}`);
  }
}

save("04-pos-cash-voucher-games.json");
