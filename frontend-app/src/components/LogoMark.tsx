import { useState } from "react";

/** Ưu tiên `logo-td-coffee.png` trong /public; nếu không có thì dùng SVG. */
export function LogoMark({
  className,
  width = 44,
  height = 44,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  const [src, setSrc] = useState("/logo-td-coffee.png");
  return (
    <img
      src={src}
      alt="TD Coffee"
      width={width}
      height={height}
      className={className}
      onError={() => setSrc("/logo-td-coffee.svg")}
    />
  );
}
