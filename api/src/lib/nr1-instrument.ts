/**
 * NR-1 — Instrumento oficial de diagnóstico (Marcos 03–05 do documento funcional).
 *
 * 33 perguntas aplicadas a todos os colaboradores, independentemente do modelo
 * de trabalho. Todas formuladas positivamente (quanto maior a resposta, mais
 * favorável a condição percebida).
 *
 * Mapa de tabulação: cada pergunta tem peso 1 dentro de cada fator a que está
 * vinculada; quando vinculada a mais de um fator, a mesma resposta é usada
 * integralmente em todos eles (não é dividida nem reduzida).
 *
 * Conversão: Percentual = ((média do fator − 1) ÷ 4) × 100
 * Classificação: ≥75% muito favorável | 50–74,9% atenção | <50% prioridade.
 * Faixas são classificações internas do indicador do Lider C.O.R.E. — não
 * substituem a classificação técnica de risco ocupacional do PGR/NR-1.
 */

export type NR1FactorId =
  | "assedio"
  | "gestao_mudancas"
  | "clareza_papel"
  | "reconhecimento"
  | "suporte"
  | "controle_autonomia"
  | "justica_organizacional"
  | "eventos_violentos"
  | "baixa_demanda"
  | "excesso_demandas"
  | "relacoes_trabalho"
  | "comunicacao"
  | "trabalho_remoto";

export type NR1Factor = {
  id: NR1FactorId;
  name: string;
  /** Explicação objetiva do que o fator representa (Marco 7.2). */
  description: string;
};

export const NR1_FACTORS: NR1Factor[] = [
  {
    id: "assedio",
    name: "Assédio de qualquer natureza no trabalho",
    description:
      "Relacionado à percepção sobre tolerância a situações de constrangimento, humilhação, intimidação, discriminação ou qualquer forma de assédio, e à existência de caminhos claros para agir e recorrer.",
  },
  {
    id: "gestao_mudancas",
    name: "Má gestão de mudanças organizacionais",
    description:
      "Relacionado à percepção sobre comunicação, estrutura e suporte diante de mudanças que impactam o trabalho.",
  },
  {
    id: "clareza_papel",
    name: "Baixa clareza de papel/função",
    description:
      "Relacionado à percepção sobre clareza de responsabilidades, prioridades, resultados esperados e consistência das orientações recebidas.",
  },
  {
    id: "reconhecimento",
    name: "Baixas recompensas e reconhecimento",
    description:
      "Relacionado à percepção sobre valorização, elogios e reconhecimento pelo bom trabalho e esforço.",
  },
  {
    id: "suporte",
    name: "Falta de suporte/apoio no trabalho",
    description:
      "Relacionado à percepção sobre apoio da liderança imediata, dos colegas e da organização diante de problemas e necessidades de aprendizado.",
  },
  {
    id: "controle_autonomia",
    name: "Baixo controle no trabalho / falta de autonomia",
    description:
      "Relacionado à percepção sobre autonomia para decidir como realizar o trabalho e participação nas decisões relacionadas a ele.",
  },
  {
    id: "justica_organizacional",
    name: "Baixa justiça organizacional",
    description:
      "Relacionado à percepção sobre justiça das decisões da direção e aplicação consistente das regras e critérios que afetam os colaboradores.",
  },
  {
    id: "eventos_violentos",
    name: "Eventos violentos ou traumáticos",
    description:
      "Relacionado à percepção sobre medidas de prevenção de situações de violência, ameaça ou agressão relacionadas ao trabalho.",
  },
  {
    id: "baixa_demanda",
    name: "Baixa demanda no trabalho (subcarga)",
    description:
      "Relacionado à percepção sobre quantidade insuficiente de atividades e oportunidades para utilizar competências, conhecimentos e habilidades.",
  },
  {
    id: "excesso_demandas",
    name: "Excesso de demandas no trabalho (sobrecarga)",
    description:
      "Relacionado à percepção sobre volume e distribuição das atividades, prazos, ritmo de trabalho e pressão para realização das tarefas.",
  },
  {
    id: "relacoes_trabalho",
    name: "Más relações no local de trabalho",
    description:
      "Relacionado à percepção sobre respeito mútuo, colaboração e condução de conflitos na equipe.",
  },
  {
    id: "comunicacao",
    name: "Trabalho em condições de difícil comunicação",
    description:
      "Relacionado à percepção sobre clareza dos conteúdos e canais de comunicação da organização.",
  },
  {
    id: "trabalho_remoto",
    name: "Trabalho remoto e isolado",
    description:
      "Relacionado à percepção sobre oportunidades adequadas de interação e contato com a equipe e liderança, independentemente do modelo de trabalho.",
  },
];

