# Metas da Corporação × Metas do Líder — Alinhamento

Especificação da funcionalidade "Metas da Empresa em harmonia com as metas do líder" (demanda do dono da empresa, 2026-10-22).

## 1. Problema

Hoje o sistema tem duas camadas desconectadas:

- **Metas do líder/equipe** (`CycleGoal` dentro de um `Cycle`): título, dono (`ownerUserId`), área, indicador vinculado, valor alvo vs. atual, desdobramentos, plano de ação (`CycleGoalActionItem`). Vivas, acompanhadas, com status.
- **Intenção da empresa**: só texto solto (`Area.mission/objective`, `Team.objectives`) — ninguém preenche com rigor, ninguém atualiza, e nada conecta isso às metas do ciclo.

Resultado: a meta do líder flutua sem âncora. O briefing corporativo é a âncora — transforma a "meta da empresa" de texto decorativo em registro vivo que confronta as metas do ciclo.

## 2. Visão geral do fluxo

```
DONO/SUPERIOR                          LÍDER
    │                                     │
    │  1. preenche Briefing               │
    │  (metas da corporação p/ o ciclo)   │
    │                                     │
    │ ── notifica líderes ───────────────▶│
    │                                     │  2. lê o briefing
    │                                     │  3. envia Análise de Metas
    │                                     │  (como minha equipe contribui)
    │◀── notifica superior ────────────────│
    │  4. confronta com metas do ciclo    │
    │  5. aprova / devolve c/ comentário  │
    │ ── notifica líder ──────────────────▶│
    │  6. metas corporativas viram         │
    │     "Meta da Corporação" oficial    │
```

## 3. Novos models (Prisma)

### 3.1 `CorporateGoalBriefing` — o briefing do dono

Um por organização por ciclo (`@@unique([organizationId, cycleId])`):

| Campo | Tipo | Notas |
|-------|------|-------|
| `organizationId` / `cycleId` | FK | escopo |
| `context` | Text? | onde a empresa quer chegar no ciclo (1 parágrafo) |
| `priorities` | String[] | ex.: "margem antes de volume" |
| `constraints` | String[] | ex.: "sem novas contratações no semestre" |
| `status` | `draft` / `published` / `ratified` | rascunho → publicado (líderes veem) → ratificado (oficial) |
| `createdBy` / `updatedBy` | FK User? | quem preencheu |
| `revisions` | Json (default `[]`) | histórico de atualizações periódicas `{ at, by, note, snapshot }` — **atualizar nunca sobrescreve** (regra "nada é excluído") |
| `goals` | `CorporateGoal[]` | 3–5 metas |

### 3.2 `CorporateGoal` — cada meta da empresa

| Campo | Tipo | Notas |
|-------|------|-------|
| `briefingId` | FK | |
| `title` | String | |
| `indicatorId` | FK Indicator? | reaproveita o Módulo R |
| `targetValue` / `currentValue` | Float? | |
| `dueAt` | DateTime? | |

### 3.3 `LeaderGoalAnalysis` — a análise que o líder envia

Uma por líder (dono da meta de ciclo ou líder de equipe) por ciclo:

| Campo | Tipo | Notas |
|-------|------|-------|
| `organizationId` / `cycleId` | FK | |
| `authorUserId` | FK User | o líder que envia |
| `reviewerUserId` | FK User? | o superior que recebe (dono ou gestor direto) |
| `status` | `draft` / `submitted` / `returned` / `approved` | rascunho → enviada → devolvida → aprovada |
| `items` | `LeaderGoalAnalysisItem[]` | uma linha por meta corporativa |
| `reviewComment` | Text? | comentário do superior ao devolver/aprovar |
| `submittedAt` / `reviewedAt` | DateTime? | |

`LeaderGoalAnalysisItem`: `corporateGoalId` + `contribution` (texto: como minha equipe contribui) + `linkedCycleGoalIds` (String[] — metas de ciclo que atendem) + `gap` (texto: onde vejo conflito/gap).

## 4. Endpoints (seguir padrão `cycles.routes.ts`)

```
POST   /:orgId/corporate-briefings            dono publica briefing (status draft→published)
PATCH  /:orgId/corporate-briefings/:id        atualiza (gera entrada em revisions)
GET    /:orgId/corporate-briefings/current    briefing do ciclo vigente (+ goals)
POST   /:orgId/corporate-briefings/:id/ratify publica como oficial (status ratified)

POST   /:orgId/goal-analyses                  líder cria rascunho
PATCH  /:orgId/goal-analyses/:id              edita rascunho / superior comenta
POST   /:orgId/goal-analyses/:id/submit       líder envia → notifica superior
POST   /:orgId/goal-analyses/:id/review       superior aprova/devolve → notifica líder

GET    /:orgId/goal-alignment                 confronto: metas corporativas × metas do ciclo
POST   /:orgId/goal-alignment/suggest         IA sugere vínculos + ações p/ gaps
```

