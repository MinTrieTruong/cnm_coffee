/**
 * Đăng nhập khách bằng Google / Facebook.
 * Cần backend test chạy với NODE_ENV=test SOCIAL_TEST_SECRET=<QA_SOCIAL_SECRET> (mặc định "qa-social-secret"):
 * backend chấp nhận token giả "test.<jwt HS256>" thay cho token thật của Google / Meta để chạy được luồng nghiệp vụ.
 * Token thật (sai aud / hết hạn / app khác) chỉ kiểm được khi có app Google / Meta thật — xem docs/social-login-setup.md.
 */
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { call, sql1, check, group, save, newCustomer, customerLogin, staffLogin, short, signedVnpayIpn } from "./lib.mjs";

const SECRET = process.env.QA_SOCIAL_SECRET ?? "qa-social-secret";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** Token giả theo nhà cung cấp (aud = GOOGLE | FACEBOOK) */
function fake(provider, claims, { secret = SECRET, expIn = 600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ aud: provider, iat: now, exp: now + expIn, ...claims })}`;
  return `test.${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
const google = (claims, o) => call("POST", "/api/auth/google", { body: { idToken: fake("GOOGLE", claims, o) } });
const facebook = (claims, o) => call("POST", "/api/auth/facebook", { body: { accessToken: fake("FACEBOOK", claims, o) } });
const uid = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const phoneNew = () => "09" + String(Date.now() + Math.floor(Math.random() * 1e5)).slice(-8);
const count = (q) => Number(sql1(q)?.n ?? 0);
const identOf = (provider, sub) => sql1(`SELECT Customer_ID cid FROM Customer_Identities WHERE Provider='${provider}' AND Provider_User_ID='${sub}'`);
const lastLog = (cid) => sql1(`SELECT Event e, Provider p, IP ip FROM Customer_Auth_Logs WHERE Customer_ID=${cid} ORDER BY Log_ID DESC LIMIT 1`);

const owner = await staffLogin("owner");

if (group("S1 Cấu hình & xác minh token")) {
  const pv = await call("GET", "/api/auth/providers");
  check("/providers: bật cả Google và Facebook (chế độ test)", pv.status === 200 && pv.body.google?.enabled && pv.body.facebook?.enabled, short(pv.body));
  check("/providers không lộ secret", !/secret/i.test(JSON.stringify(pv.body)), short(pv.body));
  const cases = [
    ["Google: token rác → 401", await call("POST", "/api/auth/google", { body: { idToken: "abc.def.ghi" } }), 401],
    ["Google: thiếu token → 400", await call("POST", "/api/auth/google", { body: {} }), 400],
    ["Google: ký sai secret → 401", await google({ sub: "x1", email: "x1@qa.test" }, { secret: "sai" }), 401],
    ["Google: token hết hạn → 401", await google({ sub: "x2" }, { expIn: -60 }), 401],
    ["Google: token cấp cho Facebook (sai aud) → 401", await call("POST", "/api/auth/google", { body: { idToken: fake("FACEBOOK", { sub: "x3" }) } }), 401],
    ["Facebook: token rác → 401", await call("POST", "/api/auth/facebook", { body: { accessToken: "EAAB-khong-hop-le" } }), 401],
    ["Facebook: token cấp cho Google (sai app) → 401", await call("POST", "/api/auth/facebook", { body: { accessToken: fake("GOOGLE", { sub: "x4" }) } }), 401],
  ];
  for (const [name, r, want] of cases) check(name, r.status === want, `status ${r.status} ${short(r.body)}`);
}

let g; // khách mới tạo bằng Google
if (group("S2 Khách mới bằng Google → bổ sung SĐT")) {
  const sub = `g${uid()}`;
  const email = `new${uid()}@qa.test`;
  const r = await google({ sub, email, name: "QA Google Mới", picture: "https://lh3.googleusercontent.com/a/qa" });
  g = { sub, email, token: r.body?.token, id: r.body?.user?.customerId };
  check("Tạo tài khoản mới → 201, cần bổ sung SĐT", r.status === 201 && r.body.isNew && r.body.needsPhone && r.body.user.phone === null, `status ${r.status} ${short(r.body?.user)}`);
  check("Tên, email, ảnh lấy từ Google", r.body?.user?.fullName === "QA Google Mới" && r.body.user.email === email && !!r.body.user.avatarUrl, short(r.body?.user));
  check("Không có mật khẩu, có CustomerIdentity GOOGLE", sql1(`SELECT Password_Hash h FROM Customers WHERE Customer_ID=${g.id}`)?.h == null && Number(identOf("GOOGLE", sub)?.cid) === g.id, "");
  check("Ghi log REGISTER/GOOGLE kèm IP", lastLog(g.id)?.e === "REGISTER" && lastLog(g.id)?.p === "GOOGLE" && !!lastLog(g.id)?.ip, short(lastLog(g.id)));
  const me = await call("GET", "/api/auth/me", { token: g.token });
  check("JWT dùng được như đăng nhập thường (/me)", me.status === 200 && me.body.user.customerId === g.id, `status ${me.status}`);
  const again = await google({ sub, email });
  check("Đăng nhập lại cùng Google → vào đúng tài khoản, không tạo mới", again.status === 200 && again.body.user.customerId === g.id && !again.body.isNew, `status ${again.status}`);
  check("Cập nhật lastLoginAt", !!sql1(`SELECT Last_Login_At t FROM Customer_Identities WHERE Provider_User_ID='${sub}'`)?.t, "");

  const del = await call("POST", "/api/orders", { token: g.token, body: { orderType: "Delivery", storeId: 1, deliveryAddress: "QA", customerLat: 10.83, customerLng: 106.68, lines: [{ productId: 1, quantity: 1, size: "M" }] } });
  check("Chưa có SĐT → chặn đặt giao hàng", del.status === 400 && del.body.code === "PHONE_REQUIRED", `status ${del.status} ${short(del.body)}`);

  // Chưa có SĐT: đơn mang về trả VNPay → không tích điểm
  const o = (await call("POST", "/api/orders", { token: g.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId: 1, quantity: 2, size: "M" }] } })).body;
  const pay = await call("POST", `/api/orders/${o.id}/vnpay/create`, { token: g.token, body: {} });
  const amt = Number(new URL(pay.body.payUrl).searchParams.get("vnp_Amount")) / 100;
  await call("GET", signedVnpayIpn(o.id, amt));
  const row = sql1(`SELECT Status s, Points_Earned pe FROM Orders WHERE Order_ID=${o.id}`);
  check("Chưa có SĐT → đơn đã trả không tích điểm", row?.s === "Paid" && Number(row.pe) === 0 && Number(sql1(`SELECT Points p FROM Customers WHERE Customer_ID=${g.id}`)?.p) === 0, short(row));

  const bad = await call("POST", "/api/auth/phone", { token: g.token, body: { phone: "19001234" } });
  check("SĐT không phải 10 số → 400", bad.status === 400, `status ${bad.status}`);
  g.phone = phoneNew();
  const ok = await call("POST", "/api/auth/phone", { token: g.token, body: { phone: g.phone } });
  check("Bổ sung SĐT chưa ai dùng → lưu", ok.status === 200 && ok.body.user.phone === g.phone && !ok.body.needsPhone, `status ${ok.status} ${short(ok.body?.user)}`);

  const o2 = (await call("POST", "/api/orders", { token: g.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId: 1, quantity: 2, size: "M" }] } })).body;
  const pay2 = await call("POST", `/api/orders/${o2.id}/vnpay/create`, { token: g.token, body: {} });
  await call("GET", signedVnpayIpn(o2.id, Number(new URL(pay2.body.payUrl).searchParams.get("vnp_Amount")) / 100));
  const row2 = sql1(`SELECT Points_Earned pe FROM Orders WHERE Order_ID=${o2.id}`);
  check("Có SĐT rồi → đơn sau được tích điểm", Number(row2?.pe) > 0, short(row2));
}

