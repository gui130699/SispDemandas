import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "consultant" | "requester";
export type RegistrationStatus = "pending" | "approved" | "rejected";
/** Kept for documents created before the configurable status catalog. */
export type LegacyStatus = "new" | "triage" | "waiting_information" | "analysis" | "development" | "testing" | "waiting_validation" | "completed" | "cancelled" | "paused";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface ConsultantPermissions {
  canCreateDemand?: boolean;
  canEditDemand?: boolean;
  canChangeStatus?: boolean;
  canManageInternalNotes?: boolean;
  canManageAttachments?: boolean;
  canDeleteDemand?: boolean;
}

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
  isFinal?: boolean;
  legacyKeys?: LegacyStatus[];
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
  deletedAt?: Timestamp | null;
  deletedBy?: string | null;
  deleteReason?: string | null;
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
