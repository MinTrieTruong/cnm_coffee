import { Suspense, useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { GAME_UI } from "../modules/games/registry";
import type { PublicCampaign } from "../modules/games/types";
import "../styles/games.css";

/** /game/:campaignId — trang chơi chung, render giao diện riêng theo loại game (GAME_UI[gameType].PlayView) */
export function GamePlay() {
  const { campaignId } = useParams();
  const [params] = useSearchParams();
  const store = params.get("store");
  const storeId = store && /^\d+$/.test(store) ? Number(store) : null;
  const [c, setC] = useState<PublicCampaign | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setC(await api<PublicCampaign>(`/api/games/${campaignId}${storeId ? `?store=${storeId}` : ""}`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tải được chương trình.");
    }
  }, [campaignId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) {
    return (
      <div className="gw-page">
        <div className="gw-note">{err}</div>
        <Link className="gw-btn" to="/">Về trang chủ</Link>
      </div>
    );
  }
  if (!c) return <div className="gw-page"><div className="gw-note">Đang tải…</div></div>;
  const PlayView = GAME_UI[c.gameType]?.PlayView;
  if (!PlayView) return <div className="gw-page"><div className="gw-note">Trò chơi này sắp ra mắt.</div></div>;

  return (
    <div className="gw-page">
      <Suspense fallback={<div className="gw-note">Đang tải…</div>}>
        <PlayView campaign={c} storeId={storeId} onPlayed={() => void load()} />
      </Suspense>
    </div>
  );
}
