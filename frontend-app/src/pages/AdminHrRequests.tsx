import { useEffect, useState } from "react";
import { format } from "date-fns";
import { staffApi } from "../lib/staffApi";

type RequestType = "LEAVE" | "SWAP" | "ATTENDANCE";

export function AdminHrRequests() {
  const [activeTab, setActiveTab] = useState<RequestType>("LEAVE");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === "LEAVE" ? "/api/hr/leave" : activeTab === "SWAP" ? "/api/hr/swap" : "/api/hr/attendance";
      const data = await staffApi<any[]>(endpoint);
      setRequests(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [activeTab]);

  const handleReview = async (id: number, status: "APPROVED" | "REJECTED") => {
    if (!confirm(`Xác nhận ${status === "APPROVED" ? "DUYỆT" : "TỪ CHỐI"} đề xuất này?`)) return;
    try {
      const endpoint = activeTab === "LEAVE" ? `/api/hr/leave/${id}/review` 
        : activeTab === "SWAP" ? `/api/hr/swap/${id}/review` 
        : `/api/hr/attendance/${id}/review`;
      await staffApi(endpoint, {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      loadRequests();
    } catch (e) {
      alert("Lỗi xử lý đề xuất.");
    }
  };

  const pendingRequests = requests.filter(r => r.status === "PENDING");
  const processedRequests = requests.filter(r => r.status !== "PENDING");

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "0.5rem" }}>
        <button 
          style={{ fontWeight: 600, color: activeTab === "LEAVE" ? "var(--accent)" : "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}
          onClick={() => setActiveTab("LEAVE")}>Xin nghỉ</button>
        <button 
          style={{ fontWeight: 600, color: activeTab === "SWAP" ? "var(--accent)" : "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}
          onClick={() => setActiveTab("SWAP")}>Đổi ca</button>
        <button 
          style={{ fontWeight: 600, color: activeTab === "ATTENDANCE" ? "var(--accent)" : "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}
          onClick={() => setActiveTab("ATTENDANCE")}>Giải trình chấm công</button>
      </div>

      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <section>
            <h3 style={{ marginBottom: "1rem", color: "var(--accent)" }}>Chờ duyệt ({pendingRequests.length})</h3>
            {pendingRequests.length === 0 ? <p style={{ color: "#6b7280" }}>Không có đề xuất chờ duyệt.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {pendingRequests.map(r => (
                  <div key={r.id} style={{ padding: "1rem", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "flex-start" }}>
                      <div>
                        <strong>{r.user?.fullName || r.requester?.fullName}</strong> - 
                        <span style={{ marginLeft: "0.5rem", color: "#4b5563" }}>
                          {activeTab === "LEAVE" && `${r.leaveType === "FULL_DAY" ? "Nghỉ Cả ngày" : "Nghỉ Nửa ngày"} (${format(new Date(r.date), "dd/MM/yyyy")})`}
                          {activeTab === "SWAP" && `Đổi ca lịch #${r.scheduleId} cho ${r.targetUser?.fullName}`}
                          {activeTab === "ATTENDANCE" && `${r.adjustmentType} (${format(new Date(r.date), "dd/MM/yyyy")})`}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn btn-primary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", background: "#15803d", borderColor: "#15803d" }} onClick={() => handleReview(r.id, "APPROVED")}>Duyệt</button>
                        <button className="btn btn-primary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", background: "#b91c1c", borderColor: "#b91c1c" }} onClick={() => handleReview(r.id, "REJECTED")}>Từ chối</button>
                      </div>
                    </div>
                    <p style={{ margin: 0, color: "#374151", fontSize: "0.9rem" }}>Lý do: <strong>{r.reason}</strong></p>
                    {activeTab === "ATTENDANCE" && <p style={{ margin: "0.25rem 0 0", color: "#374151", fontSize: "0.9rem" }}>Giờ đề xuất: <strong>{format(new Date(r.proposedTime), "dd/MM/yyyy HH:mm")}</strong></p>}
                    {activeTab === "SWAP" && <p style={{ margin: "0.25rem 0 0", color: "#374151", fontSize: "0.9rem" }}>Phản hồi người nhận: <strong>{r.targetUserStatus}</strong></p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 style={{ marginBottom: "1rem", color: "#6b7280" }}>Đã xử lý</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {processedRequests.map(r => (
                <div key={r.id} style={{ padding: "1rem", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div>
                      <strong>{r.user?.fullName || r.requester?.fullName}</strong> - 
                      <span style={{ marginLeft: "0.5rem", color: "#4b5563" }}>
                        {activeTab === "LEAVE" && `${r.leaveType === "FULL_DAY" ? "Nghỉ Cả ngày" : "Nghỉ Nửa ngày"} (${format(new Date(r.date), "dd/MM/yyyy")})`}
                        {activeTab === "SWAP" && `Đổi ca lịch #${r.scheduleId} cho ${r.targetUser?.fullName}`}
                        {activeTab === "ATTENDANCE" && `${r.adjustmentType} (${format(new Date(r.date), "dd/MM/yyyy")})`}
                      </span>
                    </div>
                    <span style={{
                      padding: "0.25rem 0.5rem", borderRadius: 4, fontSize: "0.8rem", fontWeight: 700,
                      background: r.status === "APPROVED" ? "#dcfce3" : "#fee2e2",
                      color: r.status === "APPROVED" ? "#166534" : "#991b1b"
                    }}>{r.status}</span>
                  </div>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Lý do: {r.reason}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
