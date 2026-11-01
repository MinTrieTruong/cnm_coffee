/**
 * B15 phân quyền qua API (vai trò, chi nhánh), B23 nhân viên CRUD, C28 bảo mật cơ bản (JWT, upload, XSS, injection).
 */
import { createHmac } from "node:crypto";
import { call, sql, sql1, check, group, save, newCustomer, staffLogin, short } from "./lib.mjs";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokens = {};
for (const u of ["owner", "admin", "admin2", "cashier", "cashier2", "waiter", "waiter2", "kitchen", "kitchen2", "kho", "SP_Hieu"]) tokens[u] = await staffLogin(u);
const staffId = (u) => Number(sql1(`SELECT Staff_ID id FROM Staff WHERE Username='${u}'`)?.id);

group("B15 Phân quyền theo vai trò");
{
  const cases = [
    ["cashier", "POST", "/api/admin/staff", { fullName: "X", role: "Waiter", password: "1234" }],
    ["waiter", "GET", "/api/admin/customers"],
    ["kitchen", "GET", "/api/cash/overview"],
    ["SP_Hieu", "GET", "/api/admin/reports/revenue"],
    ["kho", "POST", "/api/vouchers/admin", { code: "HACK", discountValue: 1, endDate: "2030-01-01", quantity: 1 }],
    ["cashier", "GET", "/api/admin/audit-logs"],
    ["admin", "POST", "/api/posts", { title: "Admin không được đăng bài chuỗi" }],
  ];
  for (const [u, m, p, body] of cases) {
    const r = await call(m, p, { token: tokens[u], body });
    check(`${u} gọi ${m} ${p} → 401/403/404`, [401, 403, 404].includes(r.status), `status ${r.status}`);
  }
  const custT = (await newCustomer("authz")).token;
  const r1 = await call("GET", "/api/pos/pending-orders", { token: custT });
  check("Token khách gọi API thu ngân → 403", r1.status === 403 || r1.status === 401, `status ${r1.status}`);
  const r2 = await call("GET", "/api/auth/me", { token: tokens.cashier });
  check("Token nhân sự gọi API khách → 403/401", r2.status === 403 || r2.status === 401, `status ${r2.status}`);
}

group("B15 Phân quyền theo chi nhánh (đối tượng của CN1, người của CN2)");
{
  const target = staffId("NV_Mai");
  const e1 = await call("PATCH", `/api/admin/staff/${target}`, { token: tokens.admin2, body: { fullName: "Bị sửa bởi CN2" } });
  check("Quản lý CN2 không sửa được nhân viên CN1", e1.status === 404 || e1.status === 403, `status ${e1.status}`);
  const e2 = await call("DELETE", `/api/admin/staff/${target}`, { token: tokens.admin2 });
  check("Quản lý CN2 không khoá được nhân viên CN1", e2.status === 404 || e2.status === 403, `status ${e2.status}`);
  const detail = sql1(`SELECT d.Detail_ID id FROM Order_Details d JOIN Orders o ON o.Order_ID=d.Order_ID WHERE o.Store_ID=1 AND o.Status IN ('Confirmed','Paid') ORDER BY d.Detail_ID DESC LIMIT 1`)?.id;
  if (detail) {
    const k = await call("PATCH", `/api/kds/details/${detail}`, { token: tokens.kitchen2, body: { kdsStatus: "Ready" } });
    check("Pha chế CN2 không đổi trạng thái món của CN1", k.status === 404 || k.status === 403, `status ${k.status}`);
    const bad = await call("PATCH", `/api/kds/details/${detail}`, { token: tokens.kitchen, body: { kdsStatus: "Hacked" } });
    check("KDS từ chối trạng thái món không hợp lệ", bad.status === 400, `status ${bad.status} → ${sql1(`SELECT KDS_Status s FROM Order_Details WHERE Detail_ID=${detail}`)?.s}`);
    sql(`UPDATE Order_Details SET KDS_Status='Waiting' WHERE Detail_ID=${detail}`);
  }
  const t1 = Number(sql1(`SELECT Table_ID id FROM Tables WHERE Store_ID=1 AND Status='Empty' LIMIT 1`)?.id);
  const w = await call("POST", `/api/staff/tables/${t1}/items`, { token: tokens.waiter2, body: { productId: 1, quantity: 1, size: "M" } });
  check("Phục vụ CN2 không gọi món được cho bàn CN1", w.status === 404 || w.status === 403 || w.status === 400, `status ${w.status} ${short(w.body)}`);
  const mv = await call("POST", "/api/pos/move-table", { token: tokens.waiter2, body: { fromTableId: 1, toTableId: t1 } });
  check("Phục vụ CN2 không chuyển bàn của CN1", mv.status >= 400, `status ${mv.status} ${short(mv.body)}`);
  const own = await call("GET", "/api/admin/staff", { token: tokens.admin2 });
  const list = Array.isArray(own.body) ? own.body : own.body?.rows ?? [];
  check("Danh sách nhân viên của quản lý CN2 không có nhân viên CN1", !list.some((s) => s.storeId === 1), `status ${own.status}, ${list.length} người`);
  const ownerAll = await call("GET", "/api/admin/staff", { token: tokens.owner, headers: { "X-Store-Id": "999" } });
  check("Owner chọn chi nhánh không tồn tại → 400", ownerAll.status === 400, `status ${ownerAll.status}`);
}

