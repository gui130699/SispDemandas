export const normalizeText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')
export const normalizeCnpj=(value:string)=>value.replace(/\D/g,'')
export const uniqueKey=(kind:'name'|'cnpj', value:string)=>`${kind}_${encodeURIComponent(kind==='cnpj'?normalizeCnpj(value):normalizeText(value))}`
export const safeFileName=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)
