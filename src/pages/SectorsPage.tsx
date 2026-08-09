import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import {
  approveSectorRequest,
  createSector,
  rejectSectorRequest,
  requestSector,
  uniqueSectors,
} from "../services/sectors";
import type { Sector, SectorRequest } from "../types/models";
import { Page } from "./DashboardPage";

export function SectorsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [requests, setRequests] = useState<SectorRequest[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState<SectorRequest | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const sectorsQuery = isAdmin
      ? query(collection(db, "sectors"), orderBy("name"))
      : query(collection(db, "sectors"), where("active", "==", true));
    return onSnapshot(
      sectorsQuery,
      (snapshot) => setSectors(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Sector)),
      () => setSectors([]),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setRequests([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "sectorRequests"), where("status", "==", "pending")),
      (snapshot) => setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as SectorRequest)),
      () => setRequests([]),
    );
  }, [isAdmin]);

  const visibleSectors = useMemo(() => uniqueSectors(sectors), [sectors]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "");
    setSaving(true);
    setMessage("");
    try {
      if (isAdmin) {
        await createSector(name);
        setMessage("Setor cadastrado e disponibilizado para todos.");
      } else {
        await requestSector(profile, name);
        setMessage("Solicitação de setor enviada para aprovação.");
      }
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o setor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Setores" subtitle="Catálogo geral utilizado por todas as empresas">
      {message && <p className="notice" role="status">{message}</p>}

      <form className="form-grid panel sector-form" onSubmit={submit}>
        <div className="sector-form-heading">
          <h2>{isAdmin ? "Cadastrar Setor" : "Solicitar novo setor"}</h2>
          <p>{isAdmin ? "O setor ficará disponível para todos os usuários." : "A solicitação será analisada pelo administrador."}</p>
        </div>
        <label>
          Nome do setor *
          <input name="name" placeholder="Ex.: Financeiro" required minLength={2} />
        </label>
        <div className="actions">
          <button className="primary" disabled={saving}>
            {saving ? "Salvando…" : isAdmin ? "Cadastrar Setor" : "Solicitar setor"}
          </button>
        </div>
      </form>

      {isAdmin && (
        <section className="panel">
          <h2>Solicitações pendentes</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Setor</th><th>Solicitante</th><th>Ações</th></tr></thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.name}</td>
                    <td>{request.requestedByName}</td>
                    <td>
                      <div className="row-actions">
                        <button className="primary" type="button" onClick={async () => {
                          if (!profile) return;
                          try {
                            await approveSectorRequest(request, profile);
                            setMessage("Setor aprovado e disponibilizado para todos.");
                          } catch (error) {
                            setMessage(error instanceof Error ? error.message : "Não foi possível aprovar.");
                          }
                        }}>Aprovar</button>
                        <button className="danger" type="button" onClick={() => { setRejecting(request); setReason(""); }}>Rejeitar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!requests.length && <p className="empty">Não há solicitações pendentes.</p>}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Setores cadastrados</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Setor</th>{isAdmin && <th>Status</th>}</tr></thead>
            <tbody>
              {visibleSectors.map((sector) => (
                <tr key={sector.nameNormalized || sector.id}>
                  <td>{sector.name}</td>
                  {isAdmin && <td><span className={`badge ${sector.active ? "active" : "inactive"}`}>{sector.active ? "Ativo" : "Inativo"}</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleSectors.length && <p className="empty">Nenhum setor cadastrado.</p>}
        </div>
      </section>

      {rejecting && (
        <div className="demand-description-modal-backdrop" onMouseDown={() => setRejecting(null)}>
          <section className="demand-description-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="demand-description-modal-header">
              <h2>Rejeitar solicitação de setor</h2>
              <button className="demand-description-close" type="button" aria-label="Fechar" onClick={() => setRejecting(null)}>×</button>
            </div>
            <label>Motivo *<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>
            <div className="actions">
              <button className="danger" type="button" disabled={!reason.trim()} onClick={async () => {
                if (!profile) return;
                try {
                  await rejectSectorRequest(rejecting, profile, reason);
                  setRejecting(null);
                  setMessage("Solicitação rejeitada.");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Não foi possível rejeitar.");
                }
              }}>Confirmar</button>
              <button type="button" onClick={() => setRejecting(null)}>Cancelar</button>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
