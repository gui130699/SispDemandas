import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../features/auth/AuthContext";
import type { Demand } from "../types/models";
import { elapsedDays } from "../utils/dates";

export function DashboardPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Demand[]>([]);

  useEffect(() => {
    if (!profile) return;
    const ref =
      profile.role === "requester"
        ? query(
            collection(db, "demands"),
            where("companyId", "==", profile.companyId),
          )
        : profile.role === "consultant"
          ? query(
              collection(db, "demands"),
              where("consultantId", "==", profile.uid),
            )
          : query(collection(db, "demands"));
    return onSnapshot(ref, (snapshot) => {
      setItems(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as Demand,
        ),
      );
    });
  }, [profile]);

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
      </div>
      <div className="cards">
        {cards.map(([label, value]) => (
          <Link key={String(label)} className="card" to="/demandas">
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
        {!open.length && <p className="empty">Nenhuma demanda aberta.</p>}
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