export type NR1Question = {
  /** Q1..Q33 conforme documento. */
  id: string;
  label: string;
  factors: NR1FactorId[];
};

export const NR1_QUESTIONS: NR1Question[] = [
  { id: "q1", label: "Tenho clareza sobre minhas responsabilidades e atribuições no trabalho.", factors: ["clareza_papel"] },
  { id: "q2", label: "Sei quais são as prioridades e os resultados esperados para minha função.", factors: ["clareza_papel"] },
  { id: "q3", label: "As orientações que recebo sobre meu trabalho são claras e consistentes entre si.", factors: ["clareza_papel", "comunicacao"] },
  { id: "q4", label: "Meu líder comunica com clareza as prioridades das minhas demandas.", factors: ["clareza_papel", "suporte"] },
  { id: "q5", label: "A distribuição das atividades da minha função é adequada.", factors: ["excesso_demandas"] },
  { id: "q6", label: "Meu volume de trabalho é compatível com minha capacidade e rotina.", factors: ["excesso_demandas"] },
  { id: "q7", label: "Os prazos definidos para execução das atividades são realistas.", factors: ["excesso_demandas"] },
  { id: "q8", label: "Consigo realizar minhas atividades sem pressão excessiva.", factors: ["excesso_demandas"] },
  { id: "q9", label: "Tenho uma quantidade de atividades e responsabilidades adequada para utilizar minhas competências e conhecimentos.", factors: ["baixa_demanda"] },
  { id: "q10", label: "Tenho oportunidades suficientes para aplicar meus conhecimentos e habilidades no meu trabalho.", factors: ["baixa_demanda"] },
  { id: "q11", label: "Tenho autonomia para decidir como realizar meu trabalho dentro das responsabilidades da minha função.", factors: ["controle_autonomia", "clareza_papel"] },
  { id: "q12", label: "Minha opinião é considerada nas decisões relacionadas ao meu trabalho.", factors: ["controle_autonomia"] },
  { id: "q13", label: "As decisões tomadas pela direção em relação aos colaboradores são justas.", factors: ["justica_organizacional"] },
  { id: "q14", label: "As regras e critérios utilizados para tomar decisões que afetam os colaboradores são aplicados de forma justa e consistente.", factors: ["justica_organizacional"] },
  { id: "q15", label: "Quando uma decisão importante afeta meu trabalho, recebo informações ou explicações adequadas sobre ela.", factors: ["justica_organizacional", "comunicacao"] },
  { id: "q16", label: "Recebo elogios quando realizo um bom trabalho.", factors: ["reconhecimento"] },
  { id: "q17", label: "Aqui sinto que sou valorizado e faço a diferença.", factors: ["reconhecimento"] },
  { id: "q18", label: "Meu líder imediato mostra reconhecimento pelo bom trabalho e esforço dos colaboradores.", factors: ["reconhecimento", "suporte"] },
  { id: "q19", label: "Sinto o apoio necessário do meu líder imediato.", factors: ["suporte"] },
  { id: "q20", label: "Quando surge um problema no trabalho, posso contar com meus colegas de equipe.", factors: ["suporte", "relacoes_trabalho"] },
  { id: "q21", label: "Quando tenho necessidade de aprender algo novo referente ao meu trabalho, recebo apoio através de orientações ou cursos.", factors: ["suporte", "clareza_papel"] },
  { id: "q22", label: "Existe respeito mútuo entre os membros da minha equipe.", factors: ["relacoes_trabalho"] },
  { id: "q23", label: "Existe colaboração adequada entre os membros da minha equipe, mesmo à distância.", factors: ["relacoes_trabalho", "trabalho_remoto"] },
  { id: "q24", label: "Minha liderança conduz conflitos de forma respeitosa e equilibrada.", factors: ["relacoes_trabalho", "suporte", "justica_organizacional"] },
  { id: "q25", label: "No meu ambiente de trabalho, não são toleradas situações de constrangimento, humilhação, intimidação, discriminação ou qualquer forma de assédio.", factors: ["assedio", "relacoes_trabalho"] },
  { id: "q26", label: "Sei como agir e a quem recorrer caso ocorra uma situação de assédio, violência, ameaça ou outro evento grave relacionado ao trabalho.", factors: ["assedio", "eventos_violentos"] },
  { id: "q27", label: "A organização possui medidas adequadas para prevenir situações de violência, ameaça ou agressão relacionadas ao trabalho.", factors: ["eventos_violentos"] },
  { id: "q28", label: "Recebo informações suficientes sobre mudanças que impactam meu trabalho.", factors: ["gestao_mudancas", "comunicacao"] },
  { id: "q29", label: "As mudanças organizacionais são comunicadas de forma clara e transparente.", factors: ["gestao_mudancas", "comunicacao"] },
  { id: "q30", label: "Mudanças organizacionais são tratadas de forma estruturada e responsável.", factors: ["gestao_mudancas"] },
  { id: "q31", label: "Quando mudanças impactam meu trabalho, recebo o suporte necessário para me adaptar às novas condições.", factors: ["gestao_mudancas", "suporte"] },
  { id: "q32", label: "Os conteúdos transmitidos pelos canais de comunicação são claros.", factors: ["comunicacao"] },
  { id: "q33", label: "Tenho oportunidades adequadas de interação e contato com minha equipe e liderança, independentemente do meu modelo de trabalho.", factors: ["trabalho_remoto", "suporte", "relacoes_trabalho"] },
];

