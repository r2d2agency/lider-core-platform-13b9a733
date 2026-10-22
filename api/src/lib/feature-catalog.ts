// Catálogo global de features do app. Cada módulo declara aqui suas
// sub-funções e as ações (view/edit/export) que fazem sentido.
// Isto alimenta a UI de templates (admin) e o resolvedor de gates.

export type FeatureAction = "view" | "edit" | "export";

export interface FeatureDef {
  key: string;
  label: string;
  description?: string;
  actions: FeatureAction[];
}

export interface ModuleDef {
  code: string; // bate com ProductModule.code
  name: string;
  features: FeatureDef[];
}

export const FEATURE_CATALOG: ModuleDef[] = [
  {
    code: "consciencia",
    name: "Consciência",
    features: [
      {
        key: "consciencia.profile",
        label: "Perfil do líder",
        description: "Papel declarado, DISC/MBTI, estilo de comunicação, notas.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.hsh",
        label: "Lente Hard · Soft · Heart",
        description: "Autoavaliação nas três dimensões da liderança.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.sabotages",
        label: "Sabotadores",
        description: "Padrões internos que atrapalham a liderança.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.risks",
        label: "Riscos comportamentais declarados",
        description: "Flags como controle, evita conflito, cobrança dura.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.assessment_wizard",
        label: "Assessment guiado (5 passos)",
        description: "Fluxo passo a passo do módulo C.",
        actions: ["view"],
      },
      {
        key: "consciencia.commitments",
        label: "Compromissos de mentoria",
        description: "Frases-âncora ativas do líder.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.cross_signals",
        label: "Alertas cruzados",
        description: "Motor que cruza perfil com rituais/delegações.",
        actions: ["view"],
      },
      {
        key: "consciencia.coverage",
        label: "Cobertura organizacional (agregada)",
        description: "Somente contagem — nunca conteúdo íntimo.",
        actions: ["view", "export"],
      },
      {
        key: "consciencia.activity",
        label: "Descrição de atividades do líder",
        description: "Texto ou upload que o líder registra para alimentar o PDI.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.pdi_auto",
        label: "PDI auto-gerado",
        description: "Cruzamento radar HSH + sabotadores + descrição → PDI com gaps priorizados.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.coach_track",
        label: "Trilha do coach C.O.R.E.",
        description: "Trilha periódica (semanal/quinzenal/mensal) travada na metodologia.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.voice_agenda",
        label: "Assistente de voz — agenda de liderança",
        description: "Ditado do líder vira ação registrada na agenda.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.subordinate_send",
        label: "Envio de assessment ao liderado",
        description: "Dispara DISC / Sabotadores / Cerebral via WhatsApp para o liderado.",
        actions: ["view", "edit"],
      },
      {
        key: "consciencia.subordinate_map",
        label: "Mapa comportamental da equipe",
        description: "Perfis dos liderados a partir das respostas aos pulses.",
        actions: ["view", "export"],
      },
    ],
  },
  {
    code: "nr1",
    name: "NR-1",
    features: [
      {
        key: "nr1.surveys",
        label: "Rodadas de diagnóstico",
        description: "Cria e encerra rodadas anônimas de riscos psicossociais.",
        actions: ["view", "edit"],
      },
      {
        key: "nr1.results",
        label: "Resultado e análise do líder",
        description: "Fatores, tabulação, comparação entre ciclos e análise por fator.",
        actions: ["view", "edit"],
      },
      {
        key: "nr1.ai_analysis",
        label: "Análise assistida por IA",
        description: "Leitura agregada do resultado por modelo de linguagem.",
        actions: ["view", "export"],
      },
      {
        key: "nr1.actions",
        label: "Riscos e ações",
        description: "CRUD de riscos e ações, responsáveis, prazos e evidências.",
        actions: ["view", "edit"],
      },
      {
        key: "nr1.entry_modes",
        label: "Modos de entrada",
        description: "Inventário de riscos, plano de ação existente e conversa guiada.",
        actions: ["view", "edit"],
      },
      {
        key: "nr1.complaints",
        label: "Canal seguro de denúncias",
        description: "Denúncias anônimas e notificações aos leaders autorizados.",
        actions: ["view", "export"],
      },
      {
        key: "nr1.export",
        label: "Exportação do resultado",
        description: "Baixa do resultado agregado em CSV.",
        actions: ["export"],
      },
    ],
  },
];

// Defaults por role — usados no bootstrap para semear templates.
// true = ligado; ausente = false.
type Role =
  "super_admin" | "neo_admin" | "franchise_owner" | "hr_admin" | "leader" | "collaborator";

export const TEMPLATE_DEFAULTS: Record<
  Role,
  { name: string; description: string; enabled: Partial<Record<string, FeatureAction[]>> }
