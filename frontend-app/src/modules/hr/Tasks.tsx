import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, ClipboardCheck, Copy, ListTodo, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { staffApi } from "../../lib/staffApi";
import { roleLabel } from "../../lib/roles";
import { Alert, Button, EmptyState, KpiCard, Modal, PageHeader, errMsg } from "../../components/erp";
import { TASK_PRESETS, doneCount, isOverdue, minToTime, shiftDay, timeToMin, todayYmd, type Assignable, type WorkTask } from "../../lib/tasks";
import { DayNav, TaskMeta, doneTime, useTaskSocket } from "./taskParts";

type View = "task" | "staff";

/** Nhân sự › Công việc › Giao việc (Quản lý chi nhánh) */
export function TaskBoard() {
  const [date, setDate] = useState(todayYmd);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<View>("task");
  const [editing, setEditing] = useState<WorkTask | "new" | null>(null);
  const [redo, setRedo] = useState<{ task: WorkTask; staffId: number; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await staffApi<{ tasks: WorkTask[]; areas: string[] }>(`/api/tasks?date=${date}`);
      setTasks(r.tasks);
      setAreas(r.areas);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useTaskSocket(["admin_room"], () => void load());

  const total = tasks.reduce((s, t) => s + t.assignees.length, 0);
  const done = tasks.reduce((s, t) => s + doneCount(t), 0);
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const finished = tasks.filter((t) => t.assignees.length && doneCount(t) === t.assignees.length).length;

  async function remove(t: WorkTask) {
    if (!confirm(`Xóa việc "${t.title}"?`)) return;
    try {
      await staffApi(`/api/tasks/${t.id}`, { method: "DELETE" });
      setTasks((x) => x.filter((y) => y.id !== t.id));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function copyFromYesterday() {
    const from = shiftDay(date, -1);
    if (!confirm(`Chép toàn bộ việc của ngày ${from.split("-").reverse().join("/")} sang ngày đang xem?`)) return;
    try {
      const r = await staffApi<{ count: number }>("/api/tasks/copy", { method: "POST", body: JSON.stringify({ from, to: date }) });
      setMsg(`Đã chép ${r.count} việc.`);
      void load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  // Theo nhân viên: gom việc theo người được giao
  const byStaff = useMemo(() => {
    const m = new Map<number, { name: string; role: string; items: { task: WorkTask; status: string }[] }>();
    for (const t of tasks)
      for (const a of t.assignees) {
        const row = m.get(a.staffId) ?? m.set(a.staffId, { name: a.staff.fullName, role: a.staff.role, items: [] }).get(a.staffId)!;
        row.items.push({ task: t, status: a.status });
      }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "vi"));
  }, [tasks]);

  return (
    <div className="o-dash">
      <PageHeader
        title="Giao việc"
        description="Giao việc trong ngày (vệ sinh khu vực, kiểm kê, chuẩn bị…) và theo dõi ai đã làm xong"
        actions={
          <>
            <DayNav value={date} onChange={setDate} />
            <Button icon={Copy} onClick={() => void copyFromYesterday()}>Chép từ hôm trước</Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Giao việc mới</Button>
          </>
        }
      />
      {err && <Alert>{err}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      <div className="o-dash-kpis">
        <KpiCard icon={ListTodo} tone="primary" label="Việc trong ngày" value={tasks.length} sub={`${total} lượt giao`} />
        <KpiCard icon={CheckCircle2} tone="green" label="Đã xong" value={`${done}/${total}`} sub={`${finished} việc hoàn tất`} />
        <KpiCard icon={Circle} tone="orange" label="Chưa xong" value={total - done} sub="Lượt chưa báo xong" />
        <KpiCard icon={AlertTriangle} tone="red" label="Quá hạn" value={overdue} sub="Đã qua giờ hạn" />
      </div>

      <div className="o-seg" role="tablist" aria-label="Kiểu xem">
        <button type="button" role="tab" aria-selected={view === "task"} className={view === "task" ? "active" : ""} onClick={() => setView("task")}>
          <ClipboardCheck size={16} aria-hidden /> Theo việc
        </button>
        <button type="button" role="tab" aria-selected={view === "staff"} className={view === "staff" ? "active" : ""} onClick={() => setView("staff")}>
          <Users size={16} aria-hidden /> Theo nhân viên
        </button>
      </div>

      {loading && !tasks.length ? (
        <div className="o-muted">Đang tải…</div>
      ) : !tasks.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa giao việc nào cho ngày này"
          hint="Giao việc cho một hoặc nhiều nhân viên, ví dụ: vệ sinh Khu A trước 10:00."
          action={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Giao việc mới</Button>}
        />
      ) : view === "task" ? (
        <div className="o-task-grid">
          {tasks.map((t) => {
            const n = doneCount(t);
            const all = t.assignees.length;
            return (
              <article key={t.id} className={isOverdue(t) ? "o-dcard o-task is-late" : n === all ? "o-dcard o-task is-done" : "o-dcard o-task"}>
                <header className="o-task-head">
                  <div className="o-task-titles">
                    <h3 className="o-task-title">{t.title}</h3>
                    <TaskMeta task={t} />
                  </div>
                  <div className="o-task-tools">
                    <Button variant="link" size="sm" icon={Pencil} aria-label="Sửa" onClick={() => setEditing(t)} />
                    <Button variant="link" size="sm" icon={Trash2} aria-label="Xóa" onClick={() => void remove(t)} />
                  </div>
                </header>
                {t.description && <p className="o-task-desc">{t.description}</p>}
                <div className="o-task-progress" aria-label={`${n}/${all} người đã xong`}>
                  <span style={{ width: `${all ? (n / all) * 100 : 0}%` }} />
                </div>
                <ul className="o-task-people">
                  {t.assignees.map((a) => (
                    <li key={a.id} className={a.status === "DONE" ? "is-done" : undefined}>
                      {a.status === "DONE" ? <CheckCircle2 size={18} className="o-task-ok" aria-label="Đã xong" /> : <Circle size={18} className="o-task-todo" aria-label="Chưa xong" />}
                      <span className="o-task-person">
                        <strong>{a.staff.fullName}</strong>
                        <span>
                          {roleLabel(a.staff.role)}
                          {a.status === "DONE" && ` · xong lúc ${doneTime(a.doneAt)}`}
                          {a.status !== "DONE" && a.redoNote && ` · làm lại: ${a.redoNote}`}
                        </span>
                        {a.note && <em>“{a.note}”</em>}
                      </span>
                      {a.photoUrl && (
                        <a href={mediaUrl(a.photoUrl)} target="_blank" rel="noreferrer" className="o-task-photo" aria-label="Xem ảnh xác nhận">
                          <img src={mediaUrl(a.photoUrl)} alt="" />
                        </a>
                      )}
                      {a.status === "DONE" && (
                        <Button variant="link" size="sm" icon={RotateCcw} onClick={() => setRedo({ task: t, staffId: a.staffId, name: a.staff.fullName })}>Làm lại</Button>
                      )}
                    </li>
                  ))}
                </ul>
                <footer className="o-task-foot">Giao bởi {t.createdBy.fullName}</footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="o-task-grid">
          {byStaff.map(([id, s]) => {
            const n = s.items.filter((i) => i.status === "DONE").length;
            return (
              <article key={id} className="o-dcard o-task">
                <header className="o-task-head">
                  <div className="o-task-titles">
                    <h3 className="o-task-title">{s.name}</h3>
                    <span className="o-muted">{roleLabel(s.role)} · xong {n}/{s.items.length}</span>
                  </div>
                </header>
                <ul className="o-task-people">
                  {s.items.map(({ task, status }) => (
                    <li key={task.id} className={status === "DONE" ? "is-done" : undefined}>
                      {status === "DONE" ? <CheckCircle2 size={18} className="o-task-ok" aria-label="Đã xong" /> : <Circle size={18} className="o-task-todo" aria-label="Chưa xong" />}
                      <span className="o-task-person">
                        <strong>{task.title}</strong>
                        <span>
                          {[task.area, task.dueMin != null ? `hạn ${minToTime(task.dueMin)}` : null].filter(Boolean).join(" · ") || "Trong ngày"}
                          {isOverdue(task) && status !== "DONE" && " · quá hạn"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <TaskForm
          date={date}
          task={editing === "new" ? null : editing}
          areas={areas}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg(text);
            void load();
          }}
        />
      )}
      {redo && (
        <RedoDialog
          {...redo}
          onClose={() => setRedo(null)}
          onDone={(t) => {
            setRedo(null);
            setTasks((x) => x.map((y) => (y.id === t.id ? t : y)));
          }}
        />
      )}
    </div>
  );
}

function TaskForm({ date, task, areas, onClose, onSaved }: { date: string; task: WorkTask | null; areas: string[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [area, setArea] = useState(task?.area ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [due, setDue] = useState(task?.dueMin != null ? minToTime(task.dueMin) : "");
  const [priority, setPriority] = useState<"NORMAL" | "HIGH">(task?.priority ?? "NORMAL");
  const [requirePhoto, setRequirePhoto] = useState(task?.requirePhoto ?? false);
  const [staffIds, setStaffIds] = useState<number[]>(task?.assignees.map((a) => a.staffId) ?? []);
  const [dateTo, setDateTo] = useState(date);
  const [people, setPeople] = useState<Assignable[]>([]);
  const [onShiftOnly, setOnShiftOnly] = useState(!task);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffApi<Assignable[]>(`/api/tasks/assignees?date=${task?.workDate ?? date}`)
      .then((rows) => {
        setPeople(rows);
        // Không ai có ca ngày này → hiện tất cả
        if (!rows.some((p) => p.shifts.length)) setOnShiftOnly(false);
      })
      .catch((e) => setErr(errMsg(e)));
  }, [date, task]);

  const shown = people.filter((p) => !onShiftOnly || p.shifts.length || staffIds.includes(p.id));
  const byRole = useMemo(() => {
    const m = new Map<string, Assignable[]>();
    for (const p of shown) m.set(p.role, [...(m.get(p.role) ?? []), p]);
    return [...m.entries()];
  }, [shown]);
  const toggle = (id: number) => setStaffIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  async function save() {
    if (!title.trim()) return setErr("Nhập tên công việc.");
    if (!staffIds.length) return setErr("Chọn ít nhất một nhân viên.");
    const dueMin = due ? timeToMin(due) : null;
    const body = { title: title.trim(), area: area.trim() || null, description: description.trim() || null, dueMin, priority, requirePhoto, staffIds };
    setBusy(true);
    try {
      if (task) {
        await staffApi(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(body) });
        onSaved("Đã lưu thay đổi.");
      } else {
        const rows = await staffApi<WorkTask[]>("/api/tasks", { method: "POST", body: JSON.stringify({ ...body, dateFrom: date, dateTo }) });
        onSaved(rows.length > 1 ? `Đã giao việc cho ${staffIds.length} người trong ${rows.length} ngày.` : `Đã giao việc cho ${staffIds.length} người.`);
      }
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const hm = (m: number) => minToTime(m);
  return (
    <Modal
      title={task ? "Sửa công việc" : "Giao việc mới"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{task ? "Lưu" : `Giao cho ${staffIds.length || "…"} người`}</Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="o-taskform">
        <div className="o-taskform-main">
          <label className="o-tf-field">
            <span>Công việc <span className="req">*</span></span>
            <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Vệ sinh khu vực" maxLength={150} autoFocus />
          </label>
          <div className="o-tf-presets" aria-label="Gợi ý">
            {TASK_PRESETS.map((p) => (
              <button key={p} type="button" className={title === p ? "o-chip active" : "o-chip"} onClick={() => setTitle(p)}>{p}</button>
            ))}
          </div>
          <div className="o-tf-row">
            <label className="o-tf-field">
              <span>Khu vực</span>
              <input className="o-input" value={area} onChange={(e) => setArea(e.target.value)} list="task-areas" placeholder="VD: Khu A, Quầy bar" maxLength={100} />
              <datalist id="task-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
            </label>
            <label className="o-tf-field">
              <span>Hạn hoàn thành</span>
              <input className="o-input" type="time" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          <label className="o-tf-field">
            <span>Ghi chú / hướng dẫn</span>
            <textarea className="o-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="VD: Lau bàn, quét sàn, thay túi rác" maxLength={1000} />
          </label>
          <div className="o-tf-row">
            <label className="o-check">
              <input type="checkbox" checked={priority === "HIGH"} onChange={(e) => setPriority(e.target.checked ? "HIGH" : "NORMAL")} /> Ưu tiên cao
            </label>
            <label className="o-check">
              <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} /> Bắt buộc chụp ảnh khi báo xong
            </label>
          </div>
          {!task && (
            <label className="o-tf-field">
              <span>Lặp hằng ngày đến</span>
              <input className="o-input" type="date" value={dateTo} min={date} max={shiftDay(date, 30)} onChange={(e) => setDateTo(e.target.value || date)} />
              <small className="o-muted">{dateTo === date ? "Chỉ ngày đang xem." : `Tạo ${Math.round((new Date(dateTo).getTime() - new Date(date).getTime()) / 86_400_000) + 1} việc, mỗi ngày một việc.`}</small>
            </label>
          )}
        </div>

        <div className="o-taskform-people">
          <div className="o-tf-people-head">
            <span>Người làm <span className="req">*</span> <span className="o-muted">({staffIds.length} đã chọn)</span></span>
            <label className="o-check">
              <input type="checkbox" checked={onShiftOnly} onChange={(e) => setOnShiftOnly(e.target.checked)} /> Chỉ người có ca
            </label>
          </div>
          <div className="o-tf-people">
            {!byRole.length && <p className="o-muted">{people.length ? "Không ai có ca ngày này — bỏ chọn “Chỉ người có ca”." : "Đang tải…"}</p>}
            {byRole.map(([role, list]) => (
              <fieldset key={role} className="o-tf-role">
                <legend>
                  {roleLabel(role)}
                  <button
                    type="button"
                    className="o-btn o-btn-link o-btn-sm"
                    onClick={() => {
                      const ids = list.map((p) => p.id);
                      const all = ids.every((i) => staffIds.includes(i));
                      setStaffIds((x) => (all ? x.filter((i) => !ids.includes(i)) : [...new Set([...x, ...ids])]));
                    }}
                  >
                    {list.every((p) => staffIds.includes(p.id)) ? "Bỏ chọn" : "Chọn cả nhóm"}
                  </button>
                </legend>
                {list.map((p) => (
                  <label key={p.id} className={staffIds.includes(p.id) ? "o-tf-person active" : "o-tf-person"}>
                    <input type="checkbox" checked={staffIds.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span className="o-tf-person-name">{p.fullName}</span>
                    <span className="o-tf-person-shift">
                      {p.shifts.length ? p.shifts.map((s) => `${s.shiftCode} ${hm(s.startMin)}–${hm(s.endMin)}`).join(", ") : "Không có ca"}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RedoDialog({ task, staffId, name, onClose, onDone }: { task: WorkTask; staffId: number; name: string; onClose: () => void; onDone: (t: WorkTask) => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    try {
      onDone(await staffApi<WorkTask>(`/api/tasks/${task.id}/redo`, { method: "POST", body: JSON.stringify({ staffId, note }) }));
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      title="Yêu cầu làm lại"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void send()}>Gửi yêu cầu</Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <p style={{ marginTop: 0 }}><strong>{name}</strong> · {task.title}</p>
      <label className="o-tf-field">
        <span>Lý do</span>
        <textarea className="o-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Sàn khu A còn bẩn, lau lại giúp" autoFocus />
      </label>
    </Modal>
  );
}
