import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import type { Company, Role, UserProfile } from "../types/models";
import {
  createManagedUser,
  deleteManagedUser,
  resendPasswordSetup,
  setUserActive,
  userCreationError,
} from "../services/users";
import { Page } from "./DashboardPage";

function Admin({ children }: { children: ReactNode }) {
  return useAuth().profile?.role === "admin" ? (
    <>{children}</>
  ) : (
    <Page title="Acesso negado">
      <p>Área exclusiva de administradores.</p>
    </Page>
  );
}

export function CompaniesPage() {
  const [items, setItems] = useState<Company[]>([]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "companies"), orderBy("legalName")),
        (snapshot) => {
          setItems(
            snapshot.docs.map(
              (item) => ({ id: item.id, ...item.data() }) as Company,
            ),
          );
        },
      ),
    [],
  );
  return (
    <Admin>
      <Page title="Empresas">
        <p className="muted">
          Cadastre e edite empresas pelo módulo administrativo.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Razão social</th>
                <th>CNPJ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((company) => (
                <tr key={company.id}>
                  <td>{company.legalName}</td>
                  <td>{company.cnpj || "—"}</td>
                  <td>{company.active ? "Ativa" : "Inativa"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </Admin>
  );
}

const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  consultant: "Consultor",
  requester: "Solicitante",
};

export function UsersPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(
    () => searchParams.get("novo") === "1",
  );
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role>("requester");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "users"), orderBy("name")),
        (snapshot) => {
          setItems(
            snapshot.docs.map(
              (item) => ({ uid: item.id, ...item.data() }) as UserProfile,
            ),
          );
        },
      ),
    [],
  );

  useEffect(() => {
    if (searchParams.get("novo") === "1") setShowForm(true);
  }, [searchParams]);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "companies"), where("active", "==", true)),
        (snapshot) => {
          setCompanies(
            snapshot.docs
              .map((item) => ({ id: item.id, ...item.data() }) as Company)
              .sort((a, b) => a.legalName.localeCompare(b.legalName, "pt-BR")),
          );
        },
      ),
    [],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      `${item.name} ${item.email}`.toLowerCase().includes(term),
    );
  }, [items, search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const companyId =
      role === "requester" ? String(data.get("companyId") || "") : "";
    const company = companies.find((item) => item.id === companyId);
    if (role === "requester" && !company) {
      setError("Selecione a empresa do solicitante.");
      return;
    }

    setSaving(true);
    try {
      await createManagedUser(
        {
          name: String(data.get("name")),
          email: String(data.get("email")),
          role,
          companyId: company?.id ?? null,
          companyName: company?.legalName ?? null,
        },
        profile,
      );
      form.reset();
      setRole("requester");
      setShowForm(false);
      setSearchParams({});
      setNotice(
        "Usuário cadastrado. O e-mail para definição de senha foi enviado.",
      );
    } catch (creationError) {
      setError(userCreationError(creationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Admin>
      <Page title="Usuários" subtitle={`${filtered.length} usuário(s)`}>
        <div className="toolbar">
          <input
            aria-label="Pesquisar usuários"
            placeholder="Pesquisar por nome ou e-mail"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            className="primary"
            type="button"
            onClick={() => {
              setShowForm((current) => !current);
              setSearchParams({});
              setError("");
              setNotice("");
            }}
          >
            {showForm ? "Fechar cadastro" : "Cadastrar usuário"}
          </button>
        </div>

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {showForm && (
          <form className="form-grid panel" onSubmit={submit}>
            <label>
              Nome completo *
              <input
                name="name"
                required
                minLength={3}
                maxLength={120}
                autoFocus
              />
            </label>
            <label>
              E-mail *
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Perfil *
              <select
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="requester">Solicitante</option>
                <option value="consultant">Consultor</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            {role === "requester" && (
              <label>
                Empresa *
                <select name="companyId" required defaultValue="">
                  <option value="" disabled>
                    Selecione uma empresa
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.legalName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted wide">
              O usuário receberá um e-mail do Firebase para definir a própria
              senha. Nenhuma senha é armazenada no sistema.
            </p>
            {error && (
              <p className="error wide" role="alert">
                {error}
              </p>
            )}
            <div className="actions wide">
              <button className="primary" disabled={saving}>
                {saving ? "Cadastrando…" : "Cadastrar usuário"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowForm(false);
                  setSearchParams({});
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Empresa</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.uid}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{roleLabels[user.role]}</td>
                  <td>{user.companyName || "—"}</td>
                  <td>
                    <span
                      className={`badge ${user.active ? "active" : "inactive"}`}
                    >
                      {user.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!profile || user.uid === profile.uid) return;
                          await setUserActive(user, !user.active, profile);
                        }}
                        disabled={user.uid === profile?.uid}
                        title={
                          user.uid === profile?.uid
                            ? "Você não pode inativar sua própria conta"
                            : undefined
                        }
                      >
                        {user.active ? "Inativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await resendPasswordSetup(user.email);
                            setNotice(`E-mail enviado para ${user.email}.`);
                          } catch {
                            setError(
                              "Não foi possível enviar o e-mail de redefinição.",
                            );
                          }
                        }}
                      >
                        Redefinir senha
                      </button>
                      <button
                        className="danger"
                        type="button"
                        disabled={user.uid === profile?.uid}
                        onClick={async () => {
                          if (!profile || user.uid === profile.uid) return;
                          if (!window.confirm(`Excluir permanentemente ${user.name}? Esta ação remove o acesso e não pode ser desfeita.`)) return;
                          try {
                            await deleteManagedUser(user, profile);
                            setNotice(`${user.name} foi excluído permanentemente.`);
                          } catch {
                            setError("Não foi possível excluir o usuário. Verifique se a função administrativa foi publicada.");
                          }
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="empty">Nenhum usuário encontrado.</p>
          )}
        </div>
      </Page>
    </Admin>
  );
}

export function LevelsPage() {
  return (
    <Admin>
      <Page title="Níveis e SLA">
        <p className="muted">
          Os níveis ativos cadastrados no Firestore aparecem no formulário de
          demanda.
        </p>
      </Page>
    </Admin>
  );
}

export function AuditPage() {
  return (
    <Admin>
      <Page title="Auditoria">
        <p className="muted">
          Os eventos registrados no sistema ficam disponíveis somente a
          administradores.
        </p>
      </Page>
    </Admin>
  );
}
