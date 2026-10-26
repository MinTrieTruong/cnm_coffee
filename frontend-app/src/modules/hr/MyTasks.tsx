import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, ClipboardCheck, RotateCcw, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, staffApi } from "../../lib/staffApi";
import { compressImage, doneCount, todayYmd, type WorkTask } from "../../lib/tasks";
import { Alert, Button, EmptyState, PageHeader, errMsg } from "../../components/erp";
import { DayNav, TaskMeta, doneTime, useTaskSocket } from "./taskParts";

/** Báo cho badge sidebar / thanh đáy tính lại */
const changed = () => window.dispatchEvent(new Event("td:tasks-changed"));

/** Việc được giao cho tôi trong một ngày (dùng ở màn "Việc được giao" và Bảng điều khiển) */
export function useMyTasks(date: string) {
  const me = getStaffInfo()?.id;
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setTasks((await staffApi<{ tasks: WorkTask[] }>(`/api/tasks/my?date=${date}`)).tasks);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useTaskSocket(me ? [`staff_${me}`] : [], () => void load());
  const replace = (t: WorkTask) => {
    setTasks((x) => x.map((y) => (y.id === t.id ? t : y)));
    changed();
  };
  return { tasks, loading, error, reload: load, replace, me };
}

/** Một việc: nút báo xong + ghi chú / ảnh (mở khi bấm) */
export function MyTaskItem({ task, me, onChange, compact }: { task: WorkTask; me: number | undefined; onChange: (t: WorkTask) => void; compact?: boolean }) {
  const mine = task.assignees.find((a) => a.staffId === me);
  const done = mine?.status === "DONE";
  const others = task.assignees.filter((a) => a.staffId !== me);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (task.requirePhoto && !photo) return setErr("Việc này cần chụp ảnh xác nhận.");
    setBusy(true);
    try {
      onChange(await staffApi<WorkTask>(`/api/tasks/${task.id}/done`, { method: "POST", body: JSON.stringify({ note, photoDataUrl: photo ?? undefined }) }));
      setOpen(false);
      setNote("");
      setPhoto(null);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    setBusy(true);
    try {
      onChange(await staffApi<WorkTask>(`/api/tasks/${task.id}/undo`, { method: "POST" }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  // Không cần ghi chú/ảnh → bấm là xong
  const quick = () => (task.requirePhoto ? setOpen(true) : void submit());

  return (
    <li className={done ? "o-mytask is-done" : "o-mytask"}>
      <button
        type="button"
        className="o-mytask-check"
        onClick={() => (done ? void undo() : quick())}
        disabled={busy}
        aria-pressed={done}
        aria-label={done ? `Bỏ đánh dấu xong: ${task.title}` : `Báo xong: ${task.title}`}
      >
        {done ? <Check size={18} strokeWidth={2.5} aria-hidden /> : null}
      </button>
      <div className="o-mytask-body">
        <div className="o-mytask-title">{task.title}</div>
        <TaskMeta task={task} />
        {mine?.redoNote && !done && <div className="o-mytask-redo"><RotateCcw size={14} aria-hidden /> Làm lại: {mine.redoNote}</div>}
        {!compact && task.description && <p className="o-mytask-desc">{task.description}</p>}
        {!compact && (
          <div className="o-mytask-sub">
            Giao bởi {task.createdBy.fullName}
            {others.length > 0 && ` · làm cùng ${others.map((o) => o.staff.fullName).join(", ")} (${doneCount(task) - (done ? 1 : 0)}/${others.length} đã xong)`}
            {done && mine?.doneAt && ` · bạn xong lúc ${doneTime(mine.doneAt)}`}
          </div>
        )}
        {done && mine?.photoUrl && !compact && (
          <a href={mediaUrl(mine.photoUrl)} target="_blank" rel="noreferrer" className="o-task-photo is-lg"><img src={mediaUrl(mine.photoUrl)} alt="Ảnh xác nhận" /></a>
        )}
        {err && <div className="o-mytask-err">{err}</div>}
        {!done && !compact && !open && (
          <button type="button" className="o-btn o-btn-link o-btn-sm o-mytask-more" onClick={() => setOpen(true)}>
            <Camera size={14} aria-hidden /> Thêm ghi chú / ảnh khi báo xong
          </button>
        )}
        {open && !done && (
          <div className="o-mytask-form">
            <textarea className="o-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" maxLength={500} />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setPhoto(await compressImage(f));
                } catch (ex) {
                  setErr(errMsg(ex));
                }
              }}
            />
            <div className="o-mytask-form-row">
              {photo ? (
                <span className="o-task-photo is-lg">
                  <img src={photo} alt="Ảnh vừa chụp" />
                  <button type="button" onClick={() => setPhoto(null)} aria-label="Bỏ ảnh"><X size={14} /></button>
                </span>
              ) : (
                <Button icon={Camera} onClick={() => fileRef.current?.click()}>{task.requirePhoto ? "Chụp ảnh (bắt buộc)" : "Chụp ảnh"}</Button>
              )}
              <span style={{ flex: 1 }} />
              <Button onClick={() => setOpen(false)}>Hủy</Button>
              <Button variant="primary" icon={CheckCircle2} onClick={() => void submit()} disabled={busy}>Báo xong</Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** Nhân sự › Công việc › Việc được giao */
export function MyTasks() {
  const [date, setDate] = useState(todayYmd);
  const { tasks, loading, error, replace, me } = useMyTasks(date);
  const mineDone = tasks.filter((t) => t.assignees.some((a) => a.staffId === me && a.status === "DONE")).length;
  const todo = tasks.filter((t) => !t.assignees.some((a) => a.staffId === me && a.status === "DONE"));
  const done = tasks.filter((t) => t.assignees.some((a) => a.staffId === me && a.status === "DONE"));

  return (
    <div className="o-dash">
      <PageHeader title="Việc được giao" description="Làm xong việc nào thì bấm vào ô tròn để báo cho quản lý" actions={<DayNav value={date} onChange={setDate} />} />
      {error && <Alert>{error}</Alert>}
      {tasks.length > 0 && (
        <div className="o-dcard o-mytask-summary">
          <div>
            <strong>{mineDone}/{tasks.length}</strong> việc đã xong
          </div>
          <div className="o-task-progress"><span style={{ width: `${(mineDone / tasks.length) * 100}%` }} /></div>
        </div>
      )}
      {loading && !tasks.length ? (
        <div className="o-muted">Đang tải…</div>
      ) : !tasks.length ? (
        <EmptyState icon={ClipboardCheck} title="Không có việc nào được giao" hint="Khi quản lý giao việc, việc sẽ hiện ở đây và trên Bảng điều khiển." />
      ) : (
        <>
          {todo.length > 0 && (
            <section className="o-dcard">
              <h2 className="o-dcard-title" style={{ marginBottom: 8 }}>Cần làm ({todo.length})</h2>
              <ul className="o-mytasks">{todo.map((t) => <MyTaskItem key={t.id} task={t} me={me} onChange={replace} />)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section className="o-dcard">
              <h2 className="o-dcard-title" style={{ marginBottom: 8 }}>Đã xong ({done.length})</h2>
              <ul className="o-mytasks">{done.map((t) => <MyTaskItem key={t.id} task={t} me={me} onChange={replace} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
