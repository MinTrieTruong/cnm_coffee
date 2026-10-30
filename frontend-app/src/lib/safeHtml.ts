/**
 * Lọc HTML theo danh sách trắng trước khi render bằng dangerouslySetInnerHTML (mô tả pop up…).
 * Chỉ giữ thẻ định dạng cơ bản; bỏ mọi thuộc tính khác ngoài href/src/alt/style (style chỉ giữ thuộc tính chữ & màu an toàn).
 */
const ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "DEL", "SUB", "SUP", "SPAN", "MARK", "A", "UL", "OL", "LI",
  "BLOCKQUOTE", "CODE", "PRE", "H1", "H2", "H3", "H4", "IMG", "HR",
]);
/** Thẻ bị bỏ cả nội dung bên trong */
const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "FORM", "TEXTAREA", "SELECT", "BUTTON"]);
const STYLE_PROPS = new Set(["color", "background-color", "text-align", "font-size", "font-family", "font-weight", "font-style", "text-decoration"]);

const safeUrl = (u: string, img: boolean) => {
  const s = u.trim();
  if (/^(https?:|mailto:|tel:)/i.test(s) || /^\/(?!\/)/.test(s) || s.startsWith("#")) return true;
  return img && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s);
};

function cleanStyle(style: string) {
  return style
    .split(";")
    .map((d) => d.trim())
    .filter((d) => {
      const [k, ...v] = d.split(":");
      const val = v.join(":").toLowerCase();
      return k && STYLE_PROPS.has(k.trim().toLowerCase()) && !/url\(|expression|javascript:/.test(val);
    })
    .join("; ");
}

function cleanNode(node: Node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      el.remove();
      continue;
    }
    cleanNode(el);
    if (!ALLOWED_TAGS.has(tag)) {
      // Giữ chữ bên trong, bỏ thẻ
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const ok =
        (name === "href" && tag === "A" && safeUrl(attr.value, false)) ||
        (name === "src" && tag === "IMG" && safeUrl(attr.value, true)) ||
        (name === "alt" && tag === "IMG") ||
        name === "style";
      if (!ok) el.removeAttribute(attr.name);
      else if (name === "style") {
        const st = cleanStyle(attr.value);
        if (st) el.setAttribute("style", st);
        else el.removeAttribute("style");
      }
    }
    if (tag === "A") {
      el.setAttribute("rel", "noopener noreferrer");
      if (/^https?:/i.test(el.getAttribute("href") ?? "")) el.setAttribute("target", "_blank");
    }
  }
}

export function safeHtml(html: string | null | undefined): string {
  if (!html || typeof document === "undefined") return "";
  // <template> không chạy script / không tải ảnh khi parse
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  cleanNode(tpl.content);
  return tpl.innerHTML;
}