group("B23 Nhân viên CRUD — leo thang quyền");
{
  const me = staffId("admin");
  const before = Number(sql1(`SELECT Base_Salary s FROM Staff WHERE Staff_ID=${me}`)?.s);
  const raise = await call("PATCH", `/api/admin/staff/${me}`, { token: tokens.admin, body: { baseSalary: 99999999 } });
  const after = Number(sql1(`SELECT Base_Salary s FROM Staff WHERE Staff_ID=${me}`)?.s);
  check("Quản lý chi nhánh không tự tăng lương của mình", after === before, `status ${raise.status}, lương ${before} → ${after}`);
  sql(`UPDATE Staff SET Base_Salary=${before} WHERE Staff_ID=${me}`);
  check("PATCH /admin/staff/:id không trả passwordHash / faceDescriptor", !("passwordHash" in (raise.body ?? {})), `keys: ${Object.keys(raise.body ?? {}).slice(0, 25).join(",")}`);
  const promote = await call("PATCH", `/api/admin/staff/${staffId("NV_Mai")}`, { token: tokens.admin, body: { role: "Admin" } });
  check("Quản lý chi nhánh không nâng nhân viên lên Admin", promote.status === 403, `status ${promote.status}`);
  const mkOwner = await call("POST", "/api/admin/staff", { token: tokens.admin, body: { fullName: "Chủ giả", role: "Owner", password: "123456" } });
  check("Quản lý chi nhánh không tạo được tài khoản Owner", mkOwner.status === 403, `status ${mkOwner.status}`);
  const weak = await call("POST", "/api/admin/staff", { token: tokens.admin, body: { fullName: "Mật khẩu yếu", role: "Waiter", password: "1234" } });
  check("Tạo nhân viên với mật khẩu 4 ký tự bị từ chối (tối thiểu nên 6)", weak.status === 400, `status ${weak.status}`);
  const customers = await call("GET", "/api/admin/customers", { token: tokens.admin });
  check("GET /admin/customers không lộ passwordHash", !JSON.stringify(customers.body).includes("passwordHash"), `status ${customers.status}`);
  // Nhân viên bị khoá: token cũ phải hết hiệu lực
  const temp = await call("POST", "/api/admin/staff", { token: tokens.admin, body: { fullName: "Tạm QA", role: "Waiter", password: "123456", username: "qa_temp_" + Date.now() } });
  if (temp.status === 201) {
    const tt = await staffLogin(temp.body.username, "123456");
    await call("DELETE", `/api/admin/staff/${temp.body.id}`, { token: tokens.admin });
    const after2 = await call("GET", "/api/pos/tables", { token: tt });
    check("Token của nhân viên đã khoá bị từ chối", after2.status === 403 || after2.status === 401, `status ${after2.status}`);
  }
}