let old; // khách cũ SĐT + mật khẩu
if (group("S3 Email Google trùng tài khoản cũ → nhập mật khẩu để liên kết")) {
  old = await newCustomer("Cũ có email");
  old.email = `old${uid()}@qa.test`;
  await call("PATCH", "/api/customer/profile", { token: old.token, body: { email: old.email } });
  sql1(`UPDATE Customers SET Points=777 WHERE Customer_ID=${old.id}`);
  const sub = `g${uid()}`;
  old.gsub = sub;
  const r = await google({ sub, email: old.email, name: "Người Lạ" });
  check("Không tự gộp: 409 LINK_REQUIRED", r.status === 409 && r.body.code === "LINK_REQUIRED" && !!r.body.ticket, `status ${r.status} ${short(r.body)}`);
  check("Thông tin tài khoản cũ đã che bớt", r.body?.account?.phone?.includes("****") && r.body.account.email?.includes("*") && r.body.account.hasPassword === true, short(r.body?.account));
  check("Không tạo tài khoản mới, chưa gắn liên kết", count(`SELECT COUNT(*) n FROM Customers WHERE Email='${old.email}'`) === 1 && !identOf("GOOGLE", sub), "");
  const wrong = await call("POST", "/api/auth/social/link", { body: { ticket: r.body.ticket, password: "sai-mat-khau" } });
  check("Sai mật khẩu → 401", wrong.status === 401, `status ${wrong.status}`);
  const forged = await call("POST", "/api/auth/social/link", { body: { ticket: r.body.ticket + "x", password: "123456" } });
  check("Phiếu liên kết bị sửa → 400", forged.status === 400, `status ${forged.status}`);
  const ok = await call("POST", "/api/auth/social/link", { body: { ticket: r.body.ticket, password: "123456" } });
  check("Đúng mật khẩu → đăng nhập vào tài khoản cũ", ok.status === 200 && ok.body.user.customerId === old.id && ok.body.linked, `status ${ok.status} ${short(ok.body?.user)}`);
  check("Giữ nguyên điểm của tài khoản cũ", ok.body?.user?.points === 777, `points ${ok.body?.user?.points}`);
  check("Liên kết GOOGLE gắn vào tài khoản cũ + log LINK", Number(identOf("GOOGLE", sub)?.cid) === old.id && count(`SELECT COUNT(*) n FROM Customer_Auth_Logs WHERE Customer_ID=${old.id} AND Event='LINK' AND Provider='GOOGLE'`) === 1, "");
  const direct = await google({ sub, email: old.email });
  check("Lần sau Google đăng nhập thẳng vào tài khoản cũ", direct.status === 200 && direct.body.user.customerId === old.id, `status ${direct.status}`);

  // Đoán mật khẩu: tối đa 5 lần mỗi phiếu
  const other = await newCustomer("Đoán mk");
  const oe = `guess${uid()}@qa.test`;
  await call("PATCH", "/api/customer/profile", { token: other.token, body: { email: oe } });
  const t2 = (await google({ sub: `g${uid()}`, email: oe })).body.ticket;
  for (let i = 0; i < 5; i++) await call("POST", "/api/auth/social/link", { body: { ticket: t2, password: `sai${i}` } });
  const locked = await call("POST", "/api/auth/social/link", { body: { ticket: t2, password: "123456" } });
  check("Sai 5 lần → khoá phiếu (429), kể cả mật khẩu đúng", locked.status === 429, `status ${locked.status}`);

  // Tài khoản cũ không có mật khẩu → hướng dẫn liên hệ quán
  const np = await newCustomer("Không mk");
  const npe = `nopw${uid()}@qa.test`;
  sql1(`UPDATE Customers SET Email='${npe}', Password_Hash=NULL WHERE Customer_ID=${np.id}`);
  const t3 = await google({ sub: `g${uid()}`, email: npe });
  const r3 = await call("POST", "/api/auth/social/link", { body: { ticket: t3.body.ticket, password: "x" } });
  check("Tài khoản cũ chưa có mật khẩu → báo liên hệ quán", t3.body?.account?.hasPassword === false && r3.status === 400 && r3.body.code === "NO_PASSWORD", `status ${r3.status} ${short(r3.body)}`);
}

