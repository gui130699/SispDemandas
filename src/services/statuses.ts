import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Demand, DemandStatus, LegacyStatus, UserProfile } from "../types/models";

export const defaultStatuses: Omit<DemandStatus, "id">[] = [
  { name: "Em análise", description: "Demanda registrada e aguardando avaliação.", color: "#3b82f6", order: 10, active: true, isInitial: true, legacyKeys: ["new", "triage", "analysis"] },
  { name: "Aguardando informações", description: "Há informações pendentes do cliente.", color: "#f59e0b", order: 20, active: true, legacyKeys: ["waiting_information"] },
  { name: "Em execução", description: "Trabalho em andamento.", color: "#8b5cf6", order: 30, active: true, legacyKeys: ["development"] },
  { name: "Em teste", description: "Solução em testes.", color: "#06b6d4", order: 40, active: true, legacyKeys: ["testing"] },
  { name: "Aguardando validação", description: "Aguardando aceite do cliente.", color: "#ec4899", order: 50, active: true, legacyKeys: ["waiting_validation"] },
  { name: "Pausada", description: "Execução temporariamente pausada.", color: "#64748b", order: 60, active: true, isPaused: true, legacyKeys: ["paused"] },
  { name: "Concluída", description: "Demanda finalizada.", color: "#16a34a", order: 90, active: true, isFinal: true, finalType: "completed", legacyKeys: ["completed"] },
  { name: "Cancelada", description: "Demanda cancelada.", color: "#dc2626", order: 100, active: true, isFinal: true, finalType: "cancelled", legacyKeys: ["cancelled"] },
];

export async function ensureDefaultStatuses() {
  const current = await getDocs(query(collection(db, "demandStatuses"), orderBy("order")));
  if (!current.empty) return;
  const batch = writeBatch(db);
  defaultStatuses.forEach((status) => batch.set(doc(collection(db, "demandStatuses")), { ...status, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await batch.commit();
}

export function resolveStatus(demand: Demand, statuses: DemandStatus[]) {
  if (demand.statusId) return statuses.find((item) => item.id === demand.statusId) ?? { id: demand.statusId, name: demand.statusName ?? demand.status, color: demand.statusColor ?? "#64748b", order: 999, active: true };
  return statuses.find((item) => item.legacyKeys?.includes(demand.status)) ?? { id: demand.status, name: legacyName(demand.status), color: "#64748b", order: 999, active: true };
}
function legacyName(status: LegacyStatus) { return ({ new: "Em análise", triage: "Em análise", waiting_information: "Aguardando informações", analysis: "Em análise", development: "Em execução", testing: "Em teste", waiting_validation: "Aguardando validação", completed: "Concluída", cancelled: "Cancelada", paused: "Pausada" } satisfies Record<LegacyStatus, string>)[status]; }

export async function saveStatus(status: Omit<DemandStatus, "id">, id?: string) {
  if (status.isInitial) {
    const current = await getDocs(query(collection(db, "demandStatuses"), orderBy("order")));
    if (current.docs.some((item) => item.id !== id && item.data().active === true && item.data().isInitial === true)) {
      throw new Error("Somente um status ativo pode ser inicial.");
    }
  }
  await setDoc(id ? doc(db, "demandStatuses", id) : doc(collection(db, "demandStatuses")), { ...status, updatedAt: serverTimestamp(), ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
}

export function canChangeDemandStatus(user: UserProfile) { return user.role === "admin" || (user.role === "consultant" && user.permissions?.changeStatus === true); }
