import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { auth, db } from "../lib/firebase";
import type { Company } from "../types/models";

function registrationError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code.includes("email-already-in-use"))
    return "Já existe uma conta com este e-mail.";
  if (code.includes("invalid-email")) return "Informe um e-mail válido.";
  if (code.includes("weak-password"))
    return "A senha deve ter pelo menos 8 caracteres.";
  if (code.includes("permission-denied"))
    return "Não foi possível concluir o cadastro. Tente novamente mais tarde.";
  if (code.includes("network-request-failed"))
    return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível concluir o cadastro. Tente novamente.";
}

export function PublicRegistrationPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

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
        () => setError("Não foi possível carregar as empresas disponíveis."),
      ),
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const company = companies.find((item) => item.id === form.get("companyId"));
    if (!company) {
      setError("Selecione uma empresa válida.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }

    setSaving(true);
    let createdUser:
      | Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"]
      | null = null;
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        String(form.get("email")).trim().toLowerCase(),
        password,
      );
      createdUser = credential.user;
      await setDoc(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        name: String(form.get("name")).trim(),
        email: String(form.get("email")).trim().toLowerCase(),
        emailNormalized: String(form.get("email")).trim().toLowerCase(),
        role: "requester",
        companyId: company.id,
        companyName: company.legalName,
        active: false,
        registrationStatus: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await signOut(auth);
      setComplete(true);
    } catch (registrationFailure) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          // A conta recém-criada só permanece quando o Firebase impede a reversão.
        }
      }
      await signOut(auth);
      setError(registrationError(registrationFailure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="auth">
      <div className="auth-card">
        <Brand />
        {complete ? (
          <>
            <h1>Cadastro enviado</h1>
            <p>
              Seu acesso está aguardando aprovação do administrador da empresa.
            </p>
            <Link to="/login">Voltar ao acesso</Link>
          </>
        ) : (
          <>
            <h1>Novo cadastro</h1>
            <p>
              Cadastre-se como solicitante. Seu acesso será liberado após
              aprovação.
            </p>
            <form onSubmit={submit}>
              <label>
                Nome completo
                <input
                  name="name"
                  required
                  minLength={3}
                  maxLength={120}
                  autoFocus
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Empresa
                <select
                  name="companyId"
                  required
                  defaultValue=""
                  disabled={!companies.length}
                >
                  <option value="" disabled>
                    {companies.length
                      ? "Selecione uma empresa"
                      : "Nenhuma empresa disponível"}
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.legalName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Senha
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirmar senha
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary"
                disabled={saving || !companies.length}
              >
                {saving ? "Enviando…" : "Enviar cadastro"}
              </button>
            </form>
            <Link to="/login">Já tenho acesso</Link>
          </>
        )}
      </div>
    </section>
  );
}