if (group("S4 Facebook không có email → SĐT trùng tài khoản có sẵn → liên kết")) {
  const target = await newCustomer("Đích SĐT");
  const sub = `f${uid()}`;
  const r = await facebook({ sub, name: "QA Facebook" });
  check("Facebook không trả email vẫn tạo được tài khoản", r.status === 201 && r.body.user.email === null && r.body.needsPhone, `status ${r.status} ${short(r.body?.user)}`);
  const tempId = r.body.user.customerId;
  const dup = await call("POST", "/api/auth/phone", { token: r.body.token, body: { phone: target.phone } });
  check("SĐT đã thuộc tài khoản khác → 409 LINK_REQUIRED", dup.status === 409 && dup.body.code === "LINK_REQUIRED", `status ${dup.status} ${short(dup.body)}`);
  const ok = await call("POST", "/api/auth/social/link", { body: { ticket: dup.body.ticket, password: "123456" } });
  check("Nhập mật khẩu tài khoản có SĐT → vào tài khoản đó", ok.status === 200 && ok.body.user.customerId === target.id, `status ${ok.status}`);
  check("Liên kết FACEBOOK chuyển sang tài khoản có sẵn", Number(identOf("FACEBOOK", sub)?.cid) === target.id, "");
  check("Tài khoản tạm (chưa có dữ liệu) bị xoá", ok.body?.tempDeleted === true && count(`SELECT COUNT(*) n FROM Customers WHERE Customer_ID=${tempId}`) === 0, `tempDeleted=${ok.body?.tempDeleted}`);
  const pwAcc = await newCustomer("Có mk");
  const pwDup = await call("POST", "/api/auth/phone", { token: pwAcc.token, body: { phone: target.phone } });
  check("Tài khoản có mật khẩu không được 'gộp' qua SĐT người khác → 409 thường", pwDup.status === 409 && !pwDup.body.ticket, `status ${pwDup.status} ${short(pwDup.body)}`);
}

