# Módulo NR-1 — Riscos Psicossociais

Documento vivo do Módulo NR-1 no Lider C.O.R.E.: instrumento, telas, integrações e correções da auditoria técnica de 2026-10-21 (fechada em 2026-10-22).

## 1. Instrumento e tabulação (Fases 1–2)

- 33 perguntas, 13 fatores, mapa de vinculação N:N (peso 1 — cada resposta conta integralmente em cada fator vinculado).
- Percentual por fator: `((média − 1) / 4) × 100`. Escala 1–5 + "N/A" (fora do cálculo).
- Faixas: ≥ 75% VERDE (muito favorável) / 50–74,9% AMARELO (atenção) / < 50% VERMELHO (prioridade).
- **Anonimato**: mínimo `NR1_MIN_RESPONSES = 3` respostas válidas (constante única em `api/src/lib/nr1-instrument.ts`). O líder nunca vê respostas individuais.
- Comparação entre ciclos: rodada anterior **da mesma equipe** com ≥ 3 respostas (`GET surveys/:id` devolve `previousLabel`/`previousFactors`).
- Análise do líder por fator (`PUT surveys/:id/factor-analysis`): obrigatória em prioridade, recomendada em atenção. Decisão: criar ação / ação existente / acompanhar / sem ação.

## 2. Riscos e ações (Fases 3–4)

CRUD estruturado (`NR1Action`): situação, descrição, fator, origem (`core_assessment`/`risk_inventory`/`existing_action_plan`/`external_assessment`/`leader_identification`/`guided_conversation`/`other`), responsável, prazo, status (não iniciada/em andamento/concluída/atrasada com derivação no servidor/cancelada com justificativa), forma de acompanhamento, resultado observado, suficiência, próxima verificação (30/60/90d), evidências (PDF/PNG/JPEG/WEBP/TXT até 10 MB em `UPLOADS_DIR/nr1-evidence`), histórico em JSON.

- **Nível de certeza** (`knowledgeLevel`: known/partial/unsure) + **referência ao documento de origem** (`sourceRef`) — Marco 02.
- Linha do tempo de execução (`POST /actions/:id/progress`): progresso, impedimento, ajuste, conclusão.

## 3. Novo ciclo e integrações (Fase 5)

- Rodadas vinculadas por equipe; botão "Novo ciclo" (título pré-preenchido, equipe, checkbox "Comparar com ciclo anterior").
- **Ação existe uma única vez**: ações NR-1 fazem upsert/remove em `LeaderAgendaItem` com `source: "nr1"` (`agendaItemId`).
- Bloco NR-1 no painel Hoje (`GET /me/home/attention`): atrasadas (severity high) e verificações próximas (7 dias).

## 4. Modos de entrada (Fase 6 — Marco 02)

- **Importação em lote** (`POST /actions/import`, template CSV em `GET /actions/import/template`): origens `risk_inventory` e `existing_action_plan`. Validação linha a linha, resposta `{ created, skipped }` — não falha em bloco. Sem duplicar situações já registradas.
- **Fluxo "Ainda não sei"** (`GET /suggestions`): sugestões de primeiro passo por fator, ponto de partida editável.
- UI na aba "Riscos e ações": `EntryModeMenu` + `ImportDialog` + `GuidedEntryDialog`.

## 5. Indicadores NR-1 no Módulo R (auditoria, item 5)

- `api/src/lib/nr1-indicators.ts` (cálculo puro, 10 asserções em `nr1-indicators.test.ts`): snapshot dos 13 fatores + comparação com a rodada anterior da mesma equipe + série histórica por rodada.
- `GET /organization/:orgId/nr1/indicators` · `POST /:orgId/nr1/indicators/sync` (automático ao encerrar a rodada).
- Painel `src/components/nr1/Nr1IndicatorsCard.tsx` na tela de Indicadores. Cada fator vira indicador `NR-1 · <fator>` com meta 75% e uma leitura por rodada. **Rodada abaixo de 3 respostas nunca vira leitura** (anonimato).
- Nunca apresentar o diagnóstico como substituto do PGR/SST.

## 6. Exportação (auditoria, item 8)

Botão "Exportar CSV" no diálogo da rodada: visão por fator (percentual, classificação, ciclo anterior, variação, análise do líder) + detalhamento das 33 perguntas. Só dados agregados.

## 7. Gating e autorização (auditoria, itens 7 e 10)

- Módulo `nr1` no `FEATURE_CATALOG` e no `TEMPLATE_DEFAULTS` por papel; `bootstrapFeatureTemplates()` faz backfill sem sobrescrever edição do admin; nav usa `module: "nr1"`; servidor trava com 403 em `nr1Router.param("orgId")` via `hasNr1Module()`.
- Autorização por papel (`canManageNr1` → RH/responsável/líder de equipe; colaborador responde só pela rota pública com token).
- **Parcial**: sem granularidade por equipe — um líder de equipe ainda vê o diagnóstico de outras equipes da mesma organização. Requer decisão de produto (item 10 da auditoria).

## 8. Auditoria técnica 2026-10-21 — estado (fechada 2026-10-22)

| # | Item | Estado |
|---|------|--------|
| 1 | Filtro "Atrasadas" quebrado | ✅ derivado no servidor (`dueDate < now` + status) |
| 2 | IA não persistida | ✅ `NR1Survey.aiAnalysis` + hidratação (`shownAiAnalysis`) |
| 3 | `comparePrevious` | ✅ front envia no body; default `true` no schema |
| 4 | `< 3` hardcoded | ✅ constante única `NR1_MIN_RESPONSES` |
| 5 | Sem indicadores | ✅ seção 5 deste documento |
| 6 | (documento interno da auditoria) | ✅ tratado no ciclo |
| 7 | Sem gating de módulo | ✅ seção 7 deste documento |
| 8 | Sem exportação | ✅ seção 6 deste documento |
| 9 | `actionPlan` × `NR1Action` | ✅ dashboard conta `NR1Action` (status ≠ concluída/cancelada) |
| 10 | Escopo de autorização por equipe | ⚠️ **parcial** — ver seção 7 |
| 11 | Vínculos `teamId`/`responsibleUserId`/`factorAnalysisId` | ✅ `validateActionLinks()` por organização |
| 12 | Rota pública sem proteção | ✅ `publicRateLimit` + `respondentIp` gravado |
| 13 | `POST /nr1/surveys` sem checar equipe | ✅ equipe conferida contra a organização |

Pendente de infraestrutura: `prisma db push` (sem `DATABASE_URL` acessível no ambiente de desenvolvimento) — cobre `aiAnalysis`, `comparePrevious`, `archivedAt`, enum `NR1ActionKnowledge`, `knowledgeLevel`, `sourceRef`, `guided_conversation`, `agendaItemId` e o model `NR1FactorAnalysis`.