export const NR1_QUESTION_IDS = NR1_QUESTIONS.map((q) => q.id);

/** Texto de abertura do questionário (Marco 04). */
export const NR1_INTRO = {
  title: "Avaliação das condições de trabalho",
  paragraphs: [
    "Queremos entender como você percebe as condições de trabalho da sua equipe.",
    "Não existem respostas certas ou erradas. Responda considerando sua experiência no trabalho.",
    "Suas respostas serão analisadas de forma agregada, preservando a confidencialidade das respostas individuais.",
  ],
};

/** Escala de resposta (Marco 3.4). "na" não entra no cálculo. */
export const NR1_SCALE = [
  { value: 1, label: "Discordo totalmente" },
  { value: 2, label: "Discordo parcialmente" },
  { value: 3, label: "Nem concordo, nem discordo" },
  { value: 4, label: "Concordo parcialmente" },
  { value: 5, label: "Concordo totalmente" },
  { value: "na", label: "Não se aplica / Não consigo avaliar" },
] as const;

/** Mínimo de respostas válidas para apresentar resultados agregados (Marco 3.5). */
export const NR1_MIN_RESPONSES = 3;

/**
 * Ações-modelo por fator — usadas pelo fluxo "Ainda não sei" (Marco 02) para
 * sugerir um primeiro passo concreto a partir dos fatores que o líder apontou.
 *
 * Conteúdo estático, sem chamada de IA: o fluxo precisa ser instantâneo e uma
 * recomendação de prevenção não pode variar por execução. O texto é ponto de
 * partida editável, não decisão técnica — a validação permanece com SST.
 */
export const NR1_FACTOR_SUGGESTIONS: Record<NR1FactorId, { situation: string; description: string }> = {
  clareza_papel: {
    situation: "Clareza de papéis e prioridades da equipe",
    description:
      "Revisitar com cada pessoa as responsabilidades da função e as prioridades do período, registrando por escrito o que é esperado. Padronizar as orientações dadas pela liderança para que não sejam contraditórias entre si.",
  },
  excesso_demandas: {
    situation: "Sobrecarga e prazos da equipe",
    description:
      "Mapear o volume de atividades e os prazos do período com a equipe, identificar os gargalos e repactuar o que é possível. Registrar o que ficou fora da repactuação para decisão do nível apropriado.",
  },
  baixa_demanda: {
    situation: "Subutilização de competências na equipe",
    description:
      "Identificar conhecimentos e habilidades disponíveis na equipe que não estão sendo usados e buscar com o gestor a realocação de atividades ou novos desafios compatíveis com a função.",
  },
  controle_autonomia: {
    situation: "Autonomia e participação nas decisões",
    description:
      "Ampliar o espaço de decisão da equipe sobre como executar o próprio trabalho e criar um canal recorrente para ouvir a opinião das pessoas antes de decisões que as afetem, devolvendo o que foi acatado e o que não foi.",
  },
  justica_organizacional: {
    situation: "Transparência de critérios nas decisões",
    description:
      "Tornar explícitos os critérios usados em decisões que afetam a equipe (tarefas, reconhecimento, ajustes) e aplicar esses critérios de forma consistente entre as pessoas. Explicar o motivo das decisões relevantes.",
  },
  reconhecimento: {
    situation: "Reconhecimento pelo trabalho realizado",
    description:
      "Instituir uma rotina de reconhecimento — verbal e por escrito — pelas entregas e pelo esforço da equipe, com critérios claros e alcance que não beneficie sempre as mesmas pessoas.",
  },
  suporte: {
    situation: "Apoio da liderança no dia a dia",
    description:
      "Ampliar a disponibilidade da liderança para apoiar a equipe em problemas e necessidades de aprendizado, com momentos fixos de conversa e encaminhamento concreto das demandas trazidas.",
  },
  comunicacao: {
    situation: "Comunicação de informações da organização",
    description:
      "Garantir que as informações relevantes da organização cheguem à equipe por um canal definido, em linguagem clara e no momento adequado, com espaço para perguntas e esclarecimento de dúvidas.",
  },
  relacoes_trabalho: {
    situation: "Convívio e conflitos na equipe",
    description:
      "Atuar nos conflitos existentes com conversas individuais antes de expor publicamente, reforçar combinados de convivência e dar retorno imediato a situações de desrespeito entre a equipe.",
  },
  trabalho_remoto: {
    situation: "Isolamento em modelo de trabalho distribuído",
    description:
      "Criar momentos regulares de contato entre a equipe e a liderança que não sejam apenas prestação de contas de tarefas, e garantir que quem está a distância receba as mesmas informações de quem está presencial.",
  },
  gestao_mudancas: {
    situation: "Condução de mudanças organizacionais",
    description:
      "Antecipar à equipe as mudanças que impactam seu trabalho, explicando o motivo, o que muda na prática e o que não muda, mantendo um ponto de contato para dúvidas durante a transição.",
  },
  eventos_violentos: {
    situation: "Prevenção de situações de violência no trabalho",
    description:
      "Reforçar com a equipe os canais e os procedimentos de segurança para situações de ameaça ou agressão, inclusive no atendimento a terceiros, e acionar SST e as áreas responsáveis para avaliar as medidas de proteção adequadas.",
  },
  assedio: {
    situation: "Prevenção e resposta a assédio no trabalho",
    description:
      "Reforçar com a equipe a existência e o sigilo do canal de denúncias, deixar claro o posicionamento da liderança contra qualquer forma de assédio e acionar SST e as áreas competentes para conduzir apurações — a liderança não investiga casos sozinha.",
  },
};

