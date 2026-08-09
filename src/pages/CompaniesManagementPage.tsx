import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { db } from "../lib/firebase";
import {
  lookupCompanyByCnpj,
  requestCompanyRegistration,
  saveCompany,
  type CompanyInput,
} from "../services/companies";
import { removeProjectManager, requestProjectManagerAccess } from "../services/projectManagement";
import type { Company, CompanyRegistrationRequest, ProjectManagerRequest } from "../types/models";
import { Page } from "./DashboardPage";

const requestStatusLabels: Record<CompanyRegistrationRequest["status"], string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
};
const managerStatusLabels: Record<ProjectManagerRequest["status"], string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
};

function companyInput(data: FormData): CompanyInput {
  return {
    legalName: String(data.get("legalName") || "").trim(),
    tradeName: String(data.get("tradeName") || "").trim(),
    cnpj: String(data.get("cnpj") || ""),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    contactName: String(data.get("contactName") || "").trim(),
    notes: String(data.get("notes") || "").trim(),
    active: true,
    address: {
      zipCode: String(data.get("zipCode") || ""),
      street: String(data.get("street") || ""),
      number: String(data.get("number") || ""),
      complement: String(data.get("complement") || ""),
      neighborhood: String(data.get("neighborhood") || ""),
      city: String(data.get("city") || ""),
      state: String(data.get("state") || ""),
    },
  };
}

