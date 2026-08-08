import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "consultant" | "requester";
export type RegistrationStatus = "pending" | "approved" | "rejected";
/** Kept for documents created before the configurable status catalog. */
export type LegacyStatus = "new" | "triage" | "waiting_information" | "analysis" | "development" | "testing" | "waiting_validation" | "completed" | "cancelled" | "paused";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface ConsultantPermissions {
  takeUnassignedDemand?: boolean;
  createDemand?: boolean;
  editDemand?: boolean;
  changeStatus?: boolean;
  assignConsultant?: boolean;
  reassignDemand?: boolean;
  addPublicNote?: boolean;
  addInternalNote?: boolean;
  manageAttachments?: boolean;
  deleteDemand?: boolean;
  viewDeletedDemands?: boolean;
  restoreDemand?: boolean;
  reopenDemand?: boolean;
  exportDemands?: boolean;
}

export const defaultConsultantPermissions: ConsultantPermissions = {
  takeUnassignedDemand: true,
  createDemand: false,
  editDemand: true,
  changeStatus: true,
  assignConsultant: false,
  reassignDemand: false,
  addPublicNote: true,
  addInternalNote: true,
  manageAttachments: false,
  deleteDemand: false,
  viewDeletedDemands: false,
  restoreDemand: false,
  reopenDemand: false,
  exportDemands: false,
};

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  emailNormalized: string;
  role: Role;
  companyId: string | null;
  companyName?: string | null;
  companyIds?: string[];
  requestedCompanyIds?: string[];
  permissions?: ConsultantPermissions;
  defaultSector?: string;
  phone?: string;
  active: boolean;
  registrationStatus?: RegistrationStatus;
  rejectionReason?: string;
  approvedAt?: Timestamp;
  approvedBy?: string;
  approvedByName?: string;
  rejectedAt?: Timestamp;
  rejectedBy?: string;
  rejectedByName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Company {
  id: string;
  legalName: string;
  legalNameNormalized: string;
  tradeName?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  notes?: string;
  active: boolean;
  address?: { zipCode?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string };
}

export interface DemandStatus {
  id: string;
  name: string;
  description?: string;
  color: string;
  order: number;
  active: boolean;
  textColor?: string;
  isInitial?: boolean;
  isFinal?: boolean;
  finalType?: "completed" | "cancelled" | null;
  isPaused?: boolean;
  allowedNextStatusIds?: string[];
  legacyKeys?: LegacyStatus[];
}

export interface ConsultantCompanyRequest {
  id: string;
  consultantId: string;
  consultantName: string;
  companyId: string;
  companyName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt?: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  reviewedByName?: string;
  rejectionReason?: string | null;
}

export interface Demand {
  id: string;
  code: string;
  sequence: number;
  year: number;
  title: string;
  description: string;
  companyId: string;
  companyName: string;
  requesterId: string;
  requesterName: string;
  requesterSector?: string;
  screenName: string;
  screenNameNormalized: string;
  levelId: string;
  levelName: string;
  formName: string;
  formNameNormalized: string;
  priority: Priority;
  status: LegacyStatus;
  statusId?: string;
  statusName?: string;
  statusColor?: string;
  statusUpdatedAt?: Timestamp;
  statusHistoryId?: string;
  workflowStatusIds?: string[];
  consultantId: string | null;
  consultantName: string | null;
  executionApprovedAt?: Timestamp | null;
  executionApprovedBy?: string | null;
  startedAt?: Timestamp | null;
  pausedAt?: Timestamp | null;
  pauseReason?: string | null;
  completedAt?: Timestamp | null;
  completedBy?: string | null;
  cancelledAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastActivityAt?: Timestamp;
}

export interface DemandHistoryEvent {
  id: string;
  type: "status" | "assignment" | string;
  statusId?: string;
  statusName?: string;
  observation?: string;
  authorId: string;
  authorName: string;
  createdAt?: Timestamp;
}

export const legacyStatusLabels: Record<LegacyStatus, string> = { new: "Nova", triage: "Em triagem", waiting_information: "Aguardando informações", analysis: "Em análise", development: "Em execução", testing: "Em teste", waiting_validation: "Aguardando validação", completed: "Concluída", cancelled: "Cancelada", paused: "Pausada" };
export const roleLabels: Record<Role, string> = { admin: "Administrador", consultant: "Consultor", requester: "Cliente" };