const NR1_MESSAGES = {
  insufficient:
    "Ainda não há respostas suficientes para apresentar o resultado de forma agregada e preservar a confidencialidade da equipe.",
  noPrevious: "Ainda não há uma avaliação anterior para comparação.",
} as const;

export function nr1Message(key: keyof typeof NR1_MESSAGES) {
  return NR1_MESSAGES[key];
}

export type NR1AnswerValue = number | "na";
export type NR1Answers = Record<string, NR1AnswerValue>;

/** Perguntas vinculadas a um fator. */
export function nr1QuestionsForFactor(factorId: NR1FactorId) {
  return NR1_QUESTIONS.filter((q) => q.factors.includes(factorId));
}

export type NR1FactorResult = {
  id: NR1FactorId;
  name: string;
  /** Média bruta (1–5) das respostas válidas, ou null se não houver. */
  average: number | null;
  /** Percentual convertido ((média − 1) ÷ 4 × 100), ou null se não houver. */
  percent: number | null;
  /** Quantidade de respostas válidas consideradas. */
  validCount: number;
  classification: "muito_favoravel" | "atencao" | "prioridade" | null;
};

/**
 * Calcula o resultado de um fator a partir de um conjunto de respostas.
 * N/A não entra no cálculo (Marco 05). Peso 1 por pergunta em cada fator;
 * respostas vinculadas a mais de um fator entram integralmente em todos.
 */
export function nr1FactorResult(
  factor: NR1Factor,
  answersList: NR1Answers[],
): NR1FactorResult {
  const questions = nr1QuestionsForFactor(factor.id);
  const values: number[] = [];
  for (const answers of answersList) {
    for (const q of questions) {
      const v = answers[q.id];
      if (typeof v === "number") values.push(v);
    }
  }
  if (values.length === 0) {
    return {
      id: factor.id,
      name: factor.name,
      average: null,
      percent: null,
      validCount: 0,
      classification: null,
    };
  }
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const percent = ((average - 1) / 4) * 100;
  return {
    id: factor.id,
    name: factor.name,
    average,
    percent,
    validCount: values.length,
    classification: classifyNr1Percent(percent),
  };
}

export function classifyNr1Percent(
  percent: number,
): "muito_favoravel" | "atencao" | "prioridade" {
  if (percent >= 75) return "muito_favoravel";
  if (percent >= 50) return "atencao";
  return "prioridade";
}

/** Resultado agregado dos 13 fatores para um conjunto de respostas. */
export function nr1FactorResults(answersList: NR1Answers[]): NR1FactorResult[] {
  return NR1_FACTORS.map((f) => nr1FactorResult(f, answersList));
}

/** Tabulação por pergunta (para o detalhamento de cada fator, Marco 6.5/7.5). */
export function nr1QuestionTabulation(answersList: NR1Answers[]) {
  return NR1_QUESTIONS.map((q) => {
    const values = answersList
      .map((a) => a[q.id])
      .filter((v): v is number => typeof v === "number");
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return {
      id: q.id,
      label: q.label,
      factors: q.factors,
      average: avg,
      percent: avg === null ? null : ((avg - 1) / 4) * 100,
      validCount: values.length,
    };
  });
}
