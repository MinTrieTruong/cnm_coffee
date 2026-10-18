import { useState, useEffect, useCallback } from "react";
import { staffApi } from "../lib/staffApi";

type Payslip = {
  id: number;
  staffId: number;
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
  staff: { fullName: string };
};

type PayrollConfig = {
  id: number;
  defaultDaysOff: number;
  globalBonus: number;
};

function formatVnd(val: number) {
  return new Intl.NumberFormat("vi-VN").format(val) + " đ";
}

export function AdminPayroll() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [, setConfig] = useState<PayrollConfig | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Config modal
  const [showConfig, setShowConfig] = useState(false);
  const [cfgDaysOff, setCfgDaysOff] = useState(4);
  const [cfgBonus, setCfgBonus] = useState(0);

  // Edit bonus
  const [editingBonusId, setEditingBonusId] = useState<number | null>(null);
  const [tempBonus, setTempBonus] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const c = await staffApi<PayrollConfig>("/api/payroll/config");
      setConfig(c);
      setCfgDaysOff(c.defaultDaysOff);
      setCfgBonus(c.globalBonus);

      const p = await staffApi<Payslip[]>(`/api/payroll/calculate?month=${month}&year=${year}`);
      setPayslips(p);
    } catch (e: any) {
      setErr(e.message || "Lỗi tải bảng lương");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function saveConfig() {
    try {
      await staffApi("/api/payroll/config", {
        method: "POST",
        body: JSON.stringify({ defaultDaysOff: cfgDaysOff, globalBonus: cfgBonus })
      });
      setShowConfig(false);
      void loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function saveBonus(payslipId: number) {
    try {
      await staffApi("/api/payroll/update-bonus", {
        method: "POST",
        body: JSON.stringify({ payslipId, individualBonus: tempBonus })
      });
      setEditingBonusId(null);
      void loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function finalize() {
    if (!confirm("Bạn có chắc chắn muốn chốt lương tháng này? Không thể sửa đổi sau khi chốt.")) return;
    try {
      await staffApi("/api/payroll/finalize", {
        method: "POST",
        body: JSON.stringify({ month, year })
      });
      alert("Đã chốt lương thành công!");
      void loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function exportExcel() {
    const token = localStorage.getItem("staff_token");
    const url = `/api/payroll/export?month=${month}&year=${year}&token=${token}`;
    window.open(url, "_blank");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Bảng Lương</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
          </select>
          <input className="input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 80 }} />
          <button className="btn btn-outline" onClick={() => setShowConfig(true)}>Cấu hình</button>
        </div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}
      
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={finalize} disabled={payslips.length === 0 || payslips.every(p => p.status === "PAID")}>Chốt Lương</button>
        <button className="btn btn-outline" onClick={exportExcel}>Xuất Excel</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Mã NV</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Tên NV</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Lương CB</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Công chuẩn</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Ngày làm TT</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Phụ cấp</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Thưởng chung</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Thưởng riêng</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Thực lãnh</th>
              <th style={{ padding: "0.5rem", border: "1px solid #ddd" }}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={10} style={{ textAlign: "center", padding: "1rem" }}>Đang tính toán...</td></tr> : 
             payslips.length === 0 ? <tr><td colSpan={10} style={{ textAlign: "center", padding: "1rem" }}>Không có dữ liệu</td></tr> : 
             payslips.map(p => (
              <tr key={p.id}>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "center" }}>{p.staffId}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>{p.staff.fullName}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "right" }}>{formatVnd(p.baseSalary)}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "center" }}>{p.standardDays}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "center", fontWeight: "bold" }}>{p.actualWorkedDays}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "right" }}>{formatVnd(p.allowance)}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "right" }}>{formatVnd(p.globalBonus)}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "right", cursor: p.status === "PENDING" ? "pointer" : "default", background: p.status === "PENDING" ? "#fff9c4" : "inherit" }}
                    onClick={() => {
                      if (p.status === "PENDING") {
                        setEditingBonusId(p.id);
                        setTempBonus(p.individualBonus);
                      }
                    }}>
                  {editingBonusId === p.id ? (
                    <input type="number" autoFocus className="input" style={{ width: 100 }} value={tempBonus} 
                      onChange={e => setTempBonus(Number(e.target.value))} 
                      onBlur={() => saveBonus(p.id)}
                      onKeyDown={e => e.key === "Enter" && saveBonus(p.id)} />
                  ) : formatVnd(p.individualBonus)}
                </td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "right", fontWeight: "bold", color: "#b91c1c" }}>{formatVnd(p.netSalary)}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #ddd", textAlign: "center" }}>
                  {p.status === "PAID" ? <span style={{ color: "green" }}>Đã chốt</span> : <span style={{ color: "orange" }}>Chờ chốt</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showConfig && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ marginTop: 0 }}>Cấu hình Lương</h2>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Số ngày nghỉ tiêu chuẩn / tháng</label>
              <input type="number" className="input" value={cfgDaysOff} onChange={e => setCfgDaysOff(Number(e.target.value))} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Thưởng chung toàn công ty (VND)</label>
              <input type="number" className="input" value={cfgBonus} onChange={e => setCfgBonus(Number(e.target.value))} />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-primary" onClick={saveConfig}>Lưu Cấu Hình</button>
              <button className="btn btn-ghost" onClick={() => setShowConfig(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
