import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import {
  approveSectorRequest,
  createSector,
  deleteSector,
  ensureDefaultSectors,
  rejectSectorRequest,
  requestSector,
  uniqueSectors,
} from "../services/sectors";
import type { Sector, SectorRequest } from "../types/models";
import { normalizeText } from "../utils/normalization";
import { Page } from "./DashboardPage";

export function SectorsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [requests, setRequests] = useState<SectorRequest[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [sectorName, setSectorName] = useState("");
  const pendingSector = useRef("");
  const defaultCatalogStarted = useRef(false);
  const [sectorsLoaded, setSectorsLoaded] = useState(false);
  const [rejecting, setRejecting] = useState<SectorRequest | null>(null);
  const [deleting, setDeleting] = useState<Sector | null>(null);
  const [deletingSector, setDeletingSector] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const sectorsQuery = isAdmin
      ? query(collection(db, "sectors"), orderBy("name"))
      : query(collection(db, "sectors"), where("active", "==", true));
    return onSnapshot(
      sectorsQuery,
      (snapshot) => {
        const nextSectors = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Sector);
        setSectors(nextSectors);
        setSectorsLoaded(true);
        if (pendingSector.current && nextSectors.some((sector) => sector.active && sector.nameNormalized === pendingSector.current)) {
          setSaving(false);
          pendingSector.current = "";
          setSectorName("");
          setMessage("Setor cadastrado e disponibilizado para todos.");
        }
      },
      () => { setSectors([]); setSectorsLoaded(true); },
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

  useEffect(() => {
    if (!isAdmin || !sectorsLoaded || defaultCatalogStarted.current) return;
    defaultCatalogStarted.current = true;
    void ensureDefaultSectors(sectors)
      .then((created) => {
        if (created) setMessage(`${created} setor(es) padrão adicionado(s) ao catálogo.`);
      })
      .catch(() => setMessage("Não foi possível completar o catálogo padrão de setores."));
  }, [isAdmin, sectors, sectorsLoaded]);

  useEffect(() => {
    if (!saving) return;
    const timer = window.setTimeout(() => {
      setSaving(false);
      pendingSector.current = "";
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [saving]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const name = sectorName.trim();
    setSaving(true);
    pendingSector.current = isAdmin ? normalizeText(name) : "";
    setMessage("");
    try {
      if (isAdmin) {
        await createSector(name);
        setMessage("Setor cadastrado e disponibilizado para todos.");
      } else {
        await requestSector(profile, name);
        setMessage("Solicitação de setor enviada para aprovação.");
      }
      setSectorName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o setor.");
    } finally {
      setSaving(false);
      pendingSector.current = "";
    }
  }

  return (
    <Page title="Setores" subtitle="Catálogo geral utilizado por todas as empresas">
      {message && <p className="notice" role="status">{message}</p>}

      <form className="form-grid panel sector-form" onSubmit={submit}>
        <div className="sector-form-heading">
          <h2 className="notranslate" translate="no">{isAdmin ? "Cadastrar Setor" : "Solicitar novo setor"}</h2>
          <p>{isAdmin ? "O setor ficará disponível para todos os usuários." : "A solicitação será analisada pelo administrador."}</p>
        </div>
        <label>
          Nome do setor *
          <input name="name" value={sectorName} onChange={(event) => setSectorName(event.target.value)} placeholder="Ex.: Financeiro" required minLength={2} />
        </label>
        <div className="actions">
          <button className="primary notranslate" translate="no" disabled={saving}>
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
                        <button className="primary notranslate" translate="no" type="button" onClick={async () => {
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
            <thead><tr><th>Setor</th>{isAdmin && <><th>Status</th><th>Ações</th></>}</tr></thead>
            <tbody>
              {visibleSectors.map((sector) => (
                <tr key={sector.nameNormalized || sector.id}>
                  <td>{sector.name}</td>
                  {isAdmin && <td><span className={`badge ${sector.active ? "active" : "inactive"}`}>{sector.active ? "Ativo" : "Inativo"}</span></td>}
                  {isAdmin && <td><button className="danger" type="button" onClick={() => setDeleting(sector)}>Excluir</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleSectors.length && <p className="empty">Nenhum setor cadastrado.</p>}
        </div>
      </section>

      {deleting && (
        <div className="demand-description-modal-backdrop" onMouseDown={() => !deletingSector && setDeleting(null)}>
          <section className="demand-description-modal" role="dialog" aria-modal="true" aria-labelledby="delete-sector-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="demand-description-modal-header">
              <h2 id="delete-sector-title">Excluir setor</h2>
              <button className="demand-description-close" type="button" aria-label="Fechar" disabled={deletingSector} onClick={() => setDeleting(null)}>×</button>
            </div>
            <p>Deseja excluir o setor <strong>{deleting.name}</strong> do catálogo?</p>
            <p className="muted">Demandas antigas manterão o nome registrado, mas o setor deixará de aparecer nas novas seleções.</p>
            <div className="actions">
              <button className="danger" type="button" disabled={deletingSector} onClick={async () => {
                setDeletingSector(true);
                try {
                  await deleteSector(deleting.name);
                  setMessage(`Setor ${deleting.name} excluído com sucesso.`);
                  setDeleting(null);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Não foi possível excluir o setor.");
                } finally {
                  setDeletingSector(false);
                }
              }}>{deletingSector ? "Excluindo…" : "Excluir setor"}</button>
              <button type="button" disabled={deletingSector} onClick={() => setDeleting(null)}>Cancelar</button>
            </div>
          </section>
        </div>
      )}

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
