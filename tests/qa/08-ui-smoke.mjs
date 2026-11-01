/**
 * Giao diện (Playwright headless, KHÔNG screenshot / video / trace):
 * lỗi console + JS, API 5xx, tràn ngang ở 390px / 1440px, VI/EN, sáng/tối, thêm giỏ, đăng nhập nhân sự.
 * Cần frontend build với VITE_API_URL=http://localhost:4100 chạy ở QA_WEB (mặc định vite preview :4173).
 * Dùng Edge có sẵn trên máy (channel msedge) — không tải trình duyệt.
 */
import { chromium } from "playwright-core";
import { check, group, save, newCustomer } from "./lib.mjs";

const WEB = process.env.QA_WEB ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.QA_BROWSER ?? "msedge", headless: true });

async function visit(page, path, { wait = 1800 } = {}) {
  const errs = [];
  const onConsole = (m) => {
    if ((m.type() === "error" && !/Failed to load resource/.test(m.text())) || (m.type() === "warning" && /React|Warning:|key prop|act\(/.test(m.text()))) errs.push(`${m.type()}: ${m.text().slice(0, 160)}`);
  };
  const onPageErr = (e) => errs.push(`pageerror: ${String(e).slice(0, 160)}`);
  const onResp = (r) => {
    if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`);
  };
  const onFail = (r) => /localhost|127\.0\.0\.1/.test(r.url()) && !/javascript:/.test(r.url()) && errs.push(`requestfailed ${r.failure()?.errorText ?? ""} ${r.url().slice(0, 90)}`);
  page.on("requestfailed", onFail);
  page.on("console", onConsole);
  page.on("pageerror", onPageErr);
  page.on("response", onResp);
  await page.goto(WEB + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
  const overflow = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth - w;
    const culprits = over > 1
      ? [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && getComputedStyle(el).position !== "fixed"; })
          .slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`)
      : [];
    return { over, culprits };
  });
  page.off("requestfailed", onFail);
  page.off("console", onConsole);
  page.off("pageerror", onPageErr);
  page.off("response", onResp);
  return { errs, overflow };
}

const PAGES = ["/", "/menu", "/product/2", "/cart", "/promotions", "/blog", "/about", "/contact", "/login", "/register", "/game/1", "/account"];
const cust = await newCustomer("UI");

for (const [label, viewport] of [["390px", { width: 390, height: 844 }], ["1440px", { width: 1440, height: 900 }]]) {
  group(`A13 Trang khách @ ${label}`);
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([t]) => {
    try { localStorage.setItem("cmn_token", t); } catch { /* */ }
  }, [cust.token]);
  const page = await ctx.newPage();
  for (const p of PAGES) {
    const r = await visit(page, p);
    check(`${p} @${label}: không lỗi console/JS/5xx`, r.errs.length === 0, r.errs.slice(0, 4).join(" | "));
    check(`${p} @${label}: không tràn ngang`, r.overflow.over <= 1, r.overflow.over > 1 ? `tràn ${r.overflow.over}px: ${r.overflow.culprits.join(", ")}` : "");
  }
  await ctx.close();
}

group("A3/A13 Thêm giỏ, VI/EN, sáng/tối");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(WEB + "/product/2", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const btn = page.getByRole("button", { name: /Thêm vào giỏ/i }).first();
  let added = false;
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(600);
    added = await page.evaluate(() => Object.keys(localStorage).some((k) => /cart/i.test(k) && (localStorage.getItem(k) ?? "").length > 2));
  }
  check("Chi tiết món → Thêm vào giỏ lưu giỏ hàng", added, (await btn.count()) ? "" : "không thấy nút Thêm vào giỏ");
  await page.goto(WEB + "/cart", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const cartText = await page.textContent("body");
  check("Giỏ hàng hiển thị món vừa thêm", /Bạc Xỉu/i.test(cartText ?? ""), "");

  await page.evaluate(() => localStorage.setItem("c-lang", "en"));
  await page.goto(WEB + "/menu", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const nav = await page.evaluate(() => document.querySelector("header")?.textContent ?? "");
  check("Chuyển EN: thanh điều hướng hiện tiếng Anh", /Menu|Offers|News/.test(nav) && !/Khuyến mãi|Tin tức/.test(nav), nav.slice(0, 160));
  check("Chuyển EN: <html lang> = en", (await page.evaluate(() => document.documentElement.lang)) === "en");
  await page.evaluate(() => { localStorage.setItem("c-lang", "vi"); localStorage.setItem("c-mode", "dark"); });
  await page.goto(WEB + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  check("Chế độ tối: html[data-c-mode=dark]", (await page.evaluate(() => document.documentElement.dataset.cMode)) === "dark");
  await ctx.close();
}

group("B14 Đăng nhập nhân sự + trang theo vai trò");
for (const [user, path] of [["cashier", "/pos"], ["admin", "/app/overview/dashboard"], ["kitchen", "/app"], ["owner", "/app/overview/dashboard"], ["waiter", "/app"], ["kho", "/app"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(WEB + "/staff/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator("#u").fill(user);
  await page.locator("#p").fill("staff123");
  await page.locator("form button.auth-btn[type=submit]").first().click();
  await page.waitForTimeout(2500);
  const landed = page.url().replace(WEB, "");
  check(`${user} đăng nhập UI thành công (vào ${landed})`, !landed.startsWith("/staff/login"), landed);
  const r = await visit(page, path, { wait: 2500 });
  const blank = await page.evaluate(() => (document.body.innerText ?? "").trim().length < 20);
  check(`${user} ${path}: không lỗi console/JS/5xx`, r.errs.length === 0, r.errs.slice(0, 4).join(" | "));
  check(`${user} ${path}: trang không trắng`, !blank);
  await ctx.close();
}

await browser.close();
save("08-ui-smoke.json");