## 5. Como o líder envia e como o chefe recebe (notificações)

**Sem canal novo.** O sistema já tem caixa de entrada in-app (`NotificationLog` com `channel: "in_app"`), sino com badge (`NotificationBell`, polling de 30s + `unread-count`), e helper `notifyInApp({ userId, title, body, linkUrl, organizationId })` em `api/src/lib/notifications.ts`. WhatsApp/e-mail via `sendNotification` continuam opcionais (config em `PlatformSetting`, nada de env var).

### 5.1 Quem é "o superior" de cada líder?

Resolver nesta ordem: (1) `reviewerUserId` explícito na análise (o líder escolhe ao enviar — cobre "meu chefe direto"); (2) gestor da área/equipe (`Area.managerUserId`, `Team.responsibleUserId`); (3) fallback: membros com papel de dono/executivo (`isExec`-like). Registrar a escolha no `reviewerUserId` para auditoria.

### 5.2 Eventos e mensagens

| Evento | Quem recebe | Título | `linkUrl` |
|--------|-------------|--------|-----------|
| Briefing publicado | todos os líderes da org | "Novas metas da empresa para o ciclo" | `/app/goals/corporate` |
| Análise enviada | `reviewerUserId` | "Análise de metas de {nome do líder}" | `/app/goals/analysis/:id` |
| Análise devolvida | autor | "Sua análise de metas foi devolvida" (+ comentário no corpo) | `/app/goals/analysis/:id` |
| Análise aprovada | autor | "Análise de metas aprovada" | `/app/goals/analysis/:id` |
| Briefing ratificado | todos os líderes | "Metas da Corporação oficializadas" | `/app/goals/corporate` |

Cada envio grava `NotificationLog` com `organizationId` (para o filtro por org da inbox) e `linkUrl` profundo — clicar no sino abre direto a tela certa. Regra transversal: enviar notificação é **não-bloqueante** (try/catch com `console.error`, como o sync com a Agenda no NR-1).

### 5.3 Onde treinar a equipe (pontos de contato)

1. **Sino** (`NotificationBell` no topo): badge com contagem, lista das 20 recentes, marcar como lida/excluir. É onde o chefe **recebe** o aviso de "análise enviada" e o líder recebe "devolvida/aprovada". Treinar: clicar no item abre a tela direto pelo `linkUrl`.
2. **Tela de Metas/Alinhamento** (`/app/goals/...`, a construir): briefing (leitura), editor da análise (envio), confronto lado a lado (revisão do superior).
3. **Painel Hoje** (`GET /me/home/attention`): incluir bloco "análises de metas pendentes de revisão" para o superior (mesmo padrão do bloco NR-1: severity por prazo).
4. **Admin → Notificações** (`app.notifications.tsx` / `admin.notifications.tsx`): templates e teste de envio (botão seed) — útil no treinamento para simular.

## 6. Confronto + IA

Tela "Alinhamento" lado a lado: meta corporativa × metas do ciclo que declaram atendê-la. A IA entra em dois pontos:

- **na análise do líder**: sugere quais metas de ciclo atendem qual meta corporativa; aponta **órfãs** (meta do líder que não serve a nenhuma meta da empresa) e **descobertas** (meta corporativa sem nenhuma meta de líder atendendo);
- **no plano**: sugere `CycleGoalActionItem` para fechar os gaps (reaproveita o plano de ação da meta que já existe).

## 7. Registro como Meta da Corporação

Quando o superior aprova: o briefing vai a `ratified` e as metas corporativas passam a aparecer no painel de Resultados/Metas junto das metas do líder, marcadas com selo "Corporação". Sem model novo — é o status no briefing + o painel listando as duas fontes.

## 8. Ordem de implementação (valor incremental)

1. **Briefing + leitura** (models 3.1–3.2, endpoints de briefing, tela de leitura) → valor imediato: líderes veem para onde a empresa vai.
2. **Confronto + IA** (endpoint `goal-alignment` + tela lado a lado, só leitura) → só de mostrar "sua meta X não atende nenhuma meta corporativa" já muda comportamento.
3. **Análise do líder + fluxo de envio/devolução/aprovação** (model 3.3, endpoints, `notifyInApp` nos 5 eventos, bloco no Hoje).
4. **Ratificação + selo no painel de Resultados**.

Autorização: espelhar o padrão NR-1 — publicar/ratificar briefing restrito a dono/executivo (via feature/role check); líder cria e edita apenas a própria análise; superior revisa as análises endereçadas a ele.