if (group("S5 Tài khoản › Bảo mật: liên kết / hủy liên kết / đặt mật khẩu")) {
  const ids = await call("GET", "/api/auth/identities", { token: g.token });
  check("Danh sách liên kết: chưa có mật khẩu, có Google", ids.status === 200 && ids.body.hasPassword === false && ids.body.identities.length === 1 && ids.body.identities[0].provider === "GOOGLE", short(ids.body));
  const last = await call("DELETE", "/api/auth/identities/google", { token: g.token });
  check("Không hủy được phương thức đăng nhập cuối cùng", last.status === 400, `status ${last.status} ${short(last.body)}`);
  const fsub = `f${uid()}`;
  const lf = await call("POST", "/api/auth/identities/facebook", { token: g.token, body: { accessToken: fake("FACEBOOK", { sub: fsub, name: "QA FB" }) } });
  check("Liên kết thêm Facebook", lf.status === 201 && Number(identOf("FACEBOOK", fsub)?.cid) === g.id, `status ${lf.status}`);
  const taken = await call("POST", "/api/auth/identities/google", { token: g.token, body: { idToken: fake("GOOGLE", { sub: old.gsub }) } });
  check("Google đã thuộc tài khoản khác → 409", taken.status === 409, `status ${taken.status}`);
  const ug = await call("DELETE", "/api/auth/identities/google", { token: g.token });
  check("Còn Facebook → hủy được Google + log UNLINK", ug.status === 200 && !identOf("GOOGLE", g.sub) && lastLog(g.id)?.e === "UNLINK", `status ${ug.status}`);
  const uf = await call("DELETE", "/api/auth/identities/facebook", { token: g.token });
  check("Facebook giờ là cuối cùng → không hủy được", uf.status === 400, `status ${uf.status}`);
  const setPw = await call("PATCH", "/api/customer/password", { token: g.token, body: { newPassword: "matkhau9" } });
  check("Khách mạng xã hội đặt mật khẩu không cần mật khẩu cũ + log SET_PASSWORD", setPw.status === 200 && lastLog(g.id)?.e === "SET_PASSWORD", `status ${setPw.status}`);
  const change = await call("PATCH", "/api/customer/password", { token: g.token, body: { newPassword: "khac1234" } });
  check("Đã có mật khẩu → đổi phải nhập mật khẩu hiện tại", change.status === 400, `status ${change.status}`);
  check("Đăng nhập bằng SĐT + mật khẩu mới đặt", !!(await customerLogin(g.phone, "matkhau9")), "");
  const uf2 = await call("DELETE", "/api/auth/identities/facebook", { token: g.token });
  check("Có mật khẩu → hủy được Facebook", uf2.status === 200, `status ${uf2.status}`);
}

