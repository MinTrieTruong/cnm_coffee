/**
 * A. Khách hàng: đăng ký / đăng nhập / hồ sơ, đặt món (tại bàn, mang về, giao hàng), ân hạn & hủy,
 * định giá phía server, phí ship, thanh toán (SePay/VNPay/MoMo giả lập), điểm, đánh giá, IDOR.
 */
import { call, sql, sql1, check, group, save, newCustomer, customerLogin, staffLogin, short } from "./lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (productId = 1, quantity = 1, extra = {}) => ({ productId, quantity, size: "M", ...extra });
const orderRow = (id) => sql1(`SELECT Status status, Total_Amount total, Points_Used pu, Points_Earned pe FROM Orders WHERE Order_ID=${id}`);
const points = (cid) => Number(sql1(`SELECT Points p FROM Customers WHERE Customer_ID=${cid}`)?.p ?? 0);
const freeTable = () => Number(sql1(`SELECT Table_ID id FROM Tables WHERE Store_ID=1 AND Status='Empty' ORDER BY Table_ID LIMIT 1`)?.id);

/* ───────── 1. Đăng ký / đăng nhập ───────── */
group("A1 Đăng ký / đăng nhập / hồ sơ");
{
  const bad = await call("POST", "/api/auth/register", { body: { phone: "abc-khong-phai-sdt", password: "123456" } });
  check("Đăng ký với SĐT sai định dạng bị từ chối", bad.status === 400, `status ${bad.status}`);
  const shortPw = await call("POST", "/api/auth/register", { body: { phone: "0911111111", password: "123" } });
  check("Mật khẩu < 6 ký tự bị từ chối", shortPw.status === 400, `status ${shortPw.status}`);

  const a = await newCustomer("Nguyễn Thị Ánh");
  check("Đăng ký SĐT hợp lệ, tên tiếng Việt có dấu", a.reg.status === 201 && !!a.token, `status ${a.reg.status}`);
  const dup = await call("POST", "/api/auth/register", { body: { phone: a.phone, password: "123456" } });
  check("Đăng ký trùng SĐT → 409", dup.status === 409, `status ${dup.status}`);
  const wrong = await call("POST", "/api/auth/login", { body: { login: a.phone, password: "sai-mat-khau" } });
  check("Đăng nhập sai mật khẩu → 401", wrong.status === 401, `status ${wrong.status}`);
  const me = await call("GET", "/api/auth/me", { token: a.token });
  check("GET /auth/me trả đúng khách, không lộ hash", me.status === 200 && !JSON.stringify(me.body).includes("passwordHash"), short(me.body));

  const prof = await call("PATCH", "/api/customer/profile", { token: a.token, body: { fullName: "Ánh QA <b>đậm</b>" } });
  check("PATCH /customer/profile không trả passwordHash", prof.status === 200 && !("passwordHash" in (prof.body ?? {})), `keys: ${Object.keys(prof.body ?? {}).join(",")}`);
  const b = await newCustomer("B");
  const stealPhone = await call("PATCH", "/api/customer/profile", { token: b.token, body: { phone: a.phone } });
  check("Đổi SĐT trùng khách khác bị chặn (409/400)", stealPhone.status === 409 || stealPhone.status === 400, `status ${stealPhone.status} ${short(stealPhone.body)}`);
  const badPhone = await call("PATCH", "/api/customer/profile", { token: b.token, body: { phone: "xyz" } });
  check("Đổi SĐT sai định dạng bị chặn", badPhone.status === 400, `status ${badPhone.status}`);
  const badDob = await call("PATCH", "/api/customer/profile", { token: b.token, body: { dob: "khong-phai-ngay" } });
  check("Ngày sinh sai định dạng → 400 (không 500)", badDob.status === 400, `status ${badDob.status}`);
  const pw = await call("PATCH", "/api/customer/password", { token: b.token, body: { currentPassword: "123456", newPassword: "654321" } });
  check("Đổi mật khẩu đúng mật khẩu cũ", pw.status === 200, `status ${pw.status}`);
  const curPhone = sql1(`SELECT Phone p FROM Customers WHERE Customer_ID=${b.id}`)?.p;
  check("Đăng nhập bằng mật khẩu mới", !!(await customerLogin(curPhone, "654321")), `SĐT hiện tại "${curPhone}"`);

  // Đăng ký đồng thời: ID khách cấp bằng max+1
  const base = String(Date.now()).slice(-7);
  const many = await Promise.all(Array.from({ length: 6 }, (_, i) => call("POST", "/api/auth/register", { body: { phone: `08${base}${i}`, password: "123456", fullName: `Song song ${i}` } })));
  const okN = many.filter((r) => r.status === 201).length;
  check("6 khách đăng ký cùng lúc (SĐT khác nhau) đều thành công", okN === 6, `thành công ${okN}/6, mã: ${many.map((r) => r.status).join(",")}`);
}

