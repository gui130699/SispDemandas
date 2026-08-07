# SISPDEMANDAS

Aplicação PWA para gestão de demandas por empresa, publicada em GitHub Pages e integrada ao Firebase `sispdemandas`.

## Perfis e cadastro

- **Cliente**: escolhe uma empresa ativa, informa setor/telefone opcionais e fica pendente até a aprovação.
- **Consultor**: solicita uma ou mais empresas e fica pendente até que um administrador defina os vínculos.
- **Administrador**: só pode ser criado uma única vez pelo bootstrap seguro; os administradores seguintes são criados internamente.

### Bootstrap seguro do primeiro administrador

Antes de exibir o cadastro inicial, crie manualmente no Firestore os documentos abaixo (substitua o e-mail pelo e-mail do proprietário, em minúsculas):

`bootstrapConfig/owner`

```json
{"emailNormalized":"proprietario@exemplo.com","initialized":false}
```

`publicConfig/bootstrap`

```json
{"initialized":false}
```

Depois, acesse `#/cadastro` e conclua o perfil **Configurar administrador** usando exatamente esse e-mail. As regras gravam o usuário administrador e marcam os dois documentos como inicializados numa única transação. Nunca libere escrita pública nesses documentos.

## Dados e migração compatível

Demandas novas usam `statusId`, `statusName` e `statusColor`, sem remover o campo legado `status`. Os documentos antigos seguem visíveis: a interface os relaciona ao catálogo por `legacyKeys`. Após entrar como administrador, abra **Status** e clique em **Inicializar catálogo padrão**.

Os novos campos de usuário são `registrationStatus`, `companyIds`, `requestedCompanyIds`, `permissions`, `defaultSector`, `phone` e `rejectionReason`. Todos são opcionais para preservar documentos existentes.

## Executar e validar

```bash
npm install
npm run lint
npm run test:run
npm run test:rules
npm run build
```

Publique regras/índices após revisar o ambiente:

```bash
firebase use sispdemandas
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Ative Email/Senha no Firebase Authentication e autorize `gui130699.github.io`. O workflow `.github/workflows/deploy-pages.yml` publica cada push em `main` em https://gui130699.github.io/SispDemandas/.