if (group("S6 Công tắc của Chủ chuỗi")) {
  await call("PATCH", "/api/admin/settings", { token: owner, body: { googleLoginEnabled: false } });
  const pv = await call("GET", "/api/auth/providers");
  const r = await google({ sub: `g${uid()}`, email: `off${uid()}@qa.test` });
  check("Tắt Google → /providers báo tắt, Facebook vẫn bật", pv.body.google.enabled === false && pv.body.facebook.enabled === true, short(pv.body));
  check("Tắt Google → API từ chối 403", r.status === 403, `status ${r.status} ${short(r.body)}`);
  const s = await call("GET", "/api/admin/settings", { token: owner });
  check("Màn cấu hình thấy trạng thái biến môi trường", s.body?.socialConfigured?.GOOGLE === true && s.body.googleLoginEnabled === false, short(s.body?.socialConfigured));
  const waiter = await staffLogin("waiter");
  const deny = await call("PATCH", "/api/admin/settings", { token: waiter, body: { googleLoginEnabled: true } });
  check("Nhân viên không sửa được công tắc", deny.status === 403 || deny.status === 401, `status ${deny.status}`);
  await call("PATCH", "/api/admin/settings", { token: owner, body: { googleLoginEnabled: true } });
  const back = await google({ sub: `g${uid()}`, email: `on${uid()}@qa.test` });
  check("Bật lại → đăng nhập được", back.status === 201, `status ${back.status}`);
}

