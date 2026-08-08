import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import { approveSectorRequest, createSector, rejectSectorRequest } from "../services/sectors";
import type { Company, Sector, SectorRequest } from "../types/models";
import { Page } from "./DashboardPage";

export function SectorsPage() {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [requests, setRequests] = useState<SectorRequest[]>([]);
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState<SectorRequest | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => onSnapshot(query(collection(db, "companies"), orderBy("legalName")), (snapshot) => setCompanies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Company)), () => setMessage("Não foi possível carregar as empresas.")), []);
  useEffect(() => onSnapshot(query(collection(db, "sectors"), orderBy("name")), (snapshot) => setSectors(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Sector)), () => setMessage("Não foi possível carregar os setores.")), []);
  useEffect(() => onSnapshot(query(collection(db, "sectorRequests"), where("status", "==", "pending")), (snapshot) => setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as SectorRequest)), () => setMessage("Não foi possível carregar as solicitações.")), []);
  const companiesById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  if (profile?.role !== "admin") return <Page title="Acesso negado"><p>Área exclusiva de administradores.</p></Page>;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const company = companiesById.get(String(form.get("companyId") || "")); try { if (!company) throw new Error("Selecione uma empresa."); await createSector(company, String(form.get("name") || "")); event.currentTarget.reset(); setMessage("Setor salvo com sucesso."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o setor."); } }
  return <Page title="Setores" subtitle={`${sectors.length} setor(es) aprovado(s)`}>
    {message && <p className="notice" role="status">{message}</p>}
    <form className="form-grid panel" onSubmit={submit}><label>Empresa *<select name="companyId" required defaultValue=""><option value="" disabled>Selecione a empresa</option>{companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}</select></label><label>Nome do setor *<input name="name" required minLength={2}/></label><div className="actions"><button className="primary">Cadastrar setor</button></div></form>
    <section className="panel"><h2>Solicitações pendentes</h2><div className="table-wrap"><table><thead><tr><th>Setor</th><th>Empresa</th><th>Solicitante</th><th>Ações</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{request.name}</td><td>{request.companyName}</td><td>{request.requestedByName}</td><td><div className="row-actions"><button className="primary" type="button" onClick={async () => { try { await approveSectorRequest(request, profile); setMessage("Setor aprovado e disponibilizado."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aprovar."); } }}>Aprovar</button><button className="danger" type="button" onClick={() => { setRejecting(request); setReason(""); }}>Rejeitar</button></div></td></tr>)}</tbody></table>{!requests.length && <p className="empty">Não há solicitações pendentes.</p>}</div></section>
    <section className="panel"><h2>Setores cadastrados</h2><div className="table-wrap"><table><thead><tr><th>Setor</th><th>Empresa</th><th>Status</th></tr></thead><tbody>{sectors.map((sector) => <tr key={sector.id}><td>{sector.name}</td><td>{sector.companyName}</td><td>{sector.active ? "Ativo" : "Inativo"}</td></tr>)}</tbody></table></div></section>
    {rejecting && <div className="demand-description-modal-backdrop" onMouseDown={() => setRejecting(null)}><section className="demand-description-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="demand-description-modal-header"><h2>Rejeitar solicitação de setor</h2><button className="demand-description-close" type="button" onClick={() => setRejecting(null)}>×</button></div><label>Motivo *<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus/></label><div className="actions"><button className="danger" type="button" disabled={!reason.trim()} onClick={async () => { try { await rejectSectorRequest(rejecting, profile, reason); setRejecting(null); setMessage("Solicitação rejeitada."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível rejeitar."); } }}>Confirmar</button><button type="button" onClick={() => setRejecting(null)}>Cancelar</button></div></section></div>}
  </Page>;
}