> = {
  super_admin: {
    name: "Super Admin",
    description: "Acesso completo — visualiza, edita e exporta tudo.",
    enabled: {
      "consciencia.profile": ["view", "edit"],
      "consciencia.hsh": ["view", "edit"],
      "consciencia.sabotages": ["view", "edit"],
      "consciencia.risks": ["view", "edit"],
      "consciencia.assessment_wizard": ["view"],
      "consciencia.commitments": ["view", "edit"],
      "consciencia.cross_signals": ["view"],
      "consciencia.coverage": ["view", "export"],
      "consciencia.activity": ["view", "edit"],
      "consciencia.pdi_auto": ["view", "edit"],
      "consciencia.coach_track": ["view", "edit"],
      "consciencia.voice_agenda": ["view", "edit"],
      "consciencia.subordinate_send": ["view", "edit"],
      "consciencia.subordinate_map": ["view", "export"],
      "nr1.surveys": ["view", "edit"],
      "nr1.results": ["view", "edit"],
      "nr1.ai_analysis": ["view", "export"],
      "nr1.actions": ["view", "edit"],
      "nr1.entry_modes": ["view", "edit"],
      "nr1.complaints": ["view", "export"],
      "nr1.export": ["export"],
    },
  },
  neo_admin: {
    name: "Neo Admin",
    description: "Administração da plataforma — visão agregada.",
    enabled: {
      "consciencia.coverage": ["view", "export"],
      "nr1.surveys": ["view"],
      "nr1.results": ["view"],
      "nr1.ai_analysis": ["view"],
      "nr1.actions": ["view"],
      "nr1.complaints": ["view", "export"],
    },
  },
  franchise_owner: {
    name: "Gestor / Franqueado",
    description: "Vê o próprio perfil e cobertura agregada do time.",
    enabled: {
      "consciencia.profile": ["view", "edit"],
      "consciencia.hsh": ["view", "edit"],
      "consciencia.assessment_wizard": ["view"],
      "consciencia.commitments": ["view", "edit"],
      "consciencia.cross_signals": ["view"],
      "consciencia.coverage": ["view"],
      "consciencia.activity": ["view", "edit"],
      "consciencia.pdi_auto": ["view", "edit"],
      "consciencia.coach_track": ["view", "edit"],
      "consciencia.voice_agenda": ["view", "edit"],
      "consciencia.subordinate_send": ["view", "edit"],
      "consciencia.subordinate_map": ["view"],
      "nr1.surveys": ["view", "edit"],
      "nr1.results": ["view", "edit"],
      "nr1.ai_analysis": ["view"],
      "nr1.actions": ["view", "edit"],
      "nr1.entry_modes": ["view", "edit"],
      "nr1.export": ["export"],
    },
  },
  hr_admin: {
    name: "RH / Consultor",
    description: "Foco em cobertura agregada. Sem conteúdo íntimo.",
    enabled: {
      "consciencia.coverage": ["view", "export"],
      "consciencia.subordinate_map": ["view"],
      "nr1.surveys": ["view", "edit"],
      "nr1.results": ["view", "edit"],
      "nr1.ai_analysis": ["view", "export"],
      "nr1.actions": ["view", "edit"],
      "nr1.entry_modes": ["view", "edit"],
      "nr1.complaints": ["view", "export"],
      "nr1.export": ["export"],
    },
  },
  leader: {
    name: "Líder",
    description: "Uso individual — auto-conhecimento completo.",
    enabled: {
      "consciencia.profile": ["view", "edit"],
      "consciencia.hsh": ["view", "edit"],
      "consciencia.sabotages": ["view", "edit"],
      "consciencia.risks": ["view", "edit"],
      "consciencia.assessment_wizard": ["view"],
      "consciencia.commitments": ["view", "edit"],
      "consciencia.cross_signals": ["view"],
      "consciencia.activity": ["view", "edit"],
      "consciencia.pdi_auto": ["view", "edit"],
      "consciencia.coach_track": ["view", "edit"],
      "consciencia.voice_agenda": ["view", "edit"],
      "consciencia.subordinate_send": ["view", "edit"],
      "consciencia.subordinate_map": ["view"],
      "nr1.surveys": ["view", "edit"],
      "nr1.results": ["view", "edit"],
      "nr1.ai_analysis": ["view"],
      "nr1.actions": ["view", "edit"],
      "nr1.entry_modes": ["view", "edit"],
      "nr1.export": ["export"],
    },
  },
  collaborator: {
    name: "Colaborador",
    description: "Perfil individual básico, sem alertas cruzados.",
    enabled: {
      "consciencia.profile": ["view", "edit"],
      "consciencia.hsh": ["view", "edit"],
      "consciencia.commitments": ["view", "edit"],
    },
  },
};