/* Giao diện: cần frontend build với VITE_API_URL=<backend test> + VITE_GOOGLE_CLIENT_ID / VITE_FACEBOOK_APP_ID bất kỳ, chạy ở QA_WEB */
if (group("S7 Giao diện đăng nhập mạng xã hội")) {
  const { chromium } = createRequire(import.meta.url)("playwright-core");
  const WEB = process.env.QA_WEB ?? "http://localhost:4173";
  const b = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".c-social", { timeout: 15000 }).catch(() => {});
  const fbText = await page.locator(".c-social-fb").textContent().catch(() => null);
  check("Trang /login có nút 'Tiếp tục với Facebook' và khung nút Google", /Tiếp tục với Facebook/.test(fbText ?? "") && (await page.locator(".c-social-gbtn").count()) === 1, `fb="${fbText}"`);
  check("Có dải 'Hoặc' trước 2 nút", (await page.locator(".c-social-or").count()) === 1, "");
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check("Điện thoại 390px: không cuộn ngang", noHScroll, "");
  await page.goto(`${WEB}/register`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".c-social-fb", { timeout: 15000 }).catch(() => {});
  check("Trang /register cũng có nút mạng xã hội", (await page.locator(".c-social-fb").count()) === 1, "");

  // Trang chủ không tải SDK Google / Facebook
  const home = await ctx.newPage();
  const sdk = [];
  home.on("request", (r) => /gsi\/client|connect\.facebook\.net/.test(r.url()) && sdk.push(r.url()));
  await home.goto(`${WEB}/`, { waitUntil: "networkidle" }).catch(() => {});
  check("Trang chủ không tải SDK Google / Facebook (tải lười)", sdk.length === 0, sdk.join(", "));
  await home.close();

  await call("PATCH", "/api/admin/settings", { token: owner, body: { googleLoginEnabled: false, facebookLoginEnabled: false } });
  const p2 = await ctx.newPage();
  await p2.goto(`${WEB}/login`, { waitUntil: "networkidle" }).catch(() => {});
  check("Chủ chuỗi tắt cả hai → không còn nút / dải 'Hoặc'", (await p2.locator(".c-social").count()) === 0, "");
  await p2.close();
  await call("PATCH", "/api/admin/settings", { token: owner, body: { googleLoginEnabled: true, facebookLoginEnabled: true } });

  for (const [path, h1] of [["/privacy", "Chính sách quyền riêng tư"], ["/data-deletion", "Xoá dữ liệu người dùng"]]) {
    await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
    const t = await page.locator("h1").first().textContent({ timeout: 10000 }).catch(() => "");
    check(`Trang ${path} hiển thị`, t?.includes(h1), `h1="${t}"`);
  }
  await page.goto(`${WEB}/policy/bao-mat`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/privacy$/, { timeout: 5000 }).catch(() => {});
  check("Link cũ /policy/bao-mat → /privacy", page.url().endsWith("/privacy"), page.url());

  // Khách mới bằng Facebook (chưa có SĐT): nhắc bổ sung, màn bổ sung SĐT, gặp SĐT trùng → màn liên kết
  const fresh = await facebook({ sub: `f${uid()}`, name: "QA UI" });
  const target = await newCustomer("UI đích");
  await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([t, u]) => { localStorage.setItem("cmn_token", t); localStorage.setItem("cmn_user", JSON.stringify(u)); }, [fresh.body.token, fresh.body.user]);
  await page.goto(`${WEB}/cart`, { waitUntil: "domcontentloaded" });
  check("Giỏ hàng nhắc bổ sung SĐT", await page.locator(".c-phone-reminder").waitFor({ timeout: 10000 }).then(() => true, () => false), "");
  await page.goto(`${WEB}/account/security`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".c-linked", { timeout: 10000 }).catch(() => {});
  const sec = (await page.locator("main, #root").first().textContent().catch(() => "")) ?? "";
  check("Bảo mật: 'Đặt mật khẩu' (không hỏi mật khẩu cũ) + khối 'Liên kết tài khoản'", sec.includes("Đặt mật khẩu") && !sec.includes("Mật khẩu hiện tại") && sec.includes("Liên kết tài khoản"), sec.slice(0, 160));
  const unlinkDisabled = await page.locator(".c-linked-row", { hasText: "Facebook" }).getByRole("button", { name: "Hủy liên kết" }).isDisabled().catch(() => null);
  check("Nút 'Hủy liên kết' Facebook bị khoá (cách đăng nhập duy nhất)", unlinkDisabled === true, `disabled=${unlinkDisabled}`);

  await page.goto(`${WEB}/login/phone?next=/menu`, { waitUntil: "domcontentloaded" });
  await page.fill("#cp-phone", target.phone);
  await page.getByRole("button", { name: "Lưu số điện thoại" }).click();
  const linkShown = await page.locator(".c-link-acc").waitFor({ timeout: 10000 }).then(() => true, () => false);
  check("SĐT trùng → hiện màn 'Tài khoản đã tồn tại' (SĐT đã che)", linkShown && /\*{4}/.test((await page.locator(".c-link-acc").textContent()) ?? ""), "");
  await page.fill("#link-pw", "123456");
  await page.getByRole("button", { name: "Liên kết và đăng nhập" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/menu", { timeout: 10000 }).catch(() => {});
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem("cmn_user") ?? "null"));
  check("Liên kết xong → đăng nhập tài khoản có sẵn, quay về trang trước (next)", new URL(page.url()).pathname === "/menu" && user?.customerId === target.id, `${page.url()} user=${user?.customerId}`);
  check("Không có lỗi JavaScript", errors.length === 0, errors.join(" | ").slice(0, 300));
  await b.close();
}

save("10-social-login.json");
