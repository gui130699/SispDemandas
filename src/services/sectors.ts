import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Sector, SectorRequest, UserProfile } from "../types/models";
import { normalizeText } from "../utils/normalization";

const sectorId = (name: string) => encodeURIComponent(normalizeText(name));

export function uniqueSectors(sectors: Sector[]) {
  const unique = new Map<string, Sector>();
  for (const sector of sectors) {
    const key = sector.nameNormalized || normalizeText(sector.name);
    const current = unique.get(key);
    if (!current || (!sector.companyId && current.companyId)) {
      unique.set(key, { ...sector, active: sector.active || Boolean(current?.active) });
    } else if (sector.active && !current.active) {
      unique.set(key, { ...current, active: true });
    }
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export async function createSector(name: string) {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("Informe um nome de setor válido.");
  const id = sectorId(cleanName);
  await setDoc(doc(db, "sectors", id), { id, name: cleanName, nameNormalized: normalizeText(cleanName), active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function requestSector(profile: UserProfile, name: string) {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("Informe um nome de setor válido.");
  if (profile.role !== "requester" && profile.role !== "consultant") throw new Error("Apenas clientes e consultores podem solicitar setores.");
  const nameNormalized = normalizeText(cleanName);
  const existingSectors = await getDocs(query(collection(db, "sectors"), where("nameNormalized", "==", nameNormalized), where("active", "==", true)));
  if (!existingSectors.empty) throw new Error("Este setor já está cadastrado.");
  const ownRequests = await getDocs(query(collection(db, "sectorRequests"), where("requestedBy", "==", profile.uid)));
  if (ownRequests.docs.some((item) => item.data().nameNormalized === nameNormalized && item.data().status === "pending")) throw new Error("Já existe uma solicitação pendente para este setor.");
  const requestRef = doc(collection(db, "sectorRequests"));
  await setDoc(requestRef, { id: requestRef.id, name: cleanName, nameNormalized, requestedBy: profile.uid, requestedByName: profile.name, requestedByRole: profile.role, status: "pending", requestedAt: serverTimestamp() });
}

export async function approveSectorRequest(request: SectorRequest, admin: UserProfile) {
  const sectorRef = doc(db, "sectors", sectorId(request.name));
  const existing = await getDoc(sectorRef);
  if (existing.exists()) await updateDoc(sectorRef, { active: true, updatedAt: serverTimestamp() });
  else await setDoc(sectorRef, { id: sectorRef.id, name: request.name, nameNormalized: request.nameNormalized, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await updateDoc(doc(db, "sectorRequests", request.id), { status: "approved", reviewedAt: serverTimestamp(), reviewedBy: admin.uid, reviewedByName: admin.name, rejectionReason: null });
}

export async function rejectSectorRequest(request: SectorRequest, admin: UserProfile, reason: string) {
  if (!reason.trim()) throw new Error("Informe o motivo da rejeição.");
  await updateDoc(doc(db, "sectorRequests", request.id), { status: "rejected", reviewedAt: serverTimestamp(), reviewedBy: admin.uid, reviewedByName: admin.name, rejectionReason: reason.trim() });
}

export async function sectorExists(name: string) {
  const snapshot = await getDocs(query(collection(db, "sectors"), where("nameNormalized", "==", normalizeText(name)), where("active", "==", true)));
  return !snapshot.empty;
}

export type { Sector, SectorRequest };
