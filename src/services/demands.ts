import { addDoc, collection, doc, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeText } from "../utils/normalization";
import type { Demand, DemandStatus, Priority, UserProfile } from "../types/models";
import { audit } from "./audit";

export async function createDemand(data: { title: string; description: string; screenName: string; formName: string; levelId: string; levelName: string; priority: Priority; companyId: string; companyName: string; requesterSector?: string }, user: UserProfile, initialStatus: DemandStatus) {
  if (user.role === "requester" && user.companyId !== data.companyId) throw new Error("Empresa inválida.");
  const ref = doc(collection(db, "demands")); let code = "";
  await runTransaction(db, async tx => { const counter = doc(db, "counters", "demands"), snapshot = await tx.get(counter), sequence = (snapshot.data()?.sequence ?? 0) + 1, year = new Date().getFullYear(); code = `DEM-${year}-${String(sequence).padStart(6, "0")}`;
    tx.set(counter, { sequence, updatedAt: serverTimestamp() }); tx.set(ref, { ...data, id: ref.id, code, sequence, year, requesterId: user.uid, requesterName: user.name, requesterSector: data.requesterSector ?? user.defaultSector ?? "", screenNameNormalized: normalizeText(data.screenName), formNameNormalized: normalizeText(data.formName), status: "analysis", statusId: initialStatus.id, statusName: initialStatus.name, statusColor: initialStatus.color, statusUpdatedAt: serverTimestamp(), consultantId: null, consultantName: null, executionApprovedAt: null, completedAt: null, deletedAt: null, createdBy: user.uid, updatedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), attachmentCount: 0, publicNoteCount: 0, internalNoteCount: 0, schemaVersion: 2 }); tx.set(doc(collection(ref, "history")), { type: "status", statusId: initialStatus.id, statusName: initialStatus.name, observation: "Demanda registrada.", authorId: user.uid, authorName: user.name, createdAt: serverTimestamp() });
  }); await audit(user, "create", "demand", ref.id, data.companyId, undefined, { code }); return ref.id;
}

export async function changeDemandStatus(demand: Demand, status: DemandStatus, user: UserProfile, observation?: string) {
  if (!observation?.trim()) throw new Error("Informe uma observação sobre a alteração de status.");
  const patch = { status: status.legacyKeys?.[0] ?? "analysis", statusId: status.id, statusName: status.name, statusColor: status.color, statusUpdatedAt: serverTimestamp(), updatedBy: user.uid, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), ...(status.name.toLowerCase().includes("execu") ? { startedAt: serverTimestamp() } : {}), ...(status.name.toLowerCase().includes("paus") ? { pausedAt: serverTimestamp() } : {}), ...(status.name.toLowerCase().includes("conclu") ? { completedAt: serverTimestamp(), completedBy: user.uid } : {}) };
  await updateDoc(doc(db, "demands", demand.id), patch); await addDoc(collection(db, "demands", demand.id, "history"), { type: "status", statusId: status.id, statusName: status.name, observation: observation.trim(), authorId: user.uid, authorName: user.name, createdAt: serverTimestamp() }); await audit(user, "status", "demand", demand.id, demand.companyId, undefined, { statusId: status.id, observation: observation.trim() });
}
export async function acceptDemand(demand: Demand, consultant: UserProfile) {
  if (consultant.role !== "consultant") throw new Error("Apenas consultores podem assumir demandas.");
  if (demand.consultantId) throw new Error("Esta demanda já possui um consultor.");
  if (!consultant.companyIds?.includes(demand.companyId)) throw new Error("Vincule-se à empresa antes de assumir esta demanda.");
  await updateDoc(doc(db, "demands", demand.id), { consultantId: consultant.uid, consultantName: consultant.name, updatedBy: consultant.uid, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
  await addDoc(collection(db, "demands", demand.id, "history"), { type: "assignment", consultantId: consultant.uid, consultantName: consultant.name, authorId: consultant.uid, authorName: consultant.name, createdAt: serverTimestamp() });
  await audit(consultant, "accept", "demand", demand.id, demand.companyId, { consultantId: null }, { consultantId: consultant.uid });
}

export async function softDeleteDemand(demand: Demand, user: UserProfile, reason: string) { await updateDoc(doc(db, "demands", demand.id), { deletedAt: serverTimestamp(), deletedBy: user.uid, deleteReason: reason.trim(), updatedAt: serverTimestamp() }); await audit(user, "trash", "demand", demand.id, demand.companyId, undefined, { reason }); }
export async function restoreDemand(demand: Demand, user: UserProfile) { await updateDoc(doc(db, "demands", demand.id), { deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: serverTimestamp() }); await audit(user, "restore", "demand", demand.id, demand.companyId); }
export async function addNote(id: string, user: UserProfile, text: string, internal: boolean) { if (user.role === "requester" && internal) throw new Error("Clientes não podem criar observações internas."); await addDoc(collection(db, "demands", id, internal ? "internalNotes" : "publicNotes"), { text, authorId: user.uid, authorName: user.name, authorRole: user.role, createdAt: serverTimestamp(), edited: false }); await updateDoc(doc(db, "demands", id), { updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() }); await audit(user, "note", "demand", id); }
