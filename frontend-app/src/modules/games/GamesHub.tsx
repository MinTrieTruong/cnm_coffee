import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import { Badge, EmptyState, RecordList, fmtDateTime } from "../../components/erp";
import { useRecordNav, useResource } from "../shared";
import { GAMES_BASE } from "./GameCampaignDetail";
import { GAME_TYPES, GAME_UI } from "./registry";
import type { CampaignRow, GameType } from "./types";

function statusOf(c: CampaignRow) {
  if (!c.isActive) return { label: "Tắt", tone: "neutral" as const };
  const now = Date.now();
  if (+new Date(c.startAt) > now) return { label: "Sắp diễn ra", tone: "info" as const };
  if (+new Date(c.endAt) < now) return { label: "Đã kết thúc", tone: "neutral" as const };
  return { label: "Đang chạy", tone: "success" as const };
}

/** CRM › Mini game: thẻ cho từng loại game + danh sách chiến dịch của loại đang chọn */
export function GamesHub() {
  const [type, setType] = useState<GameType>("WHEEL");
  const nav = useNavigate();
  const go = useRecordNav(GAMES_BASE);
  const { data: all, loading, error } = useResource<CampaignRow[]>("/api/admin/games/campaigns", []);
  const rows = all.filter((c) => c.gameType === type);
  const ui = GAME_UI[type];

  return (
    <div className="o-stack" style={{ gap: 16 }}>
      <div className="gm-hub">
        {GAME_TYPES.map((t) => {
          const g = GAME_UI[t];
          const count = all.filter((c) => c.gameType === t).length;
          return (
            <button
              key={t}
              type="button"
              className={`gm-hub-card${type === t ? " active" : ""}${g.ready ? "" : " soon"}`}
              disabled={!g.ready}
              onClick={() => setType(t)}
            >
              <span className="gm-hub-icon"><g.icon size={20} aria-hidden /></span>
              <span className="gm-hub-text">
                <strong>{g.label}</strong>
                <span className="o-muted">{g.description}</span>
              </span>
              {g.ready ? <Badge tone="primary">{count} chiến dịch</Badge> : <Badge>Sắp ra mắt</Badge>}
            </button>
          );
        })}
      </div>

      <RecordList
        crumbs={[{ label: "Mini game" }, { label: ui.label }]}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        onOpen={(c) => go.open(c.id)}
        onCreate={ui.ready ? () => nav(`${GAMES_BASE}/new?type=${type}`) : undefined}
        searchText={(c) => c.name}
        columns={[
          { key: "name", label: "Tên chiến dịch", value: (c) => c.name, render: (c) => <strong>{c.name}</strong> },
          { key: "time", label: "Thời gian", value: (c) => c.startAt, render: (c) => <span>{fmtDateTime(c.startAt)} → {fmtDateTime(c.endAt)}</span> },
          { key: "stores", label: "Chi nhánh", value: (c) => (c.allStores ? "Cả chuỗi" : c.stores.map((s) => s.store.name).join(", ")), wrap: true },
          { key: "status", label: "Trạng thái", value: (c) => statusOf(c).label, render: (c) => <Badge tone={statusOf(c).tone}>{statusOf(c).label}</Badge> },
          { key: "plays", label: "Số lượt quay", value: (c) => c.playCount, numeric: true },
          { key: "won", label: "Số giải đã phát", value: (c) => c.wonCount ?? 0, numeric: true },
        ]}
        filters={[
          { id: "running", label: "Đang chạy", test: (c) => statusOf(c).label === "Đang chạy" },
          { id: "off", label: "Đã tắt", test: (c) => !c.isActive },
        ]}
        emptyState={<EmptyState icon={Gamepad2} title={`Chưa có chiến dịch ${ui.label.toLowerCase()}`} hint="Bấm Tạo mới để cấu hình giải thưởng và bắt đầu." />}
      />
    </div>
  );
}
