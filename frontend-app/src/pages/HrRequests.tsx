import { useEffect, useState } from "react";
import { format } from "date-fns";
import { staffApi } from "../lib/staffApi";

type RequestType = "LEAVE" | "SWAP" | "ATTENDANCE";

export function HrRequests() {
  const [activeTab, setActiveTab] = useState<RequestType>("LEAVE");
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [mySchedules, setMySchedules] = useState<any[]>([]);
  
  // Load history
  const loadHistory = async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === "LEAVE" ? "/api/hr/leave" : activeTab === "SWAP" ? "/api/hr/swap" : "/api/hr/attendance";
      const data = await staffApi<any[]>(endpoint);
      setHistory(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [activeTab]);

  useEffect(() => {
    if (showForm && activeTab === "SWAP") {
      staffApi<any>("/staff/members")
        .then(res => setStaffMembers(Array.isArray(res) ? res : (res?.data || [])))
        .catch(err => {
          console.error(err);
          setStaffMembers([]);
        });
      staffApi<any>("/schedule/my")
        .then(res => setMySchedules(Array.isArray(res) ? res : (res?.data || [])))
        .catch(err => {
          console.error(err);
          setMySchedules([]);
        });
    }
  }, [showForm, activeTab]);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 800, margin: "0 auto", color: "#111827" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#111827" }}>Đề xuất cá nhân</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Tạo đề xuất mới</button>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "0.5rem" }}>
        <button 
          style={{ fontWeight: 600, color: activeTab === "LEAVE" ? "var(--accent)" : "#6b7280", background: "none", border: "none", cursor: "pointer" }}
          onClick={() => setActiveTab("LEAVE")}>Xin nghỉ</button>
        <button 
          style={{ fontWeight: 600, color: activeTab === "SWAP" ? "var(--accent)" : "#6b7280", background: "none", border: "none", cursor: "pointer" }}
          onClick={() => setActiveTab("SWAP")}>Đổi ca</button>
        <button 
          style={{ fontWeight: 600, color: activeTab === "ATTENDANCE" ? "var(--accent)" : "#6b7280", background: "none", border: "none", cursor: "pointer" }}
          onClick={() => setActiveTab("ATTENDANCE")}>Giải trình chấm công</button>
      </div>

      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {history.length === 0 && <p style={{ color: "#6b7280", textAlign: "center", padding: "2rem" }}>Chưa có đề xuất nào.</p>}
          {history.map(item => (
            <div key={item.id} style={{ padding: "1rem", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <strong>
                  {activeTab === "LEAVE" && `Xin nghỉ: ${item.leaveType === "FULL_DAY" ? "Cả ngày" : "Nửa ngày"} - ${format(new Date(item.date), "dd/MM/yyyy")}`}
                  {activeTab === "SWAP" && `Đổi ca: Mã lịch ${item.scheduleId}`}
                  {activeTab === "ATTENDANCE" && `Giải trình: ${item.adjustmentType} - ${format(new Date(item.date), "dd/MM/yyyy")}`}
                </strong>
                <span style={{
                  padding: "0.25rem 0.5rem", borderRadius: 4, fontSize: "0.8rem", fontWeight: 700,
                  background: item.status === "APPROVED" ? "#dcfce3" : item.status === "REJECTED" ? "#fee2e2" : "#fef3c7",
                  color: item.status === "APPROVED" ? "#166534" : item.status === "REJECTED" ? "#991b1b" : "#92400e"
                }}>{item.status}</span>
              </div>
              <p style={{ margin: 0, color: "#4b5563", fontSize: "0.9rem" }}>Lý do: {item.reason}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: "2.5rem 2rem 2rem", borderRadius: 12, width: "100%", maxWidth: 500, color: "#111827", position: "relative" }}>
            <button 
              type="button"
              onClick={() => setShowForm(false)} 
              style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            >
              &times;
            </button>
            <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "#111827", fontSize: "1.25rem", fontWeight: 700 }}>
              Tạo đề xuất - {activeTab === "LEAVE" ? "Xin nghỉ" : activeTab === "SWAP" ? "Đổi ca" : "Giải trình"}
            </h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const payload: Record<string, any> = Object.fromEntries(formData.entries());
              
              const endpoint = activeTab === "LEAVE" ? "/api/hr/leave" : activeTab === "SWAP" ? "/api/hr/swap" : "/api/hr/attendance";
              if (payload.targetUserId) payload.targetUserId = Number(payload.targetUserId);
              if (payload.scheduleId) payload.scheduleId = Number(payload.scheduleId);
              
              try {
                await staffApi(endpoint, { method: "POST", body: JSON.stringify(payload) });
                setShowForm(false);
                loadHistory();
              } catch (err) {
                alert("Lỗi khi tạo đề xuất");
              }
            }}>
              {activeTab === "LEAVE" && (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Ngày</label>
                    <input type="date" name="date" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }} />
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Loại</label>
                    <select name="leaveType" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }}>
                      <option value="FULL_DAY">Cả ngày</option>
                      <option value="HALF_DAY">Nửa ngày</option>
                    </select>
                  </div>
                </>
              )}
              {activeTab === "SWAP" && (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Ca muốn đổi</label>
                    <select name="scheduleId" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }}>
                      <option value="">-- Chọn ca của bạn --</option>
                      {(Array.isArray(mySchedules) ? mySchedules : []).map(sch => (
                        <option key={sch.id} value={sch.id}>
                          {sch.workDate ? format(new Date(sch.workDate), "dd/MM/yyyy") : `ID: ${sch.id}`} {sch.shift ? `(${sch.shift.startTime} - ${sch.shift.endTime})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Đổi cho ai?</label>
                    <select name="targetUserId" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }}>
                      <option value="">-- Chọn đồng nghiệp --</option>
                      {(Array.isArray(staffMembers) ? staffMembers : []).map(staff => (
                        <option key={staff.id} value={staff.id}>
                          {staff.fullName || staff.name || staff.username || `ID: ${staff.id}`} {staff.role ? `(${staff.role})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {activeTab === "ATTENDANCE" && (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Ngày</label>
                    <input type="date" name="date" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }} />
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Loại giải trình</label>
                    <select name="adjustmentType" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }}>
                      <option value="FORGET_CHECKIN">Quên check-in</option>
                      <option value="FORGET_CHECKOUT">Quên check-out</option>
                      <option value="LATE_IN">Vào trễ</option>
                      <option value="EARLY_OUT">Ra sớm</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Giờ đề xuất (YYYY-MM-DDTHH:mm)</label>
                    <input type="datetime-local" name="proposedTime" required className="input" style={{ width: "100%", color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db" }} />
                  </div>
                </>
              )}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "#4b5563", fontWeight: 500 }}>Lý do</label>
                <textarea name="reason" required className="input" style={{ width: "100%", height: 80, color: "#111827", background: "#f9fafb", border: "1px solid #d1d5db", resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-ghost" style={{ color: "#4b5563" }} onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Gửi đề xuất</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
