import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import {
  changeDemandStatus,
  createDemand,
  acceptDemand,
  softDeleteDemand,
} from "../services/demands";
import { resolveStatus } from "../services/statuses";
import type {
  Demand,
  DemandHistoryEvent,
  DemandStatus,
  Priority,
} from "../types/models";
import { elapsedDays } from "../utils/dates";
import { Page } from "./DashboardPage";
const statusStyle = (color?: string) => ({
  borderLeft: `4px solid ${color ?? "#64748b"}`,
});
export function DemandsPage() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Demand[]>([]);
  const [statuses, setStatuses] = useState<DemandStatus[]>([]);
  const [filter, setFilter] = useState("");
  const requestedCompanyId = searchParams.get("empresa");
  const consultantCompanyId =
    profile?.role === "consultant" &&
    profile.companyIds?.includes(requestedCompanyId ?? "")
      ? requestedCompanyId
      : profile?.role === "consultant"
        ? (profile.companyIds?.[0] ?? "")
        : "";

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "consultant" && !consultantCompanyId) {
      setItems([]);
      return;
    }
    const ref =
      profile.role === "requester"
        ? query(
            collection(db, "demands"),
            where("companyId", "==", profile.companyId),
            orderBy("createdAt", "desc"),
          )
        : profile.role === "consultant"
          ? query(
              collection(db, "demands"),
              where("companyId", "==", consultantCompanyId),
              orderBy("createdAt", "desc"),
            )
          : query(collection(db, "demands"), orderBy("createdAt", "desc"));
    return onSnapshot(ref, (s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Demand)),
    );
  }, [profile, consultantCompanyId]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "demandStatuses"), orderBy("order")),
        (s) =>
          setStatuses(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as DemandStatus),
          ),
      ),
    [],
  );
  const visible = useMemo(
    () =>
      items.filter(
        (d) =>
          !d.deletedAt &&
          `${d.code} ${d.title} ${d.companyName}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
      ),
    [items, filter],
  );
  return (
    <Page title="Demandas" subtitle={`${visible.length} demanda(s) visíveis`}>
      <div className="toolbar">
        <input
          placeholder="Filtrar por código, título ou empresa"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Link className="primary dashboard-primary-action" to="/demandas/nova">
          Nova demanda
        </Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Empresa</th>
              <th>Título</th>
              <th>Status</th>
              <th>Dias</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => {
              const status = resolveStatus(d, statuses);
              return (
                <tr key={d.id} style={statusStyle(status.color)}>
                  <td>
                    <Link to={`/demandas/${d.id}`}>{d.code}</Link>
                  </td>
                  <td>{d.companyName}</td>
                  <td>{d.title}</td>
                  <td>{status.name}</td>
                  <td>
                    {elapsedDays(d.createdAt, d.completedAt ?? d.cancelledAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
export function DemandFormPage() {
  const { profile } = useAuth();
  const go = useNavigate();
  const [statuses, setStatuses] = useState<DemandStatus[]>([]);
  const [error, setError] = useState("");
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "demandStatuses"), orderBy("order")),
        (s) =>
          setStatuses(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as DemandStatus),
          ),
      ),
    [],
  );
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;
    const f = new FormData(e.currentTarget),
      initial =
        statuses.find((s) => s.legacyKeys?.includes("analysis")) ??
        statuses.find((s) => s.active);
    if (!initial) {
      setError(
        "O administrador ainda precisa inicializar os status de demanda.",
      );
      return;
    }
    try {
      const id = await createDemand(
        {
          title: String(f.get("title")),
          description: String(f.get("description")),
          screenName: String(f.get("screen")),
          formName: String(f.get("form")),
          levelId: String(f.get("level")),
          levelName: String(f.get("level")),
          priority: String(f.get("priority")) as Priority,
          companyId: profile.companyId || String(f.get("companyId")),
          companyName: profile.companyName || String(f.get("companyName")),
          requesterSector: String(f.get("sector") || ""),
        },
        profile,
        initial,
      );
      go(`/demandas/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };
  return (
    <Page title="Nova demanda">
      <form className="form-grid" onSubmit={submit}>
        <label>
          Título *<input name="title" required />
        </label>
        <label>
          Prioridade
          <select name="priority" defaultValue="normal">
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        {profile?.role !== "requester" && (
          <>
            <label>
              Empresa (ID) *<input name="companyId" required />
            </label>
            <label>
              Nome da empresa *<input name="companyName" required />
            </label>
          </>
        )}
        <label>
          Setor solicitante
          <input name="sector" defaultValue={profile?.defaultSector ?? ""} />
        </label>
        <label>
          Tela *<input name="screen" required />
        </label>
        <label>
          Formulário *<input name="form" required />
        </label>
        <label>
          Nível *<input name="level" required placeholder="N1" />
        </label>
        <label className="wide">
          Descrição da demanda *
          <textarea name="description" required rows={6} />
        </label>
        {error && <p className="error wide">{error}</p>}
        <button className="primary">Criar demanda</button>
      </form>
    </Page>
  );
}
export function DemandDetailPage() {
  const { id = "" } = useParams();
  const { profile } = useAuth();
  const [demand, setDemand] = useState<Demand | null>(null);
  const [statuses, setStatuses] = useState<DemandStatus[]>([]);
  const [history, setHistory] = useState<DemandHistoryEvent[]>([]);
  const [statusObservation, setStatusObservation] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () =>
      onSnapshot(doc(db, "demands", id), (s) =>
        setDemand(s.exists() ? ({ id: s.id, ...s.data() } as Demand) : null),
      ),
    [id],
  );
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "demandStatuses"), orderBy("order")),
        (s) =>
          setStatuses(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as DemandStatus),
          ),
      ),
    [],
  );
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "demands", id, "history"),
          orderBy("createdAt", "desc"),
        ),
        (snapshot) =>
          setHistory(
            snapshot.docs.map(
              (item) =>
                ({ id: item.id, ...item.data() }) as DemandHistoryEvent,
            ),
          ),
      ),
    [id],
  );
  if (!demand)
    return (
      <Page title="Demanda">
        <p>Carregando…</p>
      </Page>
  );
  const current = resolveStatus(demand, statuses);
  const canManage = profile?.role === "admin" || profile?.role === "consultant";
  const statusGroups = history
    .filter((event) => event.type === "status")
    .reduce((groups, event) => {
      const key = event.statusId || event.statusName || event.id;
      groups.set(key, [...(groups.get(key) ?? []), event]);
      return groups;
    }, new Map<string, DemandHistoryEvent[]>());
  return (
    <Page title="Detalhes da demanda">
      <section className="demand-summary" style={statusStyle(current.color)}>
        <div className="demand-summary-item demand-summary-id">
          <span>ID</span>
          <strong>- {demand.code}</strong>
        </div>
        <div className="demand-summary-item demand-summary-title">
          <span>Título</span>
          <strong title={demand.title}>{demand.title}</strong>
        </div>
        <div className="demand-summary-item">
          <span>Empresa</span>
          <strong title={demand.companyName}>{demand.companyName}</strong>
        </div>
        <div className="demand-summary-item">
          <span>Consultor</span>
          <strong title={demand.consultantName || "Sem consultor"}>
            {demand.consultantName || "Sem consultor"}
          </strong>
        </div>
        <div className="demand-summary-item">
          <span>Setor</span>
          <strong>{demand.requesterSector || "—"}</strong>
        </div>
        <div className="demand-summary-item">
          <span>Status</span>
          <strong>{current.name}</strong>
        </div>
        <div className="demand-summary-item demand-summary-description">
          <span>Descrição</span>
          <strong title={demand.description}>{demand.description}</strong>
        </div>
      </section>
      <section className="demand-controls">
        {canManage && (
          <div className="demand-status-update">
            <label>
              Observação deste status *
              <textarea
                rows={2}
                value={statusObservation}
                onChange={(event) => setStatusObservation(event.target.value)}
                placeholder="Descreva o andamento ou a ação realizada."
              />
            </label>
            <div className="actions demand-actions">
              {profile?.role === "consultant" && !demand.consultantId && (
                <button
                  type="button"
                  className="primary"
                  onClick={async () => {
                    try {
                      await acceptDemand(demand, profile);
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Não foi possível assumir a demanda.",
                      );
                    }
                  }}
                >
                  Assumir demanda
                </button>
              )}
              <select
                aria-label="Alterar status"
                defaultValue=""
                onChange={async (e) => {
                  const next = statuses.find((s) => s.id === e.target.value);
                  if (!next || !profile) return;
                  try {
                    await changeDemandStatus(
                      demand,
                      next,
                      profile,
                      statusObservation,
                    );
                    setStatusObservation("");
                    e.currentTarget.value = "";
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Não foi possível atualizar",
                    );
                  }
                }}
              >
                <option value="">Alterar status…</option>
                {statuses
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button
                className="danger"
                onClick={() =>
                  profile &&
                  softDeleteDemand(demand, profile, "Exclusão lógica solicitada")
                }
              >
                Mover para lixeira
              </button>
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
      <section className="panel status-history">
        <h2>Resumo por status</h2>
        <div className="status-report">
          {Array.from(statusGroups.entries()).map(([key, events]) => {
            const latest = events[0];
            const previousEvents = events.slice(1);
            return (
              <article className="status-report-line" key={key}>
                <p>
                  <strong>{latest.statusName || "Status atualizado"}</strong>
                  <span> — {latest.observation || "Sem observação registrada."}</span>
                  <small>
                    {" "}
                    · {latest.authorName} ·{" "}
                    {latest.createdAt?.toDate().toLocaleString("pt-BR") || "Agora"}
                  </small>
                </p>
                {!!previousEvents.length && (
                  <details>
                    <summary>
                      Ver {previousEvents.length} registro
                      {previousEvents.length > 1 ? "s" : ""} anterior
                      {previousEvents.length > 1 ? "es" : ""}
                    </summary>
                    {previousEvents.map((event) => (
                      <p className="status-report-previous" key={event.id}>
                        {event.observation || "Sem observação registrada."} ·{" "}
                        {event.authorName} ·{" "}
                        {event.createdAt?.toDate().toLocaleString("pt-BR") ||
                          "Agora"}
                      </p>
                    ))}
                  </details>
                )}
              </article>
            );
          })}
          {!statusGroups.size && (
            <article className="status-report-line">
              <p>
                <strong>{current.name}</strong>
                <span> — Sem observação registrada.</span>
                <small> · Status atual</small>
              </p>
            </article>
          )}
        </div>
      </section>
    </Page>
  );
}