group("C28 Bảo mật — JWT, upload, XSS");
{
  const forged = `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ typ: "staff", sub: 1, role: "Owner" })}.${createHmac("sha256", "dev-secret-change-me").update("x").digest("base64url")}`;
  const f1 = await call("GET", "/api/admin/customers", { token: forged });
  check("JWT ký sai bị từ chối", f1.status === 401, `status ${f1.status}`);
  const none = `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ typ: "staff", sub: 1, role: "Owner" })}.`;
  const f2 = await call("GET", "/api/admin/customers", { token: none });
  check("JWT alg=none bị từ chối", f2.status === 401, `status ${f2.status}`);
  const dev = (() => {
    const h = b64u({ alg: "HS256", typ: "JWT" });
    const p = b64u({ typ: "staff", sub: 1, role: "Owner", iat: Math.floor(Date.now() / 1000) });
    return `${h}.${p}.${createHmac("sha256", "dev-secret-change-me").update(`${h}.${p}`).digest("base64url")}`;
  })();
  const f3 = await call("GET", "/api/admin/customers", { token: dev });
  check("JWT ký bằng secret mặc định 'dev-secret-change-me' bị từ chối (đã đặt JWT_SECRET)", f3.status === 401, `status ${f3.status}`);
  const expired = (() => {
    const secret = null; // không có secret thật — chỉ kiểm token hết hạn do server tự ký: dùng token định dạng đúng nhưng exp quá khứ không ký được
    return secret;
  })();
  check("JWT hết hạn bị từ chối", null, "bỏ qua: cần JWT_SECRET thật để ký token hết hạn — jsonwebtoken kiểm exp mặc định");
  void expired;

  const k = await newCustomer("upload");
  const html = "data:text/html;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
  const u1 = await call("PATCH", "/api/customer/profile", { token: k.token, body: { avatarDataUrl: html } });
  check("Upload avatar không phải ảnh (text/html) bị từ chối", u1.status === 400 || !u1.body?.avatarUrl?.endsWith(".html"), `status ${u1.status} avatar=${u1.body?.avatarUrl}`);
  const fake = "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64");
  const u2 = await call("PATCH", "/api/customer/profile", { token: k.token, body: { avatarDataUrl: fake } });
  check("Upload nội dung không phải PNG nhưng khai báo image/png bị từ chối (kiểm magic bytes)", u2.status === 400, `status ${u2.status} avatar=${u2.body?.avatarUrl}`);
  const big = "data:image/png;base64," + Buffer.alloc(3_000_000, 1).toString("base64");
  const u3 = await call("PATCH", "/api/customer/profile", { token: k.token, body: { avatarDataUrl: big } });
  check("Upload ảnh > 2,5MB bị từ chối", u3.status === 400 || u3.status === 413, `status ${u3.status}`);

  const post = await call("POST", "/api/posts", { token: tokens.owner, body: { title: "QA XSS", body: '<p>ok</p><img src=x onerror="alert(document.cookie)"><script>alert(1)</script>', content: '<img src=x onerror="alert(1)">', status: "PUBLISHED", isPublished: true } });
  const saved = post.body?.id ? sql1(`SELECT * FROM Posts WHERE Post_ID=${post.body.id}`) : null;
  const stored = JSON.stringify(saved ?? post.body);
  check("Bài đăng: HTML nguy hiểm (onerror/script) được lọc trước khi lưu/hiển thị (BlogDetail dùng dangerouslySetInnerHTML)", !/onerror|<script/i.test(stored), `status ${post.status}${/onerror|<script/i.test(stored) ? " · lưu nguyên onerror/script" : ""}`);

  const sqli = await call("GET", `/api/menu?storeId=1&q=${encodeURIComponent("' OR 1=1 --")}`);
  check("Tham số tìm kiếm có ký tự SQL không gây lỗi 500", sqli.status !== 500, `status ${sqli.status}`);
  const chat = await call("POST", "/api/chat", { body: { message: "<img src=x onerror=alert(1)>", text: "<img src=x onerror=alert(1)>" } });
  check("Chat bot nhận chuỗi HTML không lỗi 500", chat.status !== 500, `status ${chat.status}`);
}

save("05-staff-authz-security.json");
