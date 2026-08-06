import type { Timestamp } from 'firebase/firestore'
const date=(v:Timestamp|Date|undefined|null)=>v ? ('toDate' in v ? v.toDate() : v) : new Date()
export const elapsedDays=(start:Timestamp|Date|undefined, end?:Timestamp|Date|null)=>Math.max(0,Math.floor((date(end).getTime()-date(start).getTime())/86400000))
export const businessDays=(start:Timestamp|Date|undefined,end?:Timestamp|Date|null)=>{let total=0;let cursor=new Date(date(start));const finish=date(end);while(cursor<finish){cursor.setDate(cursor.getDate()+1);if(cursor.getDay()!==0&&cursor.getDay()!==6)total++}return total}
export const slaState=(created:Timestamp|Date|undefined, days:number, closed?:Timestamp|Date|null)=>{const remaining=days-elapsedDays(created,closed); return {remaining, state:remaining<0?'overdue':remaining<=2?'warning':'ok'} as const}
