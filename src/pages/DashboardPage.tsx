import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import type { Company, Demand } from "../types/models";
import { linkConsultantCompany } from "../services/users";
import { elapsedDays } from "../utils/dates";

export function DashboardPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Demand[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyToLink, setCompanyToLink] = useState("");
  const [linkingCompany, setLinkingCompany] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    if (profile?.role !== "consultant") {
      setCompanies([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "companies"), where("active", "==", true)),
      (snapshot) =>
        setCompanies(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as Company),
        ),
    );
  }, [profile]);

  useEffect(() => {
    if (profile?.role !== "consultant") return;
    if (!selectedCompanyId) {
      setSelectedCompanyId(profile.companyIds?.[0] ?? "");
    }
  }, [profile, selectedCompanyId]);

  const linkedCompanies = useMemo(
    () =>
      companies.filter((company) => profile?.companyIds?.includes(company.id)),
    [companies, profile?.companyIds],
  );
  const availableCompanies = useMemo(
    () =>
      companies.filter((company) => !profile?.companyIds?.includes(company.id)),
    [companies, profile?.companyIds],
  );

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "consultant" && !selectedCompanyId) {
      setItems([]);
      return;
    }
    const ref =
      profile.role === "requester"
        ? query(
            collection(db, "demands"),
            where("companyId", "==", profile.companyId),
          )
        : profile.role === "consultant"
          ? query(
              collection(db, "demands"),
              where("companyId", "==", selectedCompanyId),
            )
          : query(collection(db, "demands"));
    return onSnapshot(ref, (snapshot) => {
      setItems(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as Demand,
        ),
      );
    });
  }, [profile, selectedCompanyId]);

  const open = items.filter(
    (item) => !["completed", "cancelled"].includes(item.status),
  );
  const cards = [
    ["Demandas abertas", open.length],
    [
      "Aguardando informações",
      open.filter((item) => item.status === "waiting_information").length,
    ],
    ["Sem consultor", open.filter((item) => !item.consultantId).length],
    ["Concluídas", items.filter((item) => item.status === "completed").length],
  ];

  return (
    <Page title="Dashboard" subtitle="Visão geral das demandas">
      <div className="toolbar dashboard-actions">
        {profile?.role === "admin" && (
          <Link className="primary dashboard-primary-action" to="/usuarios?novo=1">
            Cadastrar usuário
          </Link>
        )}
        {profile?.role === "requester" && (
          <Link className="primary dashboard-primary-action" to="/demandas/nova">
            Nova demanda
          </Link>
        )}
        {profile?.role === "consultant" && (
          <label className="dashboard-company-filter">
            Empresa atendida
            <select
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              disabled={!linkedCompanies.length}
            >
              {!linkedCompanies.length && <option value="">Nenhuma empresa vinculada</option>}
              {linkedCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.legalName}
                </option>
              ))}
            </select>
          </label>
        )}
        {profile?.role === "consultant" && (
          <div className="dashboard-company-link">
            <select
              aria-label="Empresa para vincular"
              value={companyToLink}
              onChange={(event) => setCompanyToLink(event.target.value)}
              disabled={!availableCompanies.length || linkingCompany}
            >
              <option value="">
                {availableCompanies.length
                  ? "Vincular outra empresa"
                  : "Todas as empresas estão vinculadas"}
              </option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.legalName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              disabled={!companyToLink || linkingCompany}
              onClick={async () => {
                if (!profile || !companyToLink) return;
                setLinkError("");
                setLinkingCompany(true);
                try {
                  await linkConsultantCompany(profile, companyToLink);
                  setSelectedCompanyId(companyToLink);
                  setCompanyToLink("");
                } catch (error) {
                  setLinkError(
                    error instanceof Error
                      ? error.message
                      : "Não foi possível vincular a empresa.",
                  );
                } finally {
                  setLinkingCompany(false);
                }
              }}
            >
              {linkingCompany ? "Vinculando…" : "Vincular empresa"}
            </button>
          </div>
        )}
      </div>
      {linkError && <p className="error">{linkError}</p>}
      <div className="cards">
        {cards.map(([label, value]) => (
          <Link
            key={String(label)}
            className="card"
            to={
              profile?.role === "consultant" && selectedCompanyId
                ? `/demandas?empresa=${encodeURIComponent(selectedCompanyId)}`
                : "/demandas"
            }
          >
            <small>{label}</small>
            <strong>{value}</strong>
          </Link>
        ))}
      </div>
      <section className="panel">
        <h2>Demandas mais antigas</h2>
        {open
          .sort((a, b) => elapsedDays(b.createdAt) - elapsedDays(a.createdAt))
          .slice(0, 5)
          .map((demand) => (
            <Link
              className="list-row"
              key={demand.id}
              to={`/demandas/${demand.id}`}
            >
              <b>{demand.code}</b>
              <span>{demand.title}</span>
              <small>{elapsedDays(demand.createdAt)} dias</small>
            </Link>
          ))}
        {!open.length && (
          <p className="empty">
            {profile?.role === "consultant" && !selectedCompanyId
              ? "Selecione uma empresa para visualizar as demandas."
              : "Nenhuma demanda aberta."}
          </p>
        )}
      </section>
    </Page>
  );
}

export const Page = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) => (
  <div className="page">
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);
