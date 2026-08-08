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
  editStatusObservation,
  saveStatusObservation,
  updateDemandWorkflowStatuses,
} from "../services/demands";
import { resolveStatus } from "../services/statuses";
import type {
  Demand,
  DemandHistoryEvent,
  DemandStatus,
  Priority,
  Sector,
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
        {profile?.role !== "admin" && (
          <Link className="primary dashboard-primary-action" to="/demandas/nova">
            Nova demanda
          </Link>
        )}
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
  const [sectors, setSectors] = useState<Sector[]>([]);
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
  useEffect(
    () => onSnapshot(query(collection(db, "sectors"), where("active", "==", true)), (snapshot) => setSectors(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Sector))),
    [],
  );
  if (profile?.role === "admin") {
    return (
      <Page title="Acesso restrito">
        <p>Administradores podem apenas visualizar ou mover demandas para a lixeira.</p>
      </Page>
    );
  }
  const availableSectors = sectors.filter((sector) => profile?.role !== "requester" || sector.companyId === profile.companyId);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;
    const f = new FormData(e.currentTarget),
      initial =
        statuses.find((s) => s.active && s.isInitial) ??
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
          requesterSector: String(f.get("sector") || ""),
        },
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
          </>
        )}
        <label>
          Setor solicitante
          <select name="sector" defaultValue="">
            <option value="">Selecione um setor</option>
            {availableSectors.map((sector) => <option key={sector.id} value={sector.name}>{profile?.role === "consultant" ? `${sector.name} — ${sector.companyName}` : sector.name}</option>)}
          </select>
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
  const [savingObservation, setSavingObservation] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState("");
  const [editingObservation, setEditingObservation] = useState("");
  const [workflowStatusIds, setWorkflowStatusIds] = useState<string[]>([]);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      onSnapshot(doc(db, "demands", id), (s) =>
        setDemand(s.exists() ? ({ id: s.id, ...s.data() } as Demand) : null),
      ),
    [id],
  );
  useEffect(() => {
    const currentEvent = history.find(
      (event) => event.id === demand?.statusHistoryId,
    );
    if (currentEvent) setStatusObservation(currentEvent.observation ?? "");
  }, [demand?.statusHistoryId, history]);
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
  useEffect(() => {
    if (profile?.role !== "consultant" || demand?.consultantId !== profile.uid) {
      return;
    }
    const defaults = statuses
      .filter((status) =>
        status.legacyKeys?.some((key) =>
          ["analysis", "development", "waiting_validation", "completed"].includes(
            key,
          ),
        ),
      )
      .map((status) => status.id);
    setWorkflowStatusIds(demand.workflowStatusIds?.length ? demand.workflowStatusIds : defaults);
  }, [demand?.consultantId, demand?.workflowStatusIds, profile?.role, profile?.uid, statuses]);
  if (!demand)
    return (
      <Page title="Demanda">
        <p>Carregando…</p>
      </Page>
  );
  const current = resolveStatus(demand, statuses);
  const canManageStatus = profile?.role === "consultant";
  const defaultWorkflowStatusIds = statuses
    .filter((status) =>
      status.legacyKeys?.some((key) =>
        ["analysis", "development", "waiting_validation", "completed"].includes(
          key,
        ),
      ),
    )
    .map((status) => status.id);
  const configuredWorkflowStatusIds =
    demand.workflowStatusIds?.length
      ? demand.workflowStatusIds
      : defaultWorkflowStatusIds;
  const allowedWorkflowStatusIds = new Set([
    ...configuredWorkflowStatusIds,
    ...(demand.statusId ? [demand.statusId] : []),
  ]);
  const availableStatuses = statuses.filter(
    (status) =>
      status.active &&
      !status.legacyKeys?.includes("cancelled") &&
      allowedWorkflowStatusIds.has(status.id),
  );
  const cancelledStatus = statuses.find((status) =>
    status.legacyKeys?.includes("cancelled"),
  );
  const analysisStatus = statuses.find((status) =>
    status.legacyKeys?.includes("analysis"),
  );
  const canReopen =
    canManageStatus && demand.status === "cancelled" && Boolean(analysisStatus);
  const canConfigureWorkflow =
    profile?.role === "consultant" && demand.consultantId === profile.uid;
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
          {canReopen ? (
            <button
              type="button"
              className="demand-status-reopen"
              onClick={async () => {
                if (
                  !profile ||
                  !analysisStatus ||
                  !window.confirm(
                    "Deseja reabrir esta demanda? Ela voltará para Em análise.",
                  )
                )
                  return;
                try {
                  await changeDemandStatus(
                    demand,
                    analysisStatus,
                    profile,
                    "Demanda reaberta pelo consultor.",
                  );
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Não foi possível reabrir a demanda.",
                  );
                }
              }}
            >
              {current.name}
            </button>
          ) : (
            <strong>{current.name}</strong>
          )}
        </div>
        <div className="demand-summary-item demand-summary-description">
          <span>Descrição</span>
          <button
            type="button"
            className="demand-description-trigger"
            title="Ver descrição completa"
            onClick={() => setDescriptionOpen(true)}
          >
            {demand.description}
          </button>
        </div>
      </section>
      <section className="demand-controls">
        {canManageStatus && (
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
                  disabled={!defaultWorkflowStatusIds.length}
                  onClick={async () => {
                    try {
                      await acceptDemand(
                        demand,
                        profile,
                        defaultWorkflowStatusIds,
                      );
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
                disabled={demand.status === "cancelled"}
                onChange={async (e) => {
                  const statusSelect = e.currentTarget;
                  const next = statuses.find((s) => s.id === statusSelect.value);
                  if (!next || !profile) return;
                  if (next.id === demand.statusId) {
                    setError(
                      "Este já é o status atual. Use “Salvar observação” para atualizá-la.",
                    );
                    statusSelect.value = "";
                    return;
                  }
                  try {
                    await changeDemandStatus(
                      demand,
                      next,
                      profile,
                      statusObservation,
                    );
                    setStatusObservation("");
                    statusSelect.value = "";
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
                {availableStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {cancelledStatus && demand.status !== "cancelled" && (
                <button
                  type="button"
                  className="danger"
                  disabled={!statusObservation.trim()}
                  onClick={async () => {
                    if (!profile) return;
                    try {
                      await changeDemandStatus(
                        demand,
                        cancelledStatus,
                        profile,
                        statusObservation,
                      );
                      setStatusObservation("");
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Não foi possível cancelar a demanda.",
                      );
                    }
                  }}
                >
                  Cancelar demanda
                </button>
              )}
              <button
                type="button"
                className="primary"
                disabled={!statusObservation.trim() || savingObservation}
                onClick={async () => {
                  if (!profile) return;
                  setSavingObservation(true);
                  setError("");
                  try {
                    await saveStatusObservation(
                      demand,
                      profile,
                      statusObservation,
                    );
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Não foi possível salvar a observação.",
                    );
                  } finally {
                    setSavingObservation(false);
                  }
                }}
              >
                {savingObservation ? "Salvando…" : "Salvar observação"}
              </button>
            </div>
          </div>
        )}
        {canConfigureWorkflow && (
          <details className="workflow-statuses">
            <summary>Etapas usadas nesta demanda</summary>
            <p>
              Por padrão, a demanda utiliza Em análise, Em execução,
              Aguardando validação e Concluído. Ajuste apenas se necessário.
            </p>
            <div className="workflow-status-options">
              {statuses
                .filter(
                  (status) =>
                    status.active && !status.legacyKeys?.includes("cancelled"),
                )
                .map((status) => (
                  <label key={status.id}>
                    <input
                      type="checkbox"
                      checked={workflowStatusIds.includes(status.id)}
                      disabled={status.id === demand.statusId}
                      onChange={(event) =>
                        setWorkflowStatusIds((currentIds) =>
                          event.target.checked
                            ? [...new Set([...currentIds, status.id])]
                            : currentIds.filter((id) => id !== status.id),
                        )
                      }
                    />
                    {status.name}
                  </label>
                ))}
            </div>
            <button
              type="button"
              className="primary"
              disabled={!workflowStatusIds.length || savingWorkflow}
              onClick={async () => {
                if (!profile) return;
                setSavingWorkflow(true);
                setError("");
                try {
                  await updateDemandWorkflowStatuses(
                    demand,
                    profile,
                    workflowStatusIds,
                  );
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Não foi possível salvar as etapas.",
                  );
                } finally {
                  setSavingWorkflow(false);
                }
              }}
            >
              {savingWorkflow ? "Salvando…" : "Salvar etapas"}
            </button>
          </details>
        )}
        {error && <p className="error">{error}</p>}
      </section>
      <details className="panel status-history">
        <summary>Resumo por status</summary>
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
                {canManageStatus && (
                  <button
                    type="button"
                    className="status-report-edit"
                    onClick={() => {
                      setEditingHistoryId(latest.id);
                      setEditingObservation(latest.observation ?? "");
                    }}
                  >
                    Editar observação
                  </button>
                )}
                {editingHistoryId === latest.id && (
                  <div className="status-report-editor">
                    <textarea
                      aria-label={`Editar observação de ${latest.statusName}`}
                      rows={2}
                      value={editingObservation}
                      onChange={(event) =>
                        setEditingObservation(event.target.value)
                      }
                    />
                    <div>
                      <button
                        type="button"
                        className="primary"
                        disabled={!editingObservation.trim()}
                        onClick={async () => {
                          if (!profile) return;
                          try {
                            await editStatusObservation(
                              demand,
                              latest.id,
                              profile,
                              editingObservation,
                            );
                            setEditingHistoryId("");
                            setError("");
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Não foi possível editar a observação.",
                            );
                          }
                        }}
                      >
                        Salvar edição
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingHistoryId("")}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
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
      </details>
      {descriptionOpen && (
        <div
          className="demand-description-modal-backdrop"
          onMouseDown={() => setDescriptionOpen(false)}
        >
          <section
            className="demand-description-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demand-description-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="demand-description-modal-header">
              <h2 id="demand-description-title">Descrição da demanda</h2>
              <button
                type="button"
                className="demand-description-close"
                aria-label="Fechar descrição"
                onClick={() => setDescriptionOpen(false)}
              >
                ×
              </button>
            </div>
            <p>{demand.description}</p>
          </section>
        </div>
      )}
    </Page>
  );
}