/* ───────── 2-4. Đặt món, định giá, ân hạn, hủy ───────── */
group("A4 Đặt món tại bàn / mang về, định giá server, ân hạn & hủy");
const c = await newCustomer("Đặt món");
{
  const t = freeTable();
  const tamper = await call("POST", "/api/orders", { token: c.token, body: { tableId: t, lines: [line(1, 2, { unitPrice: 1, price: 1 })] } });
  const expectSub = 2 * Math.round(25000 * 0.85);
  check("Giá do server tính (gửi unitPrice=1 bị bỏ qua)", tamper.status === 201 && Number(tamper.body.subTotal) === expectSub, `subTotal ${tamper.body?.subTotal} (mong đợi ${expectSub})`);
  check("Đơn tại bàn vào trạng thái Pending_Grace", tamper.body?.status === "Pending_Grace", tamper.body?.status);
  check("graceSeconds trả về khớp hằng số GRACE_MS (15s)", tamper.body?.graceSeconds === 15, String(tamper.body?.graceSeconds));
  const cancel = await call("POST", `/api/orders/${tamper.body.id}/cancel`, { token: c.token, body: {} });
  check("Hủy trong thời gian ân hạn", cancel.status === 200 && orderRow(tamper.body.id)?.status === "Cancelled", `status ${cancel.status}`);

  for (const [q, label] of [[0, "0"], [-1, "âm"], [1.5, "lẻ"], [100000, "rất lớn"]]) {
    const r = await call("POST", "/api/orders", { token: c.token, body: { tableId: freeTable(), lines: [line(1, q)] } });
    check(`Số lượng ${label} (${q}) bị từ chối`, r.status === 400, `status ${r.status}`);
  }
  const empty = await call("POST", "/api/orders", { token: c.token, body: { tableId: freeTable(), lines: [] } });
  check("Giỏ rỗng bị từ chối", empty.status === 400, `status ${empty.status}`);
  const ghost = await call("POST", "/api/orders", { token: c.token, body: { tableId: freeTable(), lines: [line(999999, 1)] } });
  check("Món không tồn tại bị từ chối", ghost.status === 400, `status ${ghost.status}`);
  const noTable = await call("POST", "/api/orders", { token: c.token, body: { lines: [line()] } });
  check("Đơn tại quán thiếu bàn bị từ chối", noTable.status === 400, `status ${noTable.status}`);

  // Hết ân hạn → Confirmed; khách hủy sau ân hạn phải bị chặn
  const o2 = await call("POST", "/api/orders", { token: c.token, body: { tableId: freeTable(), lines: [line(2, 1)] } });
  await sleep(19000);
  const st = orderRow(o2.body.id)?.status;
  check("Sau 15s ân hạn đơn chuyển Confirmed (worker)", st === "Confirmed", st);
  const late = await call("POST", `/api/orders/${o2.body.id}/cancel`, { token: c.token, body: {} });
  check("Khách hủy SAU ân hạn (đơn đã vào bếp) bị chặn", late.status === 400 || late.status === 403, `status ${late.status} → ${orderRow(o2.body.id)?.status}`);

  // Người khác hủy đơn của khách
  const other = await newCustomer("Kẻ lạ");
  const o3 = await call("POST", "/api/orders", { token: c.token, body: { tableId: freeTable(), lines: [line(3, 1)] } });
  const foreign = await call("POST", `/api/orders/${o3.body.id}/cancel`, { token: other.token, body: {} });
  check("Khách khác không hủy được đơn người khác", foreign.status === 403, `status ${foreign.status}`);
  const anonCancel = await call("POST", `/api/orders/${o3.body.id}/cancel`, { body: { tableId: o3.body.tableId } });
  check("Người lạ biết số bàn không hủy được đơn của khách đã đăng nhập", anonCancel.status === 403, `status ${anonCancel.status}`);
  const staff2 = await staffLogin("cashier2");
  const crossStore = await call("POST", `/api/orders/${o3.body.id}/cancel`, { token: staff2, body: {} });
  check("Thu ngân chi nhánh 2 không hủy được đơn chi nhánh 1", crossStore.status === 403, `status ${crossStore.status}`);
}

