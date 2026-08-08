import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import { approveRegistration, rejectRegistration } from "../services/users";
import type { Company, UserProfile } from "../types/models";
import { Page } from "./DashboardPage";

export function ApprovalsPage() {
  const { profile } = useAuth(); const [users, setUsers] = useState<UserProfile[]>([]); const [companies, setCompanies] = useState<Company[]>([]); const [message, setMessage] = useState("");
  useEffect(() => onSnapshot(query(collection(db, "users"), where("registrationStatus", "==", "pending"), orderBy("createdAt", "desc")), snapshot => setUsers(snapshot.docs.map(item => ({ uid: item.id, ...item.data() }) as UserProfile)), () => setMessage("Não foi possível carregar as aprovações. Verifique o índice do Firestore.")), []);
  useEffect(() => onSnapshot(collection(db, "companies"), snapshot => setCompanies(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as Company))), []);
  if (profile?.role !== "admin") return <Page title="Acesso negado"><p>Área exclusiva de administradores.</p></Page>;
  const admin = profile;
  async function approve(user: UserProfile) { try { await approveRegistration(user, admin, user.role === "consultant" ? user.requestedCompanyIds : undefined); setMessage(`${user.name} foi aprovado.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aprovar."); } }
  return <Page title="Aprovações" subtitle={`${users.length} cadastro(s) aguardando`}><div className="cards"><div className="card"><small>Clientes aguardando</small><strong>{users.filter(user => user.role === "requester").length}</strong></div><div className="card"><small>Consultores aguardando</small><strong>{users.filter(user => user.role === "consultant").length}</strong></div></div>{message && <p className="notice">{message}</p>}<div className="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>E-mail</th><th>Empresas</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.uid}><td>{user.name}</td><td>{user.role === "consultant" ? "Consultor" : "Cliente"}</td><td>{user.email}</td><td>{user.role === "consultant" ? (user.requestedCompanyIds ?? []).map(id => companies.find(company => company.id === id)?.legalName ?? id).join(", ") : user.companyName}</td><td><div className="row-actions"><button className="primary" onClick={() => approve(user)}>Aprovar</button><button className="danger" onClick={async () => { const reason = window.prompt("Motivo da rejeição:") ?? ""; await rejectRegistration(user, admin, reason); }}>Rejeitar</button></div></td></tr>)}</tbody></table></div></Page>;
}
