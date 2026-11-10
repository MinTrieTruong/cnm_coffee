import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Ô mật khẩu có nút con mắt để hiện / ẩn. Nhận mọi thuộc tính của <input>. */
export function PasswordInput(props: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} type={show ? "text" : "password"} />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        disabled={props.disabled}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        tabIndex={-1}
      >
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
