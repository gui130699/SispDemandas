# SISP Demandas

PWA empresarial para registrar, organizar e acompanhar demandas por empresa. Perfis: administrador, consultor e solicitante; cada empresa fica isolada por regras do Firebase.

## Executar

```bash
npm install
npm run dev
npm run lint
npm run test:run
npm run build
```

Outros scripts: `npm run preview` e `npm run test:rules` (requer Firebase Emulator em execução).

## Recursos

- Login, recuperação de senha, sessão e bloqueio de usuário inativo.
- Empresas com chave única transacional por CNPJ/razão social.
- Demandas sequenciais `DEM-ANO-000001`, filtros, status, prioridade, SLA e dias calculados.
- Notas públicas/internas, histórico, auditoria, dashboard, temas e PWA atualizável.
- Firestore/Storage Rules, índices e GitHub Pages configurados.

## Firebase — configuração manual obrigatória

1. Ative Email/Password no Authentication, Firestore e Storage.
2. Autorize `gui130699.github.io` em Authentication → Settings → Authorized domains.
3. Crie o primeiro administrador no Authentication e copie seu UID.
4. Crie `users/{UID}` no Firestore:

```json
{"name":"Administrador","email":"admin@exemplo.com","emailNormalized":"admin@exemplo.com","role":"admin","companyId":null,"active":true,"createdAt":"timestamp","updatedAt":"timestamp"}
```

5. Publique: `firebase login`, `firebase use sispdemandas`, `firebase deploy --only firestore:rules,firestore:indexes,storage`.
6. Cadastre inicialmente os níveis N1–N4 em `levels`, com `name`, `days`, `order`, `active` e `color`.

Não armazene senhas ou credenciais administrativas no Firestore/repositório. Para usar a marca real, copie o arquivo original para `public/branding/logo.png`; a interface usa `object-fit: contain` e não deforma a imagem.

## Deploy

O workflow em `.github/workflows/deploy-pages.yml` publica a cada push em `main`. No GitHub, selecione **Settings → Pages → Source: GitHub Actions**. URL esperada: https://gui130699.github.io/SispDemandas/
