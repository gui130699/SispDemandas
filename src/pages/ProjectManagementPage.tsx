import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { db } from "../lib/firebase";
import { assignManagedDemand } from "../services/projectManagement";
import type { Company, CompanyAccess, Demand } from "../types/models";
import { legacyStatusLabels } from "../types/models";
import { Page } from "./DashboardPage";

export function ProjectManagementPage() {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [demands, setDemands] = useState<Demand[]>([]);
  const [members, setMembers] = useState<CompanyAccess[]>([]);
  const [message, setMessage] = useState("");
  const isConsultant = profile?.role === "consultant";

  useEffect(() => {
    if (!isConsultant || !profile) return;
    return onSnapshot(
      query(collection(db, "companies"), where("projectManagerId", "==", profile.uid)),
      (snapshot) => setCompanies(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Company)
        .filter((company) => company.active)
        .sort((a, b) => a.legalName.localeCompare(b.legalName, "pt-BR"))),
      () => setMessage("Não foi possível carregar as empresas gerenciadas."),
    );
  }, [isConsultant, profile]);

  useEffect(() => {
    if (!companies.length) {
      setSelectedCompanyId("");
      return;
    }
    if (!companies.some((company) => company.id === selectedCompanyId)) setSelectedCompanyId(companies[0].id);
  }, [companies, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setDemands([]);
      setMembers([]);
      return;
    }
    const stopDemands = onSnapshot(
      query(collection(db, "demands"), where("companyId", "==", selectedCompanyId)),
      (snapshot) => setDemands(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Demand)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))),
      () => setMessage("Não foi possível carregar as demandas desta empresa."),
    );
    const stopMembers = onSnapshot(
      query(collection(db, "companyAccess"), where("companyId", "==", selectedCompanyId)),
      (snapshot) => setMembers(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as CompanyAccess)
        .filter((member) => member.active && member.consultantAccess)
        .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"))),
      () => setMessage("Não foi possível carregar os consultores vinculados."),
    );
    return () => {
      stopDemands();
      stopMembers();
    };
  }, [selectedCompanyId]);

  const metrics = useMemo(() => ({
    total: demands.length,
    open: demands.filter((demand) => !["completed", "cancelled"].includes(demand.status)).length,
    unassigned: demands.filter((demand) => !demand.consultantId).length,
    completed: demands.filter((demand) => demand.status === "completed").length,
  }), [demands]);

  if (!isConsultant || !profile) return <Page title="Acesso negado"><p>Área exclusiva para gerentes de projeto.</p></Page>;

  return (
    <Page title="Gerência" subtitle="Distribua e acompanhe as demandas das empresas sob sua responsabilidade">
      {message && <p className="notice" role="status">{message}</p>}
      {!companies.length ? (
        <section className="panel">
          <h2>Nenhuma empresa sob sua gerência</h2>
          <p className="muted">Abra a aba Empresas e solicite ao administrador a função de gerente em uma empresa vinculada.</p>
          <Link className="primary" to="/empresas">Ir para Empresas</Link>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <label className="dashboard-company-filter">
              Empresa gerenciada
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
              </select>
            </label>
          </div>
          <div className="cards">
            <div className="card"><small>Total</small><strong>{metrics.total}</strong></div>
            <div className="card"><small>Abertas</small><strong>{metrics.open}</strong></div>
            <div className="card"><small>Sem consultor</small><strong>{metrics.unassigned}</strong></div>
            <div className="card"><small>Concluídas</small><strong>{metrics.completed}</strong></div>
          </div>
          <section className="panel">
            <h2>Demandas da empresa</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>ID</th><th>Título</th><th>Status</th><th>Prioridade</th><th>Consultor responsável</th><th>Ação</th></tr></thead>
                <tbody>{demands.map((demand) => (
                  <tr key={demand.id}>
                    <td>{demand.code}</td>
                    <td>{demand.title}</td>
                    <td>{demand.statusName || legacyStatusLabels[demand.status]}</td>
                    <td>{demand.priority}</td>
                    <td>
                      <select
                        aria-label={`Consultor da demanda ${demand.code}`}
                        value={demand.consultantId ?? ""}
                        onChange={async (event) => {
                          const member = members.find((item) => item.userId === event.target.value) ?? null;
                          setMessage("");
                          try {
                            await assignManagedDemand(demand, profile, member);
                            setMessage(member ? `${member.userName} foi atribuído à demanda ${demand.code}.` : `A demanda ${demand.code} ficou sem consultor.`);
                          } catch (error) {
                            setMessage(error instanceof Error ? error.message : "Não foi possível alterar o responsável.");
                          }
                        }}
                      >
                        <option value="">Sem consultor</option>
                        {members.map((member) => <option key={member.id} value={member.userId}>{member.userName}</option>)}
                      </select>
                    </td>
                    <td><Link className="primary" to={`/demandas/${demand.id}`}>Abrir</Link></td>
                  </tr>
                ))}</tbody>
              </table>
              {!demands.length && <p className="empty">Nenhuma demanda registrada para esta empresa.</p>}
            </div>
          </section>
        </>
      )}
    </Page>
  );
}
