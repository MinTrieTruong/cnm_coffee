import { useState, useEffect } from "react";
import { staffApi, getStaffInfo } from "../lib/staffApi";

type Payslip = {
  id: number;
  month: number;
  year: number;
  standardDays: number;
  actualWorkedDays: number;
  baseSalary: number;
  dailyRate: number;
  allowance: number;
  globalBonus: number;
  individualBonus: number;
  netSalary: number;
  status: string;
};

function formatVnd(val: number) {
  return new Intl.NumberFormat("vi-VN").format(val) + " đ";
}

export function StaffPayslips() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | "">("");

  useEffect(() => {
    staffApi<Payslip[]>("/api/payroll/my-payslips")
      .then(res => {
        setPayslips(res);
        if (res.length > 0) setSelectedId(res[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const info = getStaffInfo();
  const selected = payslips.find(p => p.id === selectedId) || null;

  return (
    <div className="container" style={{ paddingTop: "2rem", paddingBottom: "4rem", color: "var(--text)" }}>
      <h2 style={{ marginBottom: "1.5rem", color: "var(--primary)" }}>Phiếu Lương Của Tôi</h2>

      {loading ? (
        <p>Đang tải dữ liệu...</p>
      ) : payslips.length === 0 ? (
        <div className="empty-state" style={{ color: "#555" }}>
          <h3 style={{ margin: "0 0 0.5rem" }}>Chưa có dữ liệu lương</h3>
          <p style={{ margin: 0 }}>Phiếu lương của bạn sẽ hiển thị tại đây khi quản lý tính lương tháng.</p>
        </div>
      ) : (
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
            <label style={{ fontWeight: "bold" }}>Chọn tháng xem lương:</label>
            <select
              className="input"
              style={{ flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #ccc" }}
              value={selectedId}
              onChange={e => setSelectedId(Number(e.target.value))}
            >
              {payslips.map(p => (
                <option key={p.id} value={p.id}>
                  Tháng {p.month} / {p.year} {p.status === "PAID" ? "(Đã chốt)" : "(Chờ duyệt)"}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="card" style={{ overflow: "hidden", borderRadius: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
              <div style={{ background: "var(--primary)", color: "#fff", padding: "1.5rem", textAlign: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.4rem" }}>PHIẾU BÁO LƯƠNG</h2>
                <p style={{ margin: "0.5rem 0 0", opacity: 0.9 }}>Tháng {selected.month} / {selected.year}</p>
                <div style={{ marginTop: "0.75rem" }}>
                  {selected.status === "PAID" ? (
                    <span className="badge" style={{ background: "#d1fae5", color: "#065f46", padding: "0.3rem 0.75rem", borderRadius: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>Đã chốt và thanh toán</span>
                  ) : (
                    <span className="badge" style={{ background: "#fef3c7", color: "#92400e", padding: "0.3rem 0.75rem", borderRadius: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>Chờ quản lý duyệt</span>
                  )}
                </div>
              </div>

              <div style={{ padding: "1.5rem", background: "#fffdfa" }}>
                <div style={{ borderBottom: "1px dashed #ccc", paddingBottom: "1rem", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ color: "#555" }}>Họ tên NV:</span>
                    <strong style={{ fontSize: "1.1rem" }}>{info?.fullName}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#555" }}>Chức vụ:</span>
                    <span>{info?.role}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#444" }}>Lương cơ bản (Tháng):</span>
                    <span>{formatVnd(selected.baseSalary)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#444" }}>Công chuẩn:</span>
                    <span>{selected.standardDays} ngày</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#444" }}>Công làm thực tế:</span>
                    <strong>{selected.actualWorkedDays} ngày</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#444" }}>Lương thời gian:</span>
                    <span style={{ fontWeight: "bold" }}>{formatVnd(Math.round(selected.dailyRate * selected.actualWorkedDays))}</span>
                  </div>

                  <div style={{ height: 1, background: "#e5e7eb", margin: "0.5rem 0" }} />

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#444" }}>Phụ cấp:</span>
                    <span>+ {formatVnd(selected.allowance)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#444" }}>Thưởng chung toàn cửa hàng:</span>
                    <span>+ {formatVnd(selected.globalBonus)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: selected.individualBonus < 0 ? "#dc2626" : (selected.individualBonus > 0 ? "#16a34a" : "#444"), fontWeight: selected.individualBonus !== 0 ? "bold" : "normal" }}>
                    <span>Thưởng / Phạt riêng:</span>
                    <span>{selected.individualBonus > 0 ? "+" : ""}{formatVnd(selected.individualBonus)}</span>
                  </div>
                </div>

                <div style={{ background: "#f3f4f6", padding: "1.25rem", borderRadius: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb" }}>
                  <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>THỰC LÃNH:</span>
                  <strong style={{ fontSize: "1.5rem", color: "var(--primary)" }}>{formatVnd(selected.netSalary)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
