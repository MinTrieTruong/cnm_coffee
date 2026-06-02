/* ─── PostEditor.tsx ───────────────────────────────────────────────
   WYSIWYG editor dạng Word dùng TipTap.
   Prop `theme` = "dark" (default, trang khách) | "light" (Admin panel)
─────────────────────────────────────────────────────────────────── */
import { useCallback, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import LinkExt from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { staffUploadImage } from "../lib/staffApi";

/* ── Nút toolbar ── */
function TB({
  active, title, onClick, children, activeColor, inactiveColor,
}: {
  active?: boolean; title: string; onClick: () => void;
  children: React.ReactNode;
  activeColor?: string;
  inactiveColor?: string;
}) {
  const defaultActive = "var(--accent)";
  const defaultInactive = "var(--text)";
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        padding: "0.3rem 0.5rem",
        minWidth: 30, height: 30,
        background: active ? "rgba(212,167,95,0.2)" : "transparent",
        border: active ? "1px solid rgba(212,167,95,0.5)" : "1px solid transparent",
        borderRadius: 6,
        color: active ? (activeColor ?? defaultActive) : (inactiveColor ?? defaultInactive),
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: active ? 700 : 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s",
      }}
    >
      {children}
    </button>
  );
}

/* ── Divider ── */
function TBDiv({ light }: { light?: boolean }) {
  return (
    <div style={{
      width: 1,
      background: light ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.14)",
      margin: "0 0.25rem", height: 22, flexShrink: 0,
    }} />
  );
}

/* ── Toolbar ── */
function Toolbar({ editor, light }: { editor: Editor | null; light?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const insertLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL liên kết:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const insertImageFromFile = useCallback(async (file: File) => {
    if (!editor) return;
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const url = await staffUploadImage(dataUrl);
        editor.chain().focus().setImage({ src: url }).run();
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error("Upload ảnh lỗi:", e);
    }
  }, [editor]);

  const insertImageFromUrl = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL ảnh:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  /* Màu theo theme */
  const ic = light ? "#374151" : "var(--text)";   // inactive color
  const ac = light ? "#92400e" : "var(--accent)";  // active color

  return (
    <div
      style={{
        display: "flex", flexWrap: "wrap", gap: "0.15rem",
        padding: "0.5rem 0.65rem",
        background: light ? "#f1f5f9" : "rgba(255,255,255,0.05)",
        borderBottom: light ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: "10px 10px 0 0",
        alignItems: "center",
      }}
    >
      {/* Heading */}
      <TB title="Tiêu đề 1" active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        activeColor={ac} inactiveColor={ic}><strong>H1</strong></TB>
      <TB title="Tiêu đề 2" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        activeColor={ac} inactiveColor={ic}><strong>H2</strong></TB>
      <TB title="Tiêu đề 3" active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        activeColor={ac} inactiveColor={ic}><strong>H3</strong></TB>

      <TBDiv light={light} />

      {/* Text format */}
      <TB title="In đậm (Ctrl+B)" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        activeColor={ac} inactiveColor={ic}><b>B</b></TB>
      <TB title="In nghiêng (Ctrl+I)" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        activeColor={ac} inactiveColor={ic}><i style={{ fontStyle: "italic" }}>I</i></TB>
      <TB title="Gạch chân (Ctrl+U)" active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        activeColor={ac} inactiveColor={ic}><u>U</u></TB>
      <TB title="Gạch ngang" active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        activeColor={ac} inactiveColor={ic}><s>S</s></TB>
      <TB title="Đánh dấu" active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        activeColor={ac} inactiveColor={ic}>🖊</TB>

      <TBDiv light={light} />

      {/* Alignment */}
      <TB title="Căn trái" active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        activeColor={ac} inactiveColor={ic}>⬅</TB>
      <TB title="Căn giữa" active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        activeColor={ac} inactiveColor={ic}>↔</TB>
      <TB title="Căn phải" active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        activeColor={ac} inactiveColor={ic}>➡</TB>
      <TB title="Căn đều" active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        activeColor={ac} inactiveColor={ic}>☰</TB>

      <TBDiv light={light} />

      {/* Lists */}
      <TB title="Danh sách gạch đầu dòng" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        activeColor={ac} inactiveColor={ic}>• –</TB>
      <TB title="Danh sách đánh số" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        activeColor={ac} inactiveColor={ic}>1.</TB>

      <TBDiv light={light} />

      {/* Block */}
      <TB title="Trích dẫn" active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        activeColor={ac} inactiveColor={ic}>❝</TB>
      <TB title="Khối code" active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        activeColor={ac} inactiveColor={ic}>{"</>"}</TB>

      <TBDiv light={light} />

      {/* Link */}
      <TB title="Chèn / sửa liên kết" active={editor.isActive("link")}
        onClick={insertLink} activeColor={ac} inactiveColor={ic}>🔗</TB>

      {/* Image upload */}
      <TB title="Upload ảnh từ máy tính" active={false}
        onClick={() => fileRef.current?.click()} inactiveColor={ic}>🖼</TB>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImageFromFile(file);
          e.target.value = "";
        }}
      />
      <TB title="Chèn ảnh từ URL" active={false}
        onClick={insertImageFromUrl} inactiveColor={ic}>🌐</TB>

      <TBDiv light={light} />

      {/* Undo / Redo */}
      <TB title="Hoàn tác (Ctrl+Z)" active={false}
        onClick={() => editor.chain().focus().undo().run()} inactiveColor={ic}>↩</TB>
      <TB title="Làm lại (Ctrl+Y)" active={false}
        onClick={() => editor.chain().focus().redo().run()} inactiveColor={ic}>↪</TB>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Export chính: PostEditor
   Props:
     content  — HTML string (load bài cũ)
     onChange — callback nhận HTML mới
     height   — chiều cao tối thiểu của vùng soạn thảo
     theme    — "dark" (trang khách, mặc định) | "light" (admin panel)
══════════════════════════════════════════════════════════════════ */
export function PostEditor({
  content = "",
  onChange,
  height = "420px",
  theme = "dark",
}: {
  content?: string;
  onChange: (html: string) => void;
  height?: string;
  theme?: "dark" | "light";
}) {
  const light = theme === "light";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      ImageExt.configure({ inline: false, allowBase64: true }),
      LinkExt.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      TextStyle,
      Highlight.configure({ multicolor: false }),
    ],
    content,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class: "post-editor-body",
        style: [
          `min-height:${height}`,
          "padding:1.1rem 1.25rem",
          "outline:none",
          light ? "color:#1e293b;background:#fff;" : "color:var(--text);background:transparent;",
        ].join(";"),
      },
    },
  });

  return (
    <div
      style={{
        border: light ? "1.5px solid #cbd5e1" : "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        background: light ? "#ffffff" : "rgba(255,255,255,0.03)",
        overflow: "hidden",
        boxShadow: light ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
      }}
    >
      <Toolbar editor={editor} light={light} />
      <EditorContent editor={editor} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PostContent — render HTML đã lưu (readonly, dùng trên trang khách)
══════════════════════════════════════════════════════════════════ */
export function PostContent({ html }: { html: string }) {
  return (
    <div
      className="post-rendered-content"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
