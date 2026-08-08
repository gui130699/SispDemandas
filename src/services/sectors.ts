import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Company, Sector, SectorRequest, UserProfile } from "../types/models";
import { normalizeText } from "../utils/normalization";

const sectorId = (companyId: string, name: string) => `${companyId}__${encodeURIComponent(normalizeText(name))}`;

export async function createSector(company: Company, name: string) {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("Informe um nome de setor válido.");
  const id = sectorId(company.id, cleanName);
  await setDoc(doc(db, "sectors", id), { id, companyId: company.id, companyName: company.legalName, name: cleanName, nameNormalized: normalizeText(cleanName), active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function requestSector(profile: UserProfile, company: Company, name: string) {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("Informe um nome de setor válido.");
  if (profile.role !== "requester" && profile.role !== "consultant") throw new Error("Apenas clientes e consultores podem solicitar setores.");
  if (profile.role === "requester" && profile.companyId !== company.id) throw new Error("Empresa inválida para solicitação.");
  if (profile.role === "consultant" && !profile.companyIds?.includes(company.id)) throw new Error("Você não possui acesso a esta empresa.");
  const id = `${profile.uid}__${sectorId(company.id, cleanName)}`;
  await setDoc(doc(db, "sectorRequests", id), { id, companyId: company.id, companyName: company.legalName, name: cleanName, nameNormalized: normalizeText(cleanName), requestedBy: profile.uid, requestedByName: profile.name, requestedByRole: profile.role, status: "pending", requestedAt: serverTimestamp() });
}

export async function approveSectorRequest(request: SectorRequest, admin: UserProfile) {
  const sectorRef = doc(db, "sectors", sectorId(request.companyId, request.name));
  const existing = await getDoc(sectorRef);
  if (!existing.exists()) await setDoc(sectorRef, { id: sectorRef.id, companyId: request.companyId, companyName: request.companyName, name: request.name, nameNormalized: request.nameNormalized, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await updateDoc(doc(db, "sectorRequests", request.id), { status: "approved", reviewedAt: serverTimestamp(), reviewedBy: admin.uid, reviewedByName: admin.name, rejectionReason: null });
}

export async function rejectSectorRequest(request: SectorRequest, admin: UserProfile, reason: string) {
  if (!reason.trim()) throw new Error("Informe o motivo da rejeição.");
  await updateDoc(doc(db, "sectorRequests", request.id), { status: "rejected", reviewedAt: serverTimestamp(), reviewedBy: admin.uid, reviewedByName: admin.name, rejectionReason: reason.trim() });
}

export async function sectorExists(companyId: string, name: string) {
  return !(await getDocs(query(collection(db, "sectors"), where("companyId", "==", companyId), where("nameNormalized", "==", normalizeText(name))))).empty;
}

export type { Sector, SectorRequest };