export function CompaniesManagementPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isConsultant = profile?.role === "consultant";
  const [items, setItems] = useState<Company[]>([]);
  const [requests, setRequests] = useState<CompanyRegistrationRequest[]>([]);
  const [managerRequests, setManagerRequests] = useState<ProjectManagerRequest[]>([]);
  const [managerCompany, setManagerCompany] = useState<Company | null>(null);
  const [managerReason, setManagerReason] = useState("");
  const [requestingManager, setRequestingManager] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAdmin && !isConsultant) return;
    return onSnapshot(
      query(collection(db, "companies"), orderBy("legalName")),
      (snapshot) => setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Company)),
      () => setMessage("Não foi possível carregar as empresas."),
    );
  }, [isAdmin, isConsultant]);

  useEffect(() => {
    if (!isConsultant || !profile) {
      setRequests([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "companyRegistrationRequests"), where("requestedBy", "==", profile.uid)),
      (snapshot) => setRequests(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as CompanyRegistrationRequest)
        .sort((a, b) => (b.requestedAt?.toMillis() ?? 0) - (a.requestedAt?.toMillis() ?? 0))),
      () => setMessage("Não foi possível carregar suas solicitações de cadastro."),
    );
  }, [isConsultant, profile]);

  useEffect(() => {
    if (!isConsultant || !profile) {
      setManagerRequests([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "projectManagerRequests"), where("consultantId", "==", profile.uid)),
      (snapshot) => setManagerRequests(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as ProjectManagerRequest)
        .sort((a, b) => (b.requestedAt?.toMillis() ?? 0) - (a.requestedAt?.toMillis() ?? 0))),
      () => setMessage("Não foi possível carregar suas solicitações de gerência."),
    );
  }, [isConsultant, profile]);

  const visibleCompanies = useMemo(
    () => isAdmin ? items : items.filter((company) => company.active),
    [isAdmin, items],
  );

  async function lookup(form: HTMLFormElement) {
    const cnpj = String(new FormData(form).get("cnpj") || "");
    if (!cnpj.trim()) return;
    setLookupLoading(true);
    setMessage("");
    try {
      const company = await lookupCompanyByCnpj(cnpj);
      const set = (name: string, value: string | undefined | null) => {
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (input && value) input.value = value;
      };
      set("cnpj", company.cnpj);
      set("legalName", company.razao_social);
      set("tradeName", company.nome_fantasia);
      set("phone", company.ddd_telefone_1);
      set("email", company.email);
      set("zipCode", company.cep);
      set("street", company.logradouro);
      set("number", company.numero);
      set("complement", company.complemento);
      set("neighborhood", company.bairro);
      set("city", company.municipio);
      set("state", company.uf);
      setMessage(`Dados de ${company.razao_social} preenchidos pela BrasilAPI. Revise antes de enviar.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = event.currentTarget;
    const input = companyInput(new FormData(form));
    setSaving(true);
    setMessage("");
    try {
      if (isAdmin) {
        await saveCompany(input);
        setMessage("Empresa cadastrada com sucesso.");
      } else if (isConsultant) {
        await requestCompanyRegistration(profile, input);
        setMessage("Solicitação de cadastro enviada para aprovação do administrador.");
      }
      form.reset();
      setShowForm(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar os dados da empresa.");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin && !isConsultant) {
    return <Page title="Acesso negado"><p>Área disponível para administradores e consultores.</p></Page>;
  }

  return (
    <Page title="Empresas" subtitle={`${visibleCompanies.length} empresa(s) cadastrada(s)`}>
      <div className="toolbar">
        <p className="muted">
          {isAdmin
            ? "Consulte o CNPJ para preencher os dados automaticamente."
            : "Visualize as empresas disponíveis ou solicite o cadastro de uma nova empresa."}
        </p>
        <button className="primary" type="button" onClick={() => {
          setShowForm((value) => !value);
          setMessage("");
        }}>
          {showForm ? "Fechar" : isAdmin ? "Nova empresa" : "Solicitar cadastro"}
        </button>
      </div>

      {showForm && (
        <form className="form-grid panel" onSubmit={submit}>
          <div className="sector-form-heading">
            <h2>{isAdmin ? "Cadastrar empresa" : "Solicitar cadastro de empresa"}</h2>
            <p>{isAdmin ? "A empresa ficará disponível imediatamente." : "O administrador revisará os dados antes da inclusão."}</p>
          </div>
          <label>CNPJ<input name="cnpj" inputMode="numeric" placeholder="Somente números" onBlur={(event) => lookup(event.currentTarget.form!)} /></label>
          <div className="actions"><button type="button" disabled={lookupLoading} onClick={(event) => lookup(event.currentTarget.form!)}>{lookupLoading ? "Consultando…" : "Preencher pelo CNPJ"}</button></div>
          <label>Razão social *<input name="legalName" required /></label>
          <label>Nome fantasia<input name="tradeName" /></label>
          <label>Telefone<input name="phone" /></label>
          <label>E-mail<input name="email" type="email" /></label>
          <label>Contato<input name="contactName" /></label>
          <label>CEP<input name="zipCode" /></label>
          <label>Logradouro<input name="street" /></label>
          <label>Número<input name="number" /></label>
          <label>Complemento<input name="complement" /></label>
          <label>Bairro<input name="neighborhood" /></label>
          <label>Cidade<input name="city" /></label>
          <label>UF<input name="state" maxLength={2} /></label>
          <label className="wide">Observações<textarea name="notes" rows={3} /></label>
          {message && <p className="notice wide" role="status">{message}</p>}
          <div className="actions wide"><button className="primary" disabled={saving}>{saving ? "Enviando…" : isAdmin ? "Salvar empresa" : "Enviar solicitação"}</button></div>
        </form>
      )}

      {!showForm && message && <p className="notice" role="status">{message}</p>}

      {isConsultant && (
        <section className="panel">
          <h2>Minhas solicitações de cadastro</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>CNPJ</th><th>Enviada em</th><th>Status</th><th>Retorno</th></tr></thead>
              <tbody>{requests.map((request) => (
                <tr key={request.id}>
                  <td>{request.company.legalName}</td>
                  <td>{request.company.cnpj || "—"}</td>
                  <td>{request.requestedAt?.toDate().toLocaleString("pt-BR") || "Agora"}</td>
                  <td><span className={`badge ${request.status === "approved" ? "active" : request.status === "rejected" ? "inactive" : ""}`}>{requestStatusLabels[request.status]}</span></td>
                  <td>{request.rejectionReason || (request.status === "approved" ? "Cadastro concluído" : "Aguardando análise")}</td>
                </tr>
              ))}</tbody>
            </table>
            {!requests.length && <p className="empty">Nenhuma solicitação de cadastro enviada.</p>}
          </div>
        </section>
      )}

      {isConsultant && (
        <section className="panel">
          <h2>Minhas solicitações de gerência</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>Enviada em</th><th>Status</th><th>Retorno</th></tr></thead>
              <tbody>{managerRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.companyName}</td>
                  <td>{request.requestedAt?.toDate().toLocaleString("pt-BR") || "Agora"}</td>
                  <td><span className={`badge ${request.status === "approved" ? "active" : request.status === "rejected" ? "inactive" : ""}`}>{managerStatusLabels[request.status]}</span></td>
                  <td>{request.rejectionReason || (request.status === "approved" ? "Gerência liberada" : "Aguardando administrador")}</td>
                </tr>
              ))}</tbody>
            </table>
            {!managerRequests.length && <p className="empty">Nenhuma solicitação de gerência enviada.</p>}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Empresas cadastradas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Razão social</th><th>Nome fantasia</th><th>CNPJ</th><th>Cidade/UF</th><th>Status</th><th>Gerente de projeto</th><th>Ação</th></tr></thead>
            <tbody>{visibleCompanies.map((company) => (
              <tr key={company.id}>
                <td>{company.legalName}</td>
                <td>{company.tradeName || "—"}</td>
                <td>{company.cnpj || "—"}</td>
                <td>{[company.address?.city, company.address?.state].filter(Boolean).join("/") || "—"}</td>
                <td><span className={`badge ${company.active ? "active" : "inactive"}`}>{company.active ? "Ativa" : "Inativa"}</span></td>
                <td>{company.projectManagerName || "Sem gerente"}</td>
                <td>
                  {isConsultant && (() => {
                    const linked = profile?.companyIds?.includes(company.id);
                    const pending = managerRequests.some((request) => request.companyId === company.id && request.status === "pending");
                    if (company.projectManagerId === profile?.uid) return <span className="badge active">Você é o gerente</span>;
                    if (company.projectManagerId) return <span className="muted">Gerente definido</span>;
                    if (!linked) return <span className="muted">Sem vínculo</span>;
                    if (pending) return <span className="badge">Solicitação pendente</span>;
                    return <button className="primary" type="button" onClick={() => { setManagerCompany(company); setManagerReason(""); }}>Solicitar gerência</button>;
                  })()}
                  {isAdmin && (company.projectManagerId
                    ? <button className="danger" type="button" onClick={async () => { if (!profile || !window.confirm(`Remover ${company.projectManagerName} da gerência de ${company.legalName}?`)) return; try { await removeProjectManager(company, profile); setMessage("Gerente removido da empresa."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível remover o gerente."); } }}>Remover gerente</button>
                    : <span className="muted">—</span>)}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!visibleCompanies.length && <p className="empty">Nenhuma empresa cadastrada.</p>}
        </div>
      </section>

      {managerCompany && (
        <div className="demand-description-modal-backdrop" onMouseDown={() => !requestingManager && setManagerCompany(null)}>
          <section className="demand-description-modal" role="dialog" aria-modal="true" aria-labelledby="manager-request-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="demand-description-modal-header"><h2 id="manager-request-title">Solicitar função de gerente</h2><button className="demand-description-close" type="button" aria-label="Fechar" disabled={requestingManager} onClick={() => setManagerCompany(null)}>×</button></div>
            <p>Empresa: <strong>{managerCompany.legalName}</strong></p>
            <label>Justificativa (opcional)<textarea rows={4} value={managerReason} onChange={(event) => setManagerReason(event.target.value)} placeholder="Explique por que precisa gerenciar as demandas desta empresa." /></label>
            <div className="actions">
              <button className="primary" type="button" disabled={requestingManager} onClick={async () => {
                if (!profile) return;
                setRequestingManager(true);
                setMessage("");
                try {
                  await requestProjectManagerAccess(profile, managerCompany, managerReason);
                  setMessage("Solicitação de gerência enviada ao administrador.");
                  setManagerCompany(null);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
                } finally {
                  setRequestingManager(false);
                }
              }}>{requestingManager ? "Enviando…" : "Enviar solicitação"}</button>
              <button type="button" disabled={requestingManager} onClick={() => setManagerCompany(null)}>Cancelar</button>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