/* ───────── 5. Giao hàng / phí ship ───────── */
group("A5 Giao hàng, phí ship theo khoảng cách");
{
  const anon = await call("POST", "/api/orders", { body: { orderType: "Delivery", storeId: 1, deliveryAddress: "x", customerLat: 10.78, customerLng: 106.7, lines: [line()] } });
  check("Đặt giao hàng khi chưa đăng nhập → 401", anon.status === 401, `status ${anon.status}`);
  const near = await call("POST", "/api/orders", { token: c.token, body: { orderType: "Delivery", storeId: 1, deliveryAddress: "Gần quán, Q1", customerLat: 10.7775, customerLng: 106.7015, lines: [line()] } });
  check("Trong 3km miễn phí ship", near.status === 201 && Number(near.body.shippingFee) === 0, `fee ${near.body?.shippingFee}`);
  const mid = await call("POST", "/api/orders", { token: c.token, body: { orderType: "Delivery", storeId: 1, deliveryAddress: "Thủ Đức", customerLat: 10.8231, customerLng: 106.7297, lines: [line()], shippingFee: 0 } });
  check("Phí ship do server tính (gửi shippingFee=0 bị bỏ qua, ~6km > 0đ)", mid.status === 201 && Number(mid.body.shippingFee) > 0, `fee ${mid.body?.shippingFee}`);
  const far = await call("POST", "/api/orders", { token: c.token, body: { orderType: "Delivery", storeId: 1, deliveryAddress: "Hà Nội", customerLat: 21.0285, customerLng: 105.8542, lines: [line()] } });
  check("Địa chỉ ngoài bán kính giao tối đa (Hà Nội ~1.100km) bị từ chối", far.status === 400, `status ${far.status} fee ${far.body?.shippingFee}`);
  const cod = await call("POST", `/api/orders/${near.body.id}/request-payment`, { token: c.token, body: {} });
  check("Đơn giao hàng không cho trả tiền mặt (bắt trả trước)", cod.status === 400, `status ${cod.status}`);
}

