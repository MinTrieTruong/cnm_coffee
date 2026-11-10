/**
 * Nóng / đá theo món: chủ chuỗi đặt món chỉ nóng / chỉ đá / cả hai; khách và phục vụ không đặt được kiểu món không có.
 */
import { createRequire } from "node:module";
import { call, sql1, check, group, save, newCustomer, staffLogin, short } from "./lib.mjs";

const owner = await staffLogin("owner");
const waiter = await staffLogin("waiter");
const cust = await newCustomer("Nóng đá");
const cat = Number(sql1("SELECT Category_ID id FROM Categories WHERE Parent_ID IS NOT NULL ORDER BY Category_ID LIMIT 1").id);
const mk = async (name, body) => (await call("POST", "/api/admin/products", { token: owner, body: { name, sellPrice: 30000, categoryId: cat, ...body } }));
const order = (productId, temp) => call("POST", "/api/orders", { token: cust.token, body: { orderType: "Takeaway", storeId: 1, lines: [{ productId, quantity: 1, size: "M", ...(temp ? { temp } : {}) }] } });
const savedTemp = (orderId) => sql1(`SELECT Temperature t FROM Order_Details WHERE Order_ID=${orderId}`)?.t ?? null;

let hot, both, food;
if (group("Tạo món — nhiệt độ phục vụ")) {
  const h = await mk(`QA Trà gừng nóng ${Date.now()}`, { temps: "HOT" });
  const b = await mk(`QA Latte ${Date.now()}`, {});
  const f = await mk(`QA Bánh ${Date.now()}`, { hasSizes: false });
  const bad = await mk(`QA Sai ${Date.now()}`, { temps: "WARM" });
  hot = h.body; both = b.body; food = f.body;
  check("Tạo món chỉ nóng", h.status === 201 && hot.temps === "HOT", `status ${h.status} temps=${hot?.temps}`);
  check("Món đồ uống mặc định 'nóng & đá'", b.status === 201 && both.temps === "BOTH", `temps=${both?.temps}`);
  check("Món 1 loại (bánh) mặc định không áp dụng nóng/đá", f.status === 201 && food.temps === "NONE", `temps=${food?.temps}`);
  check("Giá trị nhiệt độ không hợp lệ bị từ chối", bad.status === 400, `status ${bad.status}`);
  const sw = await call("PATCH", `/api/admin/products/${both.id}`, { token: owner, body: { temps: "ICED" } });
  check("Sửa món sang chỉ đá", sw.status === 200 && sql1(`SELECT Temperature t FROM Products WHERE Product_ID=${both.id}`)?.t === "ICED", `status ${sw.status}`);
  await call("PATCH", `/api/admin/products/${both.id}`, { token: owner, body: { temps: "BOTH" } });
}

if (group("Khách đặt món — nóng / đá")) {
  const r1 = await order(hot.id, "ICED");
  check("Món chỉ nóng: khách gửi 'đá' bị từ chối", r1.status === 400, `status ${r1.status} ${short(r1.body)}`);
  const r2 = await order(hot.id);
  check("Món chỉ nóng: không chọn → lưu NÓNG", r2.status === 201 && savedTemp(r2.body.id) === "HOT", `status ${r2.status} → ${savedTemp(r2.body?.id)}`);
  const r3 = await order(both.id, "HOT");
  check("Món nóng & đá: khách chọn nóng → lưu NÓNG", r3.status === 201 && savedTemp(r3.body.id) === "HOT", `→ ${savedTemp(r3.body?.id)}`);
  const r4 = await order(both.id);
  check("Món nóng & đá: không chọn → mặc định ĐÁ", r4.status === 201 && savedTemp(r4.body.id) === "ICED", `→ ${savedTemp(r4.body?.id)}`);
  const r5 = await order(food.id, "HOT");
  check("Bánh: bỏ qua nóng/đá, không lưu nhiệt độ", r5.status === 201 && savedTemp(r5.body.id) === null, `status ${r5.status} → ${savedTemp(r5.body?.id)}`);
}

if (group("Phục vụ gọi món tại bàn — nóng / đá")) {
  const t = Number(sql1("SELECT Table_ID id FROM Tables WHERE Store_ID=1 AND Status='Empty' ORDER BY Table_ID LIMIT 1").id);
  const w1 = await call("POST", `/api/staff/tables/${t}/items`, { token: waiter, body: { productId: hot.id, quantity: 1, size: "M", temp: "ICED" } });
  check("Phục vụ gọi 'đá' cho món chỉ nóng bị từ chối", w1.status === 400, `status ${w1.status} ${short(w1.body)}`);
  const w2 = await call("POST", `/api/staff/tables/${t}/items`, { token: waiter, body: { productId: both.id, quantity: 1, size: "M", temp: "HOT" } });
  const saved = sql1(`SELECT Temperature t FROM Order_Details WHERE Product_ID=${both.id} ORDER BY Detail_ID DESC LIMIT 1`)?.t;
  check("Phục vụ gọi món nóng & đá chọn nóng → lưu NÓNG", w2.status === 200 || w2.status === 201 ? saved === "HOT" : false, `status ${w2.status} → ${saved}`);
}

if (group("Trang chi tiết món của khách")) {
  const { chromium } = createRequire(import.meta.url)("playwright-core");
  const b = await chromium.launch({ channel: "msedge", headless: true });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const WEB = process.env.QA_WEB ?? "http://localhost:4173";
  const opts = async (id) => {
    await page.goto(`${WEB}/product/${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".c-pd-name");
    return page.evaluate(() => ({ text: document.querySelector(".c-pd-info")?.textContent ?? "", legends: [...document.querySelectorAll(".c-pd-opt legend")].map((l) => l.textContent) }));
  };
  const h = await opts(hot.id);
  check("Món chỉ nóng: hiện 'chỉ phục vụ nóng', không có nút chọn nóng/đá, không có lượng đá", h.text.includes("chỉ phục vụ nóng") && !h.legends.includes("Nóng / đá") && !h.legends.includes("Lượng đá"), h.legends.join(", "));
  const bo = await opts(both.id);
  check("Món nóng & đá: có nút chọn nóng/đá và lượng đá", bo.legends.includes("Nóng / đá") && bo.legends.includes("Lượng đá"), bo.legends.join(", "));
  await page.getByRole("button", { name: "Nóng", exact: true }).click();
  const afterHot = await page.evaluate(() => [...document.querySelectorAll(".c-pd-opt legend")].map((l) => l.textContent));
  check("Chọn Nóng thì ẩn 'Lượng đá'", !afterHot.includes("Lượng đá"), afterHot.join(", "));
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /cart/i.test(k))) ?? "[]"));
  const line = cart.find((i) => i.productId === both.id);
  check("Giỏ hàng lưu temp=HOT và ghi chú 'Nóng'", line?.temp === "HOT" && /Nóng/.test(line?.notes ?? ""), JSON.stringify(line ?? {}).slice(0, 160));
  const fo = await opts(food.id);
  check("Bánh: không có lựa chọn nóng/đá", !fo.legends.includes("Nóng / đá") && !fo.text.includes("chỉ phục vụ"), fo.legends.join(", "));
  await b.close();
}

save("09-temperature.json");
