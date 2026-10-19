import { useEffect, useState } from "react";
import { Check, ChevronDown, Store } from "lucide-react";
import { getOwnerStore, getStaffInfo, isOwnerRole, setOwnerStore, staffApi } from "../../lib/staffApi";
import { Dropdown } from "./ControlPanel";

type StoreOpt = { id: number; name: string; isActive: boolean };

/**
 * Chi nhánh đang làm việc trên thanh điều hướng.
 * Nhân viên: chỉ hiển thị tên chi nhánh. Chủ chuỗi: chọn chi nhánh hoặc "Tất cả chi nhánh".
 */
export function StoreSwitcher() {
  const info = getStaffInfo();
  const owner = isOwnerRole(info?.role);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const current = getOwnerStore();

  useEffect(() => {
    if (!owner) return;
    staffApi<StoreOpt[]>("/api/admin/stores").then(setStores).catch(() => setStores([]));
  }, [owner]);

  if (!owner) {
    if (!info?.storeName) return null;
    return (
      <span className="o-nav-btn o-nav-branch-label" title="Chi nhánh">
        <Store size={16} aria-hidden />
        <span className="o-nav-branch-name">{info.storeName}</span>
      </span>
    );
  }

  const label = current == null ? "Tất cả chi nhánh" : stores.find((s) => s.id === current)?.name ?? "Chi nhánh";
  // Đổi chi nhánh: tải lại để mọi màn hình & socket dùng chi nhánh mới
  const pick = (id: number | null) => {
    if (id === current) return;
    setOwnerStore(id);
    window.location.reload();
  };

  return (
    <Dropdown
      align="right"
      button={({ open, toggle }) => (
        <button type="button" className="o-nav-btn" onClick={toggle} aria-expanded={open} aria-label="Chọn chi nhánh">
          <Store size={16} aria-hidden />
          <span className="o-nav-branch-name">{label}</span>
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="o-dropdown-header">Chi nhánh đang xem</div>
          {[{ id: null as number | null, name: "Tất cả chi nhánh", isActive: true }, ...stores].map((s) => (
            <button
              key={s.id ?? "all"}
              type="button"
              className={s.id === current ? "o-dropdown-item active" : "o-dropdown-item"}
              onClick={() => {
                close();
                pick(s.id);
              }}
            >
              {s.id === current ? <Check size={16} aria-hidden /> : <span style={{ width: 16 }} />}
              {s.name}
              {!s.isActive && <span className="o-muted"> (ngừng)</span>}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}