/* ───────── 6. Thanh toán giả lập ───────── */
group("A6 Thanh toán online — xác nhận giả mạo / chữ ký / gọi lặp");
{
  const victim = await newCustomer("Thanh toán");
  const mk = async () => (await call("POST", "/api/orders", { token: victim.token, body: { orderType: "Takeaway", storeId: 1, lines: [line(2, 2)] } })).body;

  const o1 = await mk();
  const p0 = points(victim.id);
  const fake = await call("POST", `/api/orders/${o1.id}/sepay/confirm`, {});
  check("Người lạ KHÔNG xác nhận được đơn đã trả qua /sepay/confirm (không token, không giao dịch)", orderRow(o1.id)?.status !== "Paid", `status ${fake.status} → đơn ${orderRow(o1.id)?.status}, điểm ${p0} → ${points(victim.id)}`);

  const o2 = await mk();
  const vfake = await call("POST", `/api/orders/${o2.id}/vnpay/client-confirm`, { body: { vnp_ResponseCode: "00" } });
  check("VNPay client-confirm không chữ ký bị từ chối", orderRow(o2.id)?.status !== "Paid", `status ${vfake.status} ${short(vfake.body)} → đơn ${orderRow(o2.id)?.status}`);

  const o3 = await mk();
  const badSig = await call("GET", `/api/vnpay/ipn?vnp_TxnRef=${o3.id}-1&vnp_ResponseCode=00&vnp_TransactionStatus=00&vnp_Amount=${o3.totalAmount * 100}&vnp_SecureHash=deadbeef`);
  check("VNPay IPN chữ ký sai bị từ chối", orderRow(o3.id)?.status !== "Paid", `status ${badSig.status} ${short(badSig.body)}`);
  const momo = await call("POST", "/api/momo/ipn", { body: { orderId: `TD${o3.id}-1`, resultCode: 0, amount: o3.totalAmount, signature: "sai" } });
  check("MoMo IPN chữ ký sai bị từ chối", orderRow(o3.id)?.status !== "Paid", `status ${momo.status} ${short(momo.body)}`);
  const sepayNoSig = await call("POST", "/api/sepay/ipn", { body: { order_invoice_number: `TD${o3.id}-1`, status: "SUCCESS", amount: 1 } });
  check("SePay IPN không có chữ ký (số tiền 1đ) bị từ chối", orderRow(o3.id)?.status !== "Paid", `status ${sepayNoSig.status} → đơn ${orderRow(o3.id)?.status}`);

  // Gọi xác nhận 2 lần / song song → chỉ 1 Payment, điểm cộng 1 lần
  const o4 = await mk();
  const before = points(victim.id);
  await Promise.all([1, 2, 3].map(() => call("POST", `/api/orders/${o4.id}/sepay/confirm`, {})));
  const pays = Number(sql1(`SELECT COUNT(*) n FROM Payments WHERE Order_ID=${o4.id}`)?.n);
  const earned = Number(orderRow(o4.id)?.pe ?? 0);
  check("Xác nhận thanh toán gọi 3 lần song song chỉ tạo 1 Payment", pays <= 1, `Payments ${pays}`);
  check("Điểm chỉ cộng 1 lần", points(victim.id) - before === earned, `điểm +${points(victim.id) - before}, Points_Earned ${earned}`);
  const afterPaidCancel = await call("POST", `/api/orders/${o4.id}/cancel`, { token: victim.token, body: {} });
  check("Không hủy được đơn mang về đã Paid", afterPaidCancel.status === 400, `status ${afterPaidCancel.status}`);

  // Đơn đã hủy rồi xác nhận thanh toán
  const o5 = await mk();
  await call("POST", `/api/orders/${o5.id}/cancel`, { token: victim.token, body: {} });
  const paidCancelled = await call("POST", `/api/orders/${o5.id}/vnpay/client-confirm`, { body: { vnp_ResponseCode: "00", vnp_TxnRef: `${o5.id}-x` } });
  check("Đơn đã hủy không chuyển được sang Paid", orderRow(o5.id)?.status === "Cancelled", `status ${paidCancelled.status} → ${orderRow(o5.id)?.status}`);
}

/* ───────── 8. Điểm: IDOR redeem ───────── */
group("A8 Điểm — dùng điểm, IDOR");
{
  const rich = await newCustomer("Nhiều điểm");
  sql(`UPDATE Customers SET Points=50000 WHERE Customer_ID=${rich.id}`);
  const o = await call("POST", "/api/orders", { token: rich.token, body: { orderType: "Takeaway", storeId: 1, lines: [line(2, 1)] } });
  const anon = await call("POST", `/api/orders/${o.body.id}/redeem-points`, { body: { pointsToUse: 999999 } });
  check("Người lạ (không token) không áp điểm của khách khác vào đơn của họ", anon.status === 403 || anon.status === 401, `status ${anon.status} pointsUsed=${orderRow(o.body.id)?.pu}`);
  const neg = await call("POST", `/api/orders/${o.body.id}/redeem-points`, { token: rich.token, body: { pointsToUse: -5000 } });
  check("Dùng điểm âm không làm tăng tổng tiền", Number(orderRow(o.body.id)?.pu) >= 0, `status ${neg.status} pu=${orderRow(o.body.id)?.pu}`);
  const over = await call("POST", `/api/orders/${o.body.id}/redeem-points`, { token: rich.token, body: { pointsToUse: 999999 } });
  check("Dùng điểm vượt giá trị đơn bị giới hạn, tổng ≥ 0", over.status === 200 && Number(over.body.newTotal) >= 0, `newTotal ${over.body?.newTotal}`);
}

