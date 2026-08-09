import { collection, doc, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeCnpj, normalizeText, uniqueKey } from "../utils/normalization";
import type { Company, CompanyRegistrationRequest, UserProfile } from "../types/models";

export interface BrasilApiCompany { cnpj:string; razao_social:string; nome_fantasia?:string; ddd_telefone_1?:string; email?:string|null; cep?:string; logradouro?:string; numero?:string; complemento?:string; bairro?:string; municipio?:string; uf?:string; descricao_situacao_cadastral?:string }
export type CompanyInput = Omit<Company,"id"|"legalNameNormalized">;
export async function lookupCompanyByCnpj(value:string):Promise<BrasilApiCompany>{const cnpj=normalizeCnpj(value);if(cnpj.length!==14)throw new Error("Informe um CNPJ com 14 dígitos.");const response=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);if(response.status===404)throw new Error("CNPJ não encontrado na BrasilAPI.");if(!response.ok)throw new Error("Não foi possível consultar o CNPJ agora. Tente novamente.");return response.json() as Promise<BrasilApiCompany>}
export async function saveCompany(input:CompanyInput, id?:string){const ref=id?doc(db,"companies",id):doc(collection(db,"companies"));const nameKey=uniqueKey("name",input.legalName),cnpjKey=input.cnpj?uniqueKey("cnpj",input.cnpj):null,keys=[...new Set([nameKey,cnpjKey].filter((key):key is string=>Boolean(key)))];await runTransaction(db,async tx=>{const keyRefs=keys.map(key=>doc(db,"uniqueCompanyKeys",key));const snapshots=await Promise.all(keyRefs.map(keyRef=>tx.get(keyRef)));for(const snapshot of snapshots)if(snapshot.exists()&&snapshot.data().companyId!==ref.id)throw new Error("Já existe uma empresa com estes dados.");for(const keyRef of keyRefs)tx.set(keyRef,{companyId:ref.id,createdAt:serverTimestamp()});tx.set(ref,{...input,legalNameNormalized:normalizeText(input.legalName),cnpj:input.cnpj?normalizeCnpj(input.cnpj):"",updatedAt:serverTimestamp(),...(id?{}:{createdAt:serverTimestamp()})},{merge:true})});return ref.id}
export const toggleCompany=(id:string,active:boolean)=>updateDoc(doc(db,"companies",id),{active,updatedAt:serverTimestamp()});

export async function requestCompanyRegistration(consultant: UserProfile, input: CompanyInput) {
  if (consultant.role !== "consultant") throw new Error("Apenas consultores podem solicitar o cadastro de empresas.");
  const legalName = input.legalName.trim();
  if (legalName.length < 2) throw new Error("Informe a razão social da empresa.");
  const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : "";
  if (cnpj && cnpj.length !== 14) throw new Error("Informe um CNPJ com 14 dígitos.");
  const ref = doc(collection(db, "companyRegistrationRequests"));
  await setDoc(ref, {
    id: ref.id,
    requestedBy: consultant.uid,
    requestedByName: consultant.name,
    requestedByEmail: consultant.email,
    company: { ...input, legalName, cnpj, active: true },
    status: "pending",
    requestedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function approveCompanyRegistrationRequest(request: CompanyRegistrationRequest, admin: UserProfile) {
  if (admin.role !== "admin") throw new Error("Apenas administradores podem aprovar empresas.");
  const companyRef = doc(collection(db, "companies"));
  const requestRef = doc(db, "companyRegistrationRequests", request.id);
  const nameKey = uniqueKey("name", request.company.legalName);
  const cnpjKey = request.company.cnpj ? uniqueKey("cnpj", request.company.cnpj) : null;
  const keyRefs = [...new Set([nameKey, cnpjKey].filter((key): key is string => Boolean(key)))].map((key) => doc(db, "uniqueCompanyKeys", key));
  const notificationRef = doc(db, "notifications", `${request.requestedBy}_${Date.now()}`);
  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    const keySnapshots = await Promise.all(keyRefs.map((keyRef) => transaction.get(keyRef)));
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("Esta solicitação já foi revisada.");
    if (keySnapshots.some((snapshot) => snapshot.exists())) throw new Error("Já existe uma empresa com esta razão social ou CNPJ.");
    keyRefs.forEach((keyRef) => transaction.set(keyRef, { companyId: companyRef.id, createdAt: serverTimestamp() }));
    transaction.set(companyRef, { ...request.company, legalNameNormalized: normalizeText(request.company.legalName), cnpj: request.company.cnpj ? normalizeCnpj(request.company.cnpj) : "", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.update(requestRef, { status: "approved", companyId: companyRef.id, rejectionReason: null, reviewedAt: serverTimestamp(), reviewedBy: admin.uid, reviewedByName: admin.name });
    transaction.set(notificationRef, { userId: request.requestedBy, title: "Empresa aprovada", message: `${request.company.legalName} foi cadastrada no SISPDEMANDAS.`, read: false, createdAt: serverTimestamp() });
  });
  return companyRef.id;
}

export async function rejectCompanyRegistrationRequest(request: CompanyRegistrationRequest, admin: UserProfile, reason: string) {
  if (admin.role !== "admin") throw new Error("Apenas administradores podem rejeitar empresas.");
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Informe o motivo da rejeição.");
  const batch = writeBatch(db);
  batch.update(doc(db, "companyRegistrationRequests", request.id), { status: "rejected", companyId: null, rejectionReason: cleanReason, reviewedAt: serverTimestamp(), reviewedBy: admin.uid, reviewedByName: admin.name });
  batch.set(doc(db, "notifications", `${request.requestedBy}_${Date.now()}`), { userId: request.requestedBy, title: "Empresa não aprovada", message: `${request.company.legalName}: ${cleanReason}`, read: false, createdAt: serverTimestamp() });
  await batch.commit();
}
