---
version: alpha
name: "Líder C.O.R.E."
description: "Sala operacional de liderança que transforma sinais de gestão em decisões e ações claras."
colors:
  background: "oklch(0.99 0.003 250)"
  foreground: "oklch(0.19 0.02 260)"
  card: "oklch(1 0 0)"
  border: "oklch(0.92 0.006 250)"
  primary: "oklch(0.635 0.185 47)"
  accent: "oklch(0.72 0.17 55)"
  consciousness: "oklch(0.65 0.20 250)"
  organization: "oklch(0.68 0.14 155)"
  result: "oklch(0.62 0.22 27)"
  evolution: "oklch(0.72 0.17 55)"
typography:
  sans:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
  display:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
  editorial:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
rounded:
  DEFAULT: "0.75rem"
  sm: "0.5rem"
  md: "0.625rem"
  lg: "0.75rem"
  xl: "1rem"
spacing:
  page-max: "75rem"
  section-gap: "2rem"
components:
  button: {}
  card: {}
  dialog: {}
  table: {}
  input: {}
---

# Líder C.O.R.E. Design System

## Overview

### Creative North Star

Uma sala de gestão contemporânea: informação densa, legível e hierarquizada como um quadro de acompanhamento executivo, sem imitar planilhas ou dashboards genéricos.

### Product context and register

- **Audience and primary job:** líderes e gestores brasileiros que precisam transformar indicadores, pessoas e rituais em decisões semanais.
- **Target market and evidence:** Brasil, evidenciado pelo conteúdo, formatação `pt-BR` e terminologia de gestão presentes no produto.
- **Locale and language policy:** português brasileiro em toda a interface e nos nomes acessíveis.
- **Usage scene:** uso recorrente em desktop e celular, com leitura rápida entre reuniões e atualização de rotinas de gestão.
- **Register:** produto; clareza operacional prevalece sobre expressão de marca.
- **Memorable signature:** os quatro pilares C.O.R.E. usam cores semânticas próprias em navegação e contexto, nunca como única indicação de estado.
- **Restraint:** formulários, tabelas, confirmações e estados assíncronos seguem padrões familiares e discretos.
- **Anti-references:** evitar dashboards financeiros neon, cartões decorativos sem função e estética de apresentação institucional.
- **Token ownership/runtime mapping:** este arquivo documenta os tokens canônicos implementados em `src/styles.css`; alterações duráveis devem atualizar os dois no mesmo changeset.

## Colors

A base é quase branca com texto azul-carvão e superfícies brancas. O laranja terroso é a ação global da marca. As cores dos pilares contextualizam módulos: azul para Consciência, verde para Organização, vermelho para Resultado e laranja para Evolução. Verde, âmbar e vermelho mantêm papéis semânticos de sucesso, atenção e risco com rótulo ou ícone associado. O tema escuro preserva a mesma hierarquia por meio dos tokens correspondentes em `src/styles.css`.

## Typography

Plus Jakarta Sans é a família de produto e de títulos, com peso e escala criando hierarquia. Fraunces é reservada a momentos editoriais pontuais. Números usam algarismos tabulares quando comparados. Rótulos utilitários podem usar caixa alta com espaçamento, mas textos de ação e orientação permanecem em frase normal.

## Layout

O shell limita o conteúdo a 75rem. Seções usam ritmo vertical de 2rem, grades responsivas e cartões que se empilham no celular. Superfícies de dados controlam seu próprio overflow; o documento permanece o dono da rolagem principal. Estados de carregamento e erro devem reservar geometria compatível com o conteúdo final.

## Elevation & Depth

Bordas e diferenças tonais fazem a maior parte da hierarquia. Sombras suaves são permitidas em superfícies elevadas, cabeçalhos e chamadas principais. Cartões de dados rotineiros permanecem planos. Blur fica restrito ao chrome fixo e a overlays.

## Shapes

Controles usam raio entre 0,5rem e 0,75rem; cartões principais chegam a 1rem ou 1,5rem. Pílulas são reservadas a filtros, estados e ações compactas. Ícones Lucide usam traço consistente e ficam alinhados opticamente ao texto.

## Components

### Foundational visual states

Todo controle interativo tem hover, foco visível, estado pressionado e estado desabilitado quando aplicável. O carregamento padrão usa o spinner compartilhado sem mover controles. Sucesso, atenção e erro combinam cor com texto. Movimento reduzido deve eliminar transições não essenciais.

### Buttons and actions

Botões sólidos representam a ação primária; outline e ghost reduzem ênfase. A intenção destrutiva fica separada das ações seguras e usa confirmação do aplicativo. Ícones antecedem o rótulo; controles apenas com ícone precisam de nome acessível.

### Navigation and data display

Sidebar, abas de módulo e navegação móvel preservam os mesmos nomes e destinos. Listas e tabelas apresentam loading, vazio e erro de forma explícita. Em telas estreitas, dados viram cartões ou ganham overflow interno visível sem ocultar ações.

### Forms and overlays

Campos usam os primitivos compartilhados em `src/components/ui`. Selects e dialogs são os componentes Radix mantidos pelo projeto. Erros aparecem em texto junto ao campo. Dialogs mantêm título, descrição, foco, Escape e ações alcançáveis.

### Iconography

Lucide React é a família única. Ícones têm 14–20px na maioria dos controles e não substituem rótulos quando a ação não é universalmente reconhecida.

### Motion

Transições de 150–220ms comunicam hover, expansão e mudança de estado. Não usar animação ambiente em telas operacionais. Respeitar `prefers-reduced-motion`.

### Content and data visualization

A voz é direta, em português brasileiro, nomeando o que o líder controla. Métricas mostram valor, referência e período. Toda visualização por cor mantém legenda textual ou rótulo acessível.

## Do's and Don'ts

- **Do:** começar pelo resultado esperado do time e mostrar indicadores que antecipam desvios.
- **Do:** reutilizar tokens, primitivos e vocabulário dos fluxos irmãos.
- **Don't:** criar números decorativos ou estados sem consequência operacional.
- **Don't:** comunicar risco somente por cor, esconder rolagem ou deslocar controles durante carregamento.