/* ───────── IDOR đọc đơn / bill ───────── */
group("A IDOR — đọc đơn, bill người khác");
{
  const owner = await newCustomer("Chủ đơn");
  sql(`UPDATE Customers SET Customer_Name='Bí Mật QA' WHERE Customer_ID=${owner.id}`);
  const o = await call("POST", "/api/orders", { token: owner.token, body: { orderType: "Delivery", storeId: 1, deliveryAddress: "123 Đường Riêng Tư, Q1", customerLat: 10.7775, customerLng: 106.7015, lines: [line()] } });
  for (const p of [`/api/orders/${o.body.id}`, `/api/orders/${o.body.id}/bill`, `/api/pos/bills/${o.body.id}`, `/api/orders/${o.body.id}/tracking`]) {
    const r = await call("GET", p);
    const leak = JSON.stringify(r.body);
    check(`Không đăng nhập không đọc được ${p.replace(String(o.body.id), ":id")} (SĐT/địa chỉ)`, !(r.status === 200 && (leak.includes(owner.phone) || leak.includes("Riêng Tư"))), `status ${r.status}${leak.includes(owner.phone) ? " · lộ SĐT" : ""}${leak.includes("Riêng Tư") ? " · lộ địa chỉ" : ""}`);
  }
  const staffList = await call("GET", "/api/staff/members");
  check("Danh sách nhân sự (username, vai trò) không công khai", staffList.status === 401 || staffList.status === 403, `status ${staffList.status}, ${Array.isArray(staffList.body) ? staffList.body.length + " nhân sự" : ""}`);
}

/* ───────── 10. Đánh giá ───────── */
group("A10 Đánh giá");
{
  const k = await newCustomer("Đánh giá");
  const o = await call("POST", "/api/orders", { token: k.token, body: { orderType: "Takeaway", storeId: 1, lines: [line(1, 1)] } });
  const early = await call("POST", "/api/reviews", { token: k.token, body: { orderId: o.body.id, rating: 5, comment: "chưa trả tiền" } });
  check("Chặn đánh giá đơn chưa thanh toán", early.status === 400, `status ${early.status}`);
  sql(`UPDATE Orders SET Status='Paid' WHERE Order_ID=${o.body.id}`);
  const other = await newCustomer("Người khác");
  const foreign = await call("POST", "/api/reviews", { token: other.token, body: { orderId: o.body.id, rating: 1 } });
  check("Chặn đánh giá đơn của người khác", foreign.status === 403, `status ${foreign.status}`);
  const ok = await call("POST", "/api/reviews", { token: k.token, body: { orderId: o.body.id, rating: 5, comment: "Ngon <script>alert(1)</script> lắm" } });
  check("Đánh giá đơn đã thanh toán", ok.status === 201, `status ${ok.status}`);
  const again = await call("POST", "/api/reviews", { token: k.token, body: { orderId: o.body.id, rating: 1, comment: "spam" } });
  check("Không đánh giá 2 lần cùng một đơn", again.status === 409 || again.status === 400, `status ${again.status}`);
  const rate = await call("POST", "/api/reviews", { token: k.token, body: { orderId: o.body.id, rating: 9 } });
  check("Rating ngoài 1–5 bị từ chối", rate.status === 400, `status ${rate.status}`);
  const js = await call("POST", "/api/reviews", { token: k.token, body: { orderId: o.body.id, rating: 4, imageUrl: "javascript:alert(1)" } });
  check("imageUrl dạng javascript: bị từ chối", js.status === 400, `status ${js.status}`);
}

save("03-customer-orders.json");
