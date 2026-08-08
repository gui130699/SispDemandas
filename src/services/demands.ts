import { addDoc, collection, doc, runTransaction, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeText } from "../utils/normalization";
import type { Demand, DemandStatus, Priority, UserProfile } from "../types/models";
import { audit } from "./audit";

export async function createDemand(data: { title: string; description: string; screenName: string; formName: string; levelId: string; levelName: string; priority: Priority; companyId: string; companyName: string; requesterSector?: string }, user: UserProfile, initialStatus: DemandStatus) {
  if (user.role === "requester" && user.companyId !== data.companyId) throw new Error("Empresa inválida.");
  const ref = doc(collection(db, "demands")), historyRef = doc(collection(ref, "history")); let code = "";
  await runTransaction(db, async tx => { const counter = doc(db, "counters", "demands"), snapshot = await tx.get(counter), sequence = (snapshot.data()?.sequence ?? 0) + 1, year = new Date().getFullYear(); code = `DEM-${year}-${String(sequence).padStart(6, "0")}`;
    tx.set(counter, { sequence, updatedAt: serverTimestamp() }); tx.set(ref, { ...data, id: ref.id, code, sequence, year, requesterId: user.uid, requesterName: user.name, requesterSector: data.requesterSector ?? user.defaultSector ?? "", screenNameNormalized: normalizeText(data.screenName), formNameNormalized: normalizeText(data.formName), status: "analysis", statusId: initialStatus.id, statusName: initialStatus.name, statusColor: initialStatus.color, statusUpdatedAt: serverTimestamp(), statusHistoryId: historyRef.id, consultantId: null, consultantName: null, executionApprovedAt: null, completedAt: null, createdBy: user.uid, updatedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), attachmentCount: 0, publicNoteCount: 0, internalNoteCount: 0, schemaVersion: 2 }); tx.set(historyRef, { type: "status", statusId: initialStatus.id, statusName: initialStatus.name, observation: "Demanda registrada.", authorId: user.uid, authorName: user.name, createdAt: serverTimestamp() });
  }); await audit(user, "create", "demand", ref.id, data.companyId, undefined, { code }); return ref.id;
}

export async function changeDemandStatus(demand: Demand, status: DemandStatus, user: UserProfile, observation?: string) {
  if (!observation?.trim()) throw new Error("Informe uma observação sobre a alteração de status.");
  const historyRef = doc(collection(db, "demands", demand.id, "history"));
  const patch = { status: status.legacyKeys?.[0] ?? "analysis", statusId: status.id, statusName: status.name, statusColor: status.color, statusUpdatedAt: serverTimestamp(), statusHistoryId: historyRef.id, updatedBy: user.uid, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), ...(status.name.toLowerCase().includes("execu") ? { startedAt: serverTimestamp() } : {}), ...(status.name.toLowerCase().includes("paus") ? { pausedAt: serverTimestamp() } : {}), ...(status.legacyKeys?.includes("cancelled") ? { cancelledAt: serverTimestamp() } : {}), ...(demand.status === "cancelled" && status.legacyKeys?.includes("analysis") ? { cancelledAt: null } : {}), ...(status.name.toLowerCase().includes("conclu") ? { completedAt: serverTimestamp(), completedBy: user.uid } : {}) };
  const batch = writeBatch(db); batch.update(doc(db, "demands", demand.id), patch); batch.set(historyRef, { type: "status", statusId: status.id, statusName: status.name, observation: observation.trim(), authorId: user.uid, authorName: user.name, createdAt: serverTimestamp() }); await batch.commit(); await audit(user, "status", "demand", demand.id, demand.companyId, undefined, { statusId: status.id, observation: observation.trim() });
}
export async function saveStatusObservation(demand: Demand, user: UserProfile, observation: string) {
  if (!observation.trim()) throw new Error("Informe uma observação antes de salvar.");
  const demandRef = doc(db, "demands", demand.id);
  if (demand.statusHistoryId) {
    await updateDoc(doc(demandRef, "history", demand.statusHistoryId), { observation: observation.trim(), edited: true, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByName: user.name });
  } else {
    const historyRef = doc(collection(demandRef, "history"));
    const batch = writeBatch(db); batch.update(demandRef, { statusHistoryId: historyRef.id, updatedAt: serverTimestamp(), updatedBy: user.uid, lastActivityAt: serverTimestamp() }); batch.set(historyRef, { type: "status", statusId: demand.statusId ?? demand.status, statusName: demand.statusName ?? demand.status, observation: observation.trim(), authorId: user.uid, authorName: user.name, createdAt: serverTimestamp() }); await batch.commit();
  }
}
export async function editStatusObservation(demand: Demand, historyId: string, user: UserProfile, observation: string) {
  if (!observation.trim()) throw new Error("Informe uma observação antes de salvar.");
  await updateDoc(doc(db, "demands", demand.id, "history", historyId), { observation: observation.trim(), edited: true, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByName: user.name });
}
export async function acceptDemand(demand: Demand, consultant: UserProfile, workflowStatusIds: string[]) {
  if (consultant.role !== "consultant") throw new Error("Apenas consultores podem assumir demandas.");
  if (demand.consultantId) throw new Error("Esta demanda já possui um consultor.");
  if (!consultant.companyIds?.includes(demand.companyId)) throw new Error("Vincule-se à empresa antes de assumir esta demanda.");
  if (!workflowStatusIds.length) throw new Error("Selecione ao menos um status para a demanda.");
  await updateDoc(doc(db, "demands", demand.id), { consultantId: consultant.uid, consultantName: consultant.name, workflowStatusIds: [...new Set(workflowStatusIds)], updatedBy: consultant.uid, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
  await addDoc(collection(db, "demands", demand.id, "history"), { type: "assignment", consultantId: consultant.uid, consultantName: consultant.name, authorId: consultant.uid, authorName: consultant.name, createdAt: serverTimestamp() });
  await audit(consultant, "accept", "demand", demand.id, demand.companyId, { consultantId: null }, { consultantId: consultant.uid });
}
export async function updateDemandWorkflowStatuses(demand: Demand, consultant: UserProfile, workflowStatusIds: string[]) {
  if (consultant.role !== "consultant" || demand.consultantId !== consultant.uid) throw new Error("Apenas o consultor responsável pode configurar as etapas.");
  const uniqueStatusIds = [...new Set(workflowStatusIds)];
  if (!uniqueStatusIds.length) throw new Error("Selecione ao menos um status para a demanda.");
  if (demand.statusId && !uniqueStatusIds.includes(demand.statusId)) throw new Error("O status atual deve permanecer selecionado.");
  await updateDoc(doc(db, "demands", demand.id), { workflowStatusIds: uniqueStatusIds, updatedBy: consultant.uid, updatedAt: serverTimestamp() });
  await audit(consultant, "workflow_statuses", "demand", demand.id, demand.companyId, undefined, { workflowStatusIds: uniqueStatusIds });
}

export async function addNote(id: string, user: UserProfile, text: string, internal: boolean) { if (user.role === "requester" && internal) throw new Error("Clientes não podem criar observações internas."); await addDoc(collection(db, "demands", id, internal ? "internalNotes" : "publicNotes"), { text, authorId: user.uid, authorName: user.name, authorRole: user.role, createdAt: serverTimestamp(), edited: false }); await updateDoc(doc(db, "demands", id), { updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() }); await audit(user, "note", "demand", id); }
