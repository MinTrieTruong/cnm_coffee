/** Tiện ích chữ tiếng Việt cho kho tri thức */

/** Bỏ dấu, chữ thường, đ → d, chỉ giữ chữ số / chữ cái và khoảng trắng */
export function foldVi(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Từ dừng (đã bỏ dấu) — xuất hiện khắp nơi, không giúp phân biệt đoạn */
const STOPWORDS = new Set(
  "la va cua co khong cho voi thi ma a oi nhe nha nhi the nao gi duoc cac nhung mot nay do o ve tu de khi neu vay ah uh em anh chi minh ban toi shop quan dang se da roi lai cung rat".split(" "),
);

/** Tách từ cho BM25: âm tiết đã bỏ dấu (bỏ từ dừng) + cặp âm tiết liền nhau ("bac_xiu") để bắt đúng tên món nhiều chữ */
export function tokenize(s: string): string[] {
  const syl = foldVi(s).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < syl.length; i++) {
    if (!STOPWORDS.has(syl[i])) out.push(syl[i]);
    if (i + 1 < syl.length) out.push(`${syl[i]}_${syl[i + 1]}`);
  }
  return out;
}

/** Tiền tố ngữ cảnh gắn vào đoạn trước khi embedding (nội dung lưu trong CSDL không có tiền tố) */
export const embedInput = (title: string, heading: string | null, content: string) =>
  `Tài liệu: ${title}${heading ? ` › ${heading}` : ""}\n${content}`;
