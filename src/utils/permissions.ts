import type { Demand, Role, UserProfile } from '../types/models'
export const isAdmin=(p:UserProfile|null)=>p?.role==='admin'
export const canReadDemand=(p:UserProfile,d:Demand)=>p.role==='admin'||p.role==='consultant'&&(d.consultantId===p.uid||!d.consultantId)||p.role==='requester'&&d.companyId===p.companyId
export const canManageDemand=(p:UserProfile,d:Demand)=>p.role==='admin'||p.role==='consultant'&&d.consultantId===p.uid
export const canCreateCompany=(role:Role)=>role==='admin'
