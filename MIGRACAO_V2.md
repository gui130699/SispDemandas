# Migração v2 — SISPDEMANDAS

## Segurança e operações privilegiadas

A v2 bloqueia no navegador as escritas em `counters`, `auditLogs`, demandas,
histórico e notas. As operações de demanda passam pelas callable Functions
`createDemandSecure` e `mutateDemandSecure`, na região `southamerica-east1`.

Antes de publicar as novas Rules em produção, publique as Functions:

```powershell
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Não publique as Rules antes das Functions: isso bloquearia corretamente a
criação/atualização web de demandas enquanto as Functions ainda não existirem.

## Vínculo de consultor a empresa

`users/{uid}.companyIds` é administrado somente por administrador ou Admin SDK.
O consultor cria uma solicitação determinística em
`consultantCompanyRequests/{consultantId}_{companyId}`; a aprovação é feita
pela Function `reviewConsultantCompanyRequest` e inclui o vínculo de forma
atômica.

Consultores existentes sem `permissions` precisam receber as permissões
explicitamente. O padrão seguro está em `defaultConsultantPermissions`.

## Status legados

Status novos usam `isInitial`, `isPaused` e `finalType`. Registros legados
continuam usando `legacyKeys`. Marque exatamente um status ativo como inicial
antes de operar exclusivamente pelo fluxo v2.

## Verificação local

```powershell
npm run lint
npm run test:run
npm run test:rules
npm run build
npm --prefix functions run lint
npm --prefix functions run build
```
