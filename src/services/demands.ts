import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import type { Demand, DemandStatus, Priority, UserProfile } from "../types/models";

const createDemandCall = httpsCallable<
  { title: string; description: string; screenName: string; formName: string; levelId: string; levelName: string; priority: Priority; companyId: string; requesterSector?: string },
  { demandId: string; code: string }
>(functions, "createDemandSecure");

const mutateDemandCall = httpsCallable<
  { demandId: string; action: string; statusId?: string; observation?: string; workflowStatusIds?: string[]; text?: string; internal?: boolean },
  { ok: true }
>(functions, "mutateDemandSecure");

function callableMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("functions/not-found")) return "A atualização segura ainda não foi publicada no Firebase. Solicite o deploy das Functions.";
  if (message.includes("permission-denied")) return "Você não possui permissão para esta ação.";
  return message || "Não foi possível concluir a operação.";
}

export async function createDemand(
  data: { title: string; description: string; screenName: string; formName: string; levelId: string; levelName: string; priority: Priority; companyId: string; requesterSector?: string },
) {
  try {
    return (await createDemandCall(data)).data.demandId;
  } catch (error) {
    throw new Error(callableMessage(error));
  }
}

export async function changeDemandStatus(demand: Demand, status: DemandStatus, _user: UserProfile, observation?: string) {
  try {
    await mutateDemandCall({ demandId: demand.id, action: "status", statusId: status.id, observation: observation?.trim() ?? "" });
  } catch (error) { throw new Error(callableMessage(error)); }
}

export async function saveStatusObservation(demand: Demand, _user: UserProfile, observation: string) {
  // An observation is a public activity note. It no longer edits history
  // documents directly from the browser.
  return addNote(demand.id, _user, observation, false);
}

export async function editStatusObservation(_demand: Demand, _historyId: string, _user: UserProfile, _observation: string) {
  throw new Error("A edição de histórico será disponibilizada pela operação segura do servidor.");
}

export async function acceptDemand(demand: Demand, _consultant: UserProfile, workflowStatusIds: string[]) {
  try { await mutateDemandCall({ demandId: demand.id, action: "accept", workflowStatusIds }); }
  catch (error) { throw new Error(callableMessage(error)); }
}

export async function updateDemandWorkflowStatuses(demand: Demand, _consultant: UserProfile, workflowStatusIds: string[]) {
  try { await mutateDemandCall({ demandId: demand.id, action: "workflow", workflowStatusIds }); }
  catch (error) { throw new Error(callableMessage(error)); }
}

export async function addNote(id: string, _user: UserProfile, text: string, internal: boolean) {
  try { await mutateDemandCall({ demandId: id, action: "note", text: text.trim(), internal }); }
  catch (error) { throw new Error(callableMessage(error)); }
}
