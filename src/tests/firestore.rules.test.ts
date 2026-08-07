import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

describe('contrato das regras do Firestore', () => {
  it('permite auto cadastro apenas para solicitante pendente vinculado a empresa ativa', () => {
    expect(rules).toContain("request.resource.data.role=='requester'")
    expect(rules).toContain('request.resource.data.active==false')
    expect(rules).toContain('get(/databases/$(database)/documents/companies/$(request.resource.data.companyId)).data.active==true')
    expect(rules).toContain('request.resource.data.companyName==get(/databases/$(database)/documents/companies/$(request.resource.data.companyId)).data.legalName')
  })

  it('mantém atualização de perfis restrita ao administrador', () => {
    expect(rules).toContain('allow update: if admin();')
  })
})
