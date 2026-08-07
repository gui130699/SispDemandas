import { createUserWithEmailAndPassword, deleteUser, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { auth, db } from "../lib/firebase";
import type { Company, Role } from "../types/models";

type PublicBootstrap = { initialized?: boolean };
const errorText = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("email-already-in-use")) return "Já existe uma conta com este e-mail.";
  if (code.includes("weak-password")) return "A senha deve ter pelo menos 8 caracteres.";
  if (code.includes("permission-denied")) return "Este cadastro não foi autorizado ou a configuração ainda não está pronta.";
  return "Não foi possível concluir o cadastro. Tente novamente.";
};

export function PublicRegistrationPage() {
  const [companies, setCompanies] = useState<Company[]>([]); const [role, setRole] = useState<Role | null>(null); const [bootstrap, setBootstrap] = useState<PublicBootstrap>({ initialized: true });
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [complete, setComplete] = useState<"client" | "consultant" | "admin" | null>(null);
  useEffect(() => onSnapshot(query(collection(db, "companies"), where("active", "==", true)), s => setCompanies(s.docs.map(d => ({ id: d.id, ...d.data() }) as Company).sort((a,b) => a.legalName.localeCompare(b.legalName, "pt-BR"))), () => setError("Não foi possível carregar as empresas.")), []);
  useEffect(() => onSnapshot(doc(db, "publicConfig", "bootstrap"), s => setBootstrap(s.exists() ? s.data() as PublicBootstrap : { initialized: true }), () => setBootstrap({ initialized: true })), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!role) return; setError(""); const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase(); const name = String(form.get("name")).trim(); const selected = role === "requester" ? [String(form.get("companyId") || "")] : form.getAll("companyIds").map(String).filter(Boolean);
    if (password.length < 8 || password !== confirmation) { setError(password.length < 8 ? "A senha deve ter pelo menos 8 caracteres." : "As senhas não coincidem."); return; }
    if (role !== "admin" && (!selected.length || selected.some(id => !companies.some(company => company.id === id)))) { setError(role === "consultant" ? "Selecione uma ou mais empresas válidas." : "Selecione uma empresa válida."); return; }
    setSaving(true); let created: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"] | null = null;
    try {
      created = (await createUserWithEmailAndPassword(auth, email, password)).user;
      if (role === "admin") {
        await runTransaction(db, async tx => { const owner = doc(db, "bootstrapConfig", "owner"), publicConfig = doc(db, "publicConfig", "bootstrap"); const [ownerDoc, publicDoc] = await Promise.all([tx.get(owner), tx.get(publicConfig)]);
          if (!ownerDoc.exists() || ownerDoc.data().initialized === true || ownerDoc.data().emailNormalized !== email || publicDoc.data()?.initialized === true) throw new Error("permission-denied");
          tx.set(doc(db, "users", created!.uid), { uid: created!.uid, name, email, emailNormalized: email, role: "admin", companyId: null, companyIds: [], active: true, registrationStatus: "approved", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          tx.update(owner, { initialized: true, adminUid: created!.uid, initializedAt: serverTimestamp() }); tx.set(publicConfig, { initialized: true, initializedAt: serverTimestamp() }, { merge: true });
        });
        setComplete("admin");
      } else {
        const company = companies.find(item => item.id === selected[0]);
        await runTransaction(db, async tx => tx.set(doc(db, "users", created!.uid), { uid: created!.uid, name, email, emailNormalized: email, role, companyId: role === "requester" ? company!.id : null, companyName: role === "requester" ? company!.legalName : null, companyIds: role === "consultant" ? selected : [], requestedCompanyIds: role === "consultant" ? selected : [], defaultSector: String(form.get("defaultSector") || "").trim(), phone: String(form.get("phone") || "").trim(), active: false, registrationStatus: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await signOut(auth); setComplete(role === "consultant" ? "consultant" : "client");
      }
    } catch (failure) { if (created) try { await deleteUser(created); } catch { /* Firestore denial can leave an unauthorised Auth account; it has no system access. */ } await signOut(auth); setError(errorText(failure)); } finally { setSaving(false); }
  }
  if (complete) return <section className="auth"><div className="auth-card"><Brand /><h1>{complete === "admin" ? "Administrador configurado" : "Cadastro enviado"}</h1><p>{complete === "admin" ? "O bootstrap foi concluído com segurança. Agora entre para administrar o sistema." : complete === "consultant" ? "Seu perfil de consultor está aguardando aprovação." : "Seu acesso está aguardando aprovação do administrador."}</p><Link to="/login">Voltar ao acesso</Link></div></section>;
  return <section className="auth"><div className="auth-card"><Brand />{!role ? <><h1>Como você utilizará o SISPDEMANDAS?</h1><div className="cards"><button className="card" onClick={() => setRole("requester")}><strong>Cliente</strong><small>Abra e acompanhe demandas da sua empresa.</small></button><button className="card" onClick={() => setRole("consultant")}><strong>Consultor</strong><small>Gerencie e execute demandas das empresas em que presta atendimento.</small></button>{bootstrap.initialized === false && <button className="card" onClick={() => setRole("admin")}><strong>Configurar administrador</strong><small>Disponível somente para o e-mail proprietário autorizado.</small></button>}</div><Link to="/login">Já tenho acesso</Link></> : <><button type="button" onClick={() => setRole(null)}>← Escolher outro perfil</button><h1>{role === "requester" ? "Cadastro de Cliente" : role === "consultant" ? "Cadastro de Consultor" : "Configurar administrador"}</h1><form onSubmit={submit}><label>Nome completo<input name="name" required minLength={3} autoFocus /></label><label>E-mail<input name="email" type="email" required autoComplete="email" /></label>{role === "requester" && <label>Empresa<select name="companyId" required defaultValue=""><option value="" disabled>Selecione uma empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.legalName}</option>)}</select></label>}{role === "consultant" && <label>Empresas em que presta atendimento<select name="companyIds" multiple required size={Math.min(5, Math.max(2, companies.length))}>{companies.map(c => <option key={c.id} value={c.id}>{c.legalName}</option>)}</select><small>Use Ctrl/Cmd para selecionar mais de uma empresa.</small></label>}{role !== "admin" && <><label>Setor padrão (opcional)<input name="defaultSector" /></label><label>Telefone (opcional)<input name="phone" type="tel" /></label></>}<label>Senha<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirmar senha<input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={saving || (role !== "admin" && !companies.length)}>{saving ? "Enviando…" : role === "admin" ? "Configurar administrador" : "Enviar cadastro"}</button></form><Link to="/login">Já tenho acesso</Link></>}</div></section>;
}
