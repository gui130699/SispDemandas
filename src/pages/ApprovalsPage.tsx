import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { db } from "../lib/firebase";
import { approveCompanyRegistrationRequest, rejectCompanyRegistrationRequest } from "../services/companies";
import { approveRegistration, rejectRegistration, reviewConsultantCompanyAccess } from "../services/users";
import type { Company, CompanyRegistrationRequest, ConsultantCompanyRequest, UserProfile } from "../types/models";
import { Page } from "./DashboardPage";

type RegistrationDialog = { user: UserProfile; mode: "approve" | "reject" } | null;

export function ApprovalsPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accessRequests, setAccessRequests] = useState<ConsultantCompanyRequest[]>([]);
  const [companyRequests, setCompanyRequests] = useState<CompanyRegistrationRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dialog, setDialog] = useState<RegistrationDialog>(null);
  const [accessRequestToReject, setAccessRequestToReject] = useState<ConsultantCompanyRequest | null>(null);
  const [companyRequestToReject, setCompanyRequestToReject] = useState<CompanyRegistrationRequest | null>(null);
  const [approvedCompanyIds, setApprovedCompanyIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, "users"), where("registrationStatus", "==", "pending")),
      (snapshot) => setUsers(snapshot.docs
        .map((item) => ({ uid: item.id, ...item.data() }) as UserProfile)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))),
      () => setMessage("Não foi possível carregar os cadastros pendentes."),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, "consultantCompanyRequests"), where("status", "==", "pending")),
      (snapshot) => setAccessRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ConsultantCompanyRequest)),
      () => setMessage("Não foi possível carregar as solicitações de acesso."),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, "companyRegistrationRequests"), where("status", "==", "pending")),
      (snapshot) => setCompanyRequests(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as CompanyRegistrationRequest)
        .sort((a, b) => (a.requestedAt?.toMillis() ?? 0) - (b.requestedAt?.toMillis() ?? 0))),
      () => setMessage("Não foi possível carregar as solicitações de cadastro de empresas."),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      collection(db, "companies"),
      (snapshot) => setCompanies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Company)),
      () => setMessage("Não foi possível carregar as empresas."),
    );
  }, [isAdmin]);

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);

  if (!isAdmin || !profile) {
    return <Page title="Acesso negado"><p>Área exclusiva de administradores.</p></Page>;
  }
  const administrator = profile;

  function openRegistrationDialog(user: UserProfile, mode: "approve" | "reject") {
    setDialog({ user, mode });
    setApprovedCompanyIds(user.role === "consultant" ? user.requestedCompanyIds ?? [] : []);
    setReason("");
  }

  async function submitRegistration() {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.mode === "approve") {
        await approveRegistration(dialog.user, administrator, dialog.user.role === "consultant" ? approvedCompanyIds : undefined);
        setMessage(`${dialog.user.name} foi aprovado.`);
      } else {
        if (!reason.trim()) throw new Error("Informe o motivo da rejeição.");
        await rejectRegistration(dialog.user, administrator, reason);
        setMessage(`${dialog.user.name} foi rejeitado.`);
      }
      setDialog(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a revisão.");
    } finally {
      setSaving(false);
    }
  }

  async function approveRequestedCompany(request: CompanyRegistrationRequest) {
    setSaving(true);
    try {
      await approveCompanyRegistrationRequest(request, administrator);
      setMessage(`${request.company.legalName} foi cadastrada com sucesso.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível aprovar a empresa.");
    } finally {
      setSaving(false);
    }
  }

  const pendingTotal = users.length + accessRequests.length + companyRequests.length;

  return (
    <Page title="Aprovações" subtitle={`${pendingTotal} item(ns) aguardando revisão`}>
      <div className="cards">
        <div className="card"><small>Cadastros pendentes</small><strong>{users.length}</strong></div>
        <div className="card"><small>Solicitações de acesso</small><strong>{accessRequests.length}</strong></div>
        <div className="card"><small>Novas empresas</small><strong>{companyRequests.length}</strong></div>
      </div>
      {message && <p className="notice" role="status">{message}</p>}

      <section className="panel">
        <h2>Cadastros pendentes</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Tipo</th><th>Telefone</th><th>Empresas solicitadas</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.uid}>
                <td>{user.name}<small>{user.email}</small></td>
                <td>{user.role === "consultant" ? "Consultor" : "Cliente"}</td>
                <td>{user.phone || "—"}</td>
                <td>{user.role === "consultant" ? (user.requestedCompanyIds ?? []).map((id) => companyById.get(id)?.legalName ?? id).join(", ") || "Nenhuma" : user.companyName}</td>
                <td>{user.createdAt?.toDate().toLocaleString("pt-BR") || "Agora"}</td>
                <td><div className="row-actions"><button className="primary" type="button" onClick={() => openRegistrationDialog(user, "approve")}>Revisar</button><button className="danger" type="button" onClick={() => openRegistrationDialog(user, "reject")}>Rejeitar</button></div></td>
              </tr>
            ))}</tbody>
          </table>
          {!users.length && <p className="empty">Não há cadastros pendentes.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Solicitações de acesso a empresas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Consultor</th><th>Empresa</th><th>Solicitada em</th><th>Ações</th></tr></thead>
            <tbody>{accessRequests.map((item) => (
              <tr key={item.id}>
                <td>{item.consultantName}</td><td>{item.companyName}</td><td>{item.requestedAt?.toDate().toLocaleString("pt-BR") || "Agora"}</td>
                <td><div className="row-actions"><button className="primary notranslate" translate="no" type="button" onClick={async () => { try { await reviewConsultantCompanyAccess(item.id, "approved"); setMessage("Acesso à empresa aprovado."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aprovar."); } }}>Aprovar</button><button className="danger" type="button" onClick={() => { setAccessRequestToReject(item); setReason(""); }}>Rejeitar</button></div></td>
              </tr>
            ))}</tbody>
          </table>
          {!accessRequests.length && <p className="empty">Não há solicitações de acesso pendentes.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Solicitações de cadastro de empresas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Empresa</th><th>CNPJ</th><th>Consultor</th><th>Cidade/UF</th><th>Solicitada em</th><th>Ações</th></tr></thead>
            <tbody>{companyRequests.map((item) => (
              <tr key={item.id}>
                <td>{item.company.legalName}<small>{item.company.tradeName}</small></td>
                <td>{item.company.cnpj || "—"}</td>
                <td>{item.requestedByName}<small>{item.requestedByEmail}</small></td>
                <td>{[item.company.address?.city, item.company.address?.state].filter(Boolean).join("/") || "—"}</td>
                <td>{item.requestedAt?.toDate().toLocaleString("pt-BR") || "Agora"}</td>
                <td><div className="row-actions"><button className="primary notranslate" translate="no" type="button" disabled={saving} onClick={() => approveRequestedCompany(item)}>Aprovar</button><button className="danger" type="button" disabled={saving} onClick={() => { setCompanyRequestToReject(item); setReason(""); }}>Rejeitar</button></div></td>
              </tr>
            ))}</tbody>
          </table>
          {!companyRequests.length && <p className="empty">Não há solicitações de novas empresas.</p>}
        </div>
      </section>

      {dialog && (
        <div className="demand-description-modal-backdrop" onMouseDown={() => !saving && setDialog(null)}>
          <section className="demand-description-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="demand-description-modal-header"><h2 id="approval-title">{dialog.mode === "approve" ? "Aprovar cadastro" : "Rejeitar cadastro"}</h2><button className="demand-description-close" type="button" aria-label="Fechar" onClick={() => setDialog(null)}>×</button></div>
            <p><strong>{dialog.user.name}</strong><br />{dialog.user.email}</p>
            {dialog.mode === "approve" && dialog.user.role === "consultant" && <fieldset className="company-request-list"><legend>Empresas autorizadas</legend>{(dialog.user.requestedCompanyIds ?? []).map((companyId) => <label key={companyId} className="check-row"><input type="checkbox" checked={approvedCompanyIds.includes(companyId)} onChange={() => setApprovedCompanyIds((current) => current.includes(companyId) ? current.filter((id) => id !== companyId) : [...current, companyId])} />{companyById.get(companyId)?.legalName ?? companyId}</label>)}</fieldset>}
            {dialog.mode === "reject" && <label>Motivo da rejeição *<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>}
            <div className="actions"><button className={dialog.mode === "approve" ? "primary" : "danger"} type="button" disabled={saving} onClick={submitRegistration}>{saving ? "Salvando…" : dialog.mode === "approve" ? "Confirmar aprovação" : "Confirmar rejeição"}</button><button type="button" disabled={saving} onClick={() => setDialog(null)}>Cancelar</button></div>
          </section>
        </div>
      )}

      {accessRequestToReject && (
        <div className="demand-description-modal-backdrop" onMouseDown={() => !saving && setAccessRequestToReject(null)}>
          <section className="demand-description-modal" role="dialog" aria-modal="true" aria-labelledby="access-rejection-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="demand-description-modal-header"><h2 id="access-rejection-title">Rejeitar solicitação de acesso</h2><button className="demand-description-close" type="button" aria-label="Fechar" onClick={() => setAccessRequestToReject(null)}>×</button></div>
            <p>{accessRequestToReject.consultantName} · {accessRequestToReject.companyName}</p>
            <label>Motivo da rejeição *<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>
            <div className="actions"><button className="danger" type="button" disabled={saving || !reason.trim()} onClick={async () => { setSaving(true); try { await reviewConsultantCompanyAccess(accessRequestToReject.id, "rejected", reason); setMessage("Solicitação rejeitada."); setAccessRequestToReject(null); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível rejeitar."); } finally { setSaving(false); } }}>Confirmar rejeição</button><button type="button" disabled={saving} onClick={() => setAccessRequestToReject(null)}>Cancelar</button></div>
          </section>
        </div>
      )}

      {companyRequestToReject && (
        <div className="demand-description-modal-backdrop" onMouseDown={() => !saving && setCompanyRequestToReject(null)}>
          <section className="demand-description-modal" role="dialog" aria-modal="true" aria-labelledby="company-registration-rejection-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="demand-description-modal-header"><h2 id="company-registration-rejection-title">Rejeitar cadastro de empresa</h2><button className="demand-description-close" type="button" aria-label="Fechar" onClick={() => setCompanyRequestToReject(null)}>×</button></div>
            <p><strong>{companyRequestToReject.company.legalName}</strong><br />Solicitada por {companyRequestToReject.requestedByName}</p>
            <label>Motivo da rejeição *<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>
            <div className="actions"><button className="danger" type="button" disabled={saving || !reason.trim()} onClick={async () => { setSaving(true); try { await rejectCompanyRegistrationRequest(companyRequestToReject, administrator, reason); setMessage("Solicitação de cadastro rejeitada."); setCompanyRequestToReject(null); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível rejeitar a empresa."); } finally { setSaving(false); } }}>Confirmar rejeição</button><button type="button" disabled={saving} onClick={() => setCompanyRequestToReject(null)}>Cancelar</button></div>
          </section>
        </div>
      )}
    </Page>
  );
}
