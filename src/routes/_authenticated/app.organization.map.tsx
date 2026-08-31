import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import {
  Building2,
  Network,
  Users2,
  ChevronRight,
  Upload,
  Download,
  Loader2,
  GitBranch,
  Rows3,
  Workflow,
  UserRound,
  Crown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export const Route = createFileRoute("/_authenticated/app/organization/map")({
  component: OrgMap,
  head: () => ({
    meta: [
      { title: "Organograma vivo · LíderCore" },
      {
        name: "description",
        content:
          "Visualize a estrutura da empresa em árvore, empilhado ou fluxograma, importe o organograma por CSV e vincule cargos de líderes e equipes.",
      },
      { property: "og:title", content: "Organograma vivo · LíderCore" },
      {
        property: "og:description",
        content: "Importe e navegue o organograma da empresa com cargos, líderes e equipes conectados ao processo C.O.R.E.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  roleTitle?: string | null;
  directLeaderId?: string | null;
};
type Team = {
  id: string;
  name: string;
  objectives: string | null;
  mission: string | null;
  leaderMembershipId?: string | null;
  peopleCount: number;
  members: Member[];
};
type Area = {
  id: string;
  name: string;
  mission: string | null;
  objective: string | null;
  kpis: string[];
  peopleCount: number;
  teams: Team[];
};
type Branch = { id: string; name: string; code: string | null; city: string | null; peopleCount: number; areas: Area[] };
type MapData = {
  organization: { id: string; name: string; slug: string; logoUrl: string | null };
  totals: { branches: number; areas: number; teams: number; people: number; leaders: number };
  branches: Branch[];
  areasWithoutBranch: Area[];
};

type ViewMode = "tree" | "stacked" | "flow";
type Selection = { kind: "area" | "team"; data: Area | Team };

const VIEWS: { id: ViewMode; label: string; icon: typeof GitBranch }[] = [
  { id: "tree", label: "Árvore", icon: GitBranch },
  { id: "stacked", label: "Empilhado", icon: Rows3 },
  { id: "flow", label: "Fluxograma", icon: Workflow },
];

function OrgMap() {
  const { orgId } = useCurrentOrg();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [view, setView] = useState<ViewMode>("tree");
  const q = useQuery({
    queryKey: ["org", "map", orgId],
    queryFn: () => api<MapData>(`/organization/${orgId}/map`),
    enabled: !!orgId,
  });

  if (!orgId) return null;
  if (q.isLoading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (!q.data) return null;

  const { totals, branches, areasWithoutBranch } = q.data;
  const allBranches: Branch[] = areasWithoutBranch.length
    ? [
        ...branches,
        {
          id: "__matriz__",
          name: "Matriz",
          code: null,
          city: null,
          peopleCount: areasWithoutBranch.reduce((s, a) => s + a.peopleCount, 0),
          areas: areasWithoutBranch,
        },
      ]
    : branches;

  const isEmpty = allBranches.every((b) => b.areas.length === 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-foreground">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Organograma
              </div>
              <h1 className="mt-1 font-display text-2xl leading-tight">Mapa vivo da empresa</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Importe a estrutura da empresa e navegue por filiais, áreas, equipes e cargos. Passe o mouse nas pessoas
                para ver cargo e líder direto; clique nos blocos para abrir o detalhe.
              </p>
            </div>
          </div>
          <ImportDialog orgId={orgId} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Total label="Filiais" value={totals.branches} />
        <Total label="Áreas" value={totals.areas} />
        <Total label="Equipes" value={totals.teams} />
        <Total label="Pessoas" value={totals.people} />
        <Total label="Líderes" value={totals.leaders} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Visualização</span>
        <div className="flex gap-1 rounded-2xl border border-border bg-card p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition " +
                (view === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary")
              }
            >
              <v.icon className="h-3.5 w-3.5" /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <Network className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Ainda não há estrutura cadastrada. Importe o organograma da empresa por CSV para começar.
          </p>
          <div className="mt-4 flex justify-center">
            <ImportDialog orgId={orgId} />
          </div>
        </div>
      ) : view === "stacked" ? (
        <StackedView branches={allBranches} onSelect={setSelected} />
      ) : view === "tree" ? (
        <TreeView branches={allBranches} onSelect={setSelected} />
      ) : (
        <FlowView orgName={q.data.organization.name} branches={allBranches} onSelect={setSelected} />
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected?.data.name}</SheetTitle>
          </SheetHeader>
          {selected?.kind === "area" && <AreaPanel area={selected.data as Area} />}
          {selected?.kind === "team" && <TeamPanel team={selected.data as Team} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------
// Importação CSV
// ------------------------------------------------------------
const TEMPLATE_CSV = [
  "filial,area,equipe,cargo,nome,email,whatsapp,nivel,lider_email",
  "Matriz,Comercial,Vendas Interna,Gerente Comercial,Ana Souza,ana@empresa.com,+5511999990000,lider,",
  "Matriz,Comercial,Vendas Interna,Executivo de Vendas,Bruno Lima,bruno@empresa.com,+5511999990001,colaborador,ana@empresa.com",
  "Matriz,Operações,Logística,Coordenador de Logística,Carla Dias,carla@empresa.com,,lider,",
].join("\n");

type ImportSummary = {
  branches: number;
  areas: number;
  teams: number;
  roles: number;
  people: number;
  leaders: number;
  linkedLeaders?: number;
  errors: string[];
};

export function ImportDialog({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportSummary | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      api<ImportSummary>(`/organization/${orgId}/map/import`, { method: "POST", body: { csv, dryRun } }),
    onSuccess: (data, dryRun) => {
      setPreview(data);
      if (!dryRun) {
        toast.success(
          `Organograma importado: ${data.areas} área(s), ${data.teams} equipe(s), ${data.people} pessoa(s).`,
        );
        qc.invalidateQueries({ queryKey: ["org", "map", orgId] });
        setOpen(false);
        setCsv("");
        setPreview(null);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na importação"),
  });

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-organograma.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const [parsing, setParsing] = useState(false);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(file);
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPreview(null);
    const isCsv = /\.csv$/i.test(file.name) || file.type.includes("csv") || file.type.startsWith("text/");
    if (isCsv) {
      setCsv(await file.text());
      return;
    }
    setParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const out = await api<{ csv: string }>(`/organization/${orgId}/map/import/parse-file`, {
        method: "POST",
        body: { filename: file.name, mimeType: file.type || "application/pdf", base64 },
      });
      setCsv(out.csv);
      toast.success("Organograma lido do arquivo. Revise antes de importar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler este arquivo");
    } finally {
      setParsing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" /> Importar organograma
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar estrutura da empresa</DialogTitle>
          <DialogDescription>
            Envie um <strong>PDF, DOCX, imagem ou CSV</strong> do organograma. Em arquivos que não são CSV, a IA lê o
            documento e monta a planilha (filial, área, equipe, cargo, nome, e-mail, whatsapp, nível, líder direto) para
            você revisar antes de importar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Baixar modelo CSV
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary">
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {parsing ? "Lendo arquivo…" : "Escolher arquivo (PDF, DOCX, imagem ou CSV)"}
              <input
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf,.docx,.doc,image/*"
                className="hidden"
                disabled={parsing}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          </div>


          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
            rows={10}
            placeholder={TEMPLATE_CSV}
            className="font-mono text-xs"
          />

          {preview && (
            <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
              <div className="font-medium">Pré-visualização</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <span>{preview.branches} filial(is)</span>
                <span>{preview.areas} área(s)</span>
                <span>{preview.teams} equipe(s)</span>
                <span>{preview.roles} cargo(s)</span>
                <span>{preview.people} pessoa(s)</span>
                <span>{preview.leaders} líder(es)</span>
              </div>
              {preview.errors?.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-destructive">
                  {preview.errors.slice(0, 8).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={!csv.trim() || run.isPending} onClick={() => run.mutate(true)}>
              {run.isPending && run.variables === true ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar"}
            </Button>
            <Button disabled={!csv.trim() || run.isPending} onClick={() => run.mutate(false)}>
              {run.isPending && run.variables === false ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Importar estrutura"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
// Visualizações
// ------------------------------------------------------------
function StackedView({ branches, onSelect }: { branches: Branch[]; onSelect: (v: Selection) => void }) {
  return (
    <div className="space-y-8">
      {branches.map((b) => (
        <div key={b.id}>
          <BranchLabel branch={b} />
          <div className="grid gap-3 md:grid-cols-2">
            {b.areas.map((a) => (
              <AreaBlock key={a.id} area={a} onSelect={onSelect} />
            ))}
            {b.areas.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Esta filial ainda não tem áreas estruturadas no organograma.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TreeView({ branches, onSelect }: { branches: Branch[]; onSelect: (v: Selection) => void }) {
  return (
    <div className="space-y-6 rounded-3xl border border-border bg-card p-5">
      {branches.map((b) => (
        <div key={b.id}>
          <BranchLabel branch={b} />
          <ul className="ml-1 space-y-3 border-l border-border pl-5">
            {b.areas.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-5 top-4 h-px w-5 bg-border" />
                <button
                  onClick={() => onSelect({ kind: "area", data: a })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-left transition hover:border-accent/40"
                >
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.peopleCount} pessoas</span>
                </button>
                <ul className="ml-3 mt-2 space-y-2 border-l border-border pl-5">
                  {a.teams.map((t) => (
                    <li key={t.id} className="relative">
                      <span className="absolute -left-5 top-4 h-px w-5 bg-border" />
                      <button
                        onClick={() => onSelect({ kind: "team", data: t })}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-secondary"
                      >
                        <Users2 className="h-3 w-3" /> {t.name}
                        <span className="text-muted-foreground">· {t.peopleCount}</span>
                      </button>
                      <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
                        {t.members.map((m) => (
                          <PersonChip key={m.id} member={m} team={t} />
                        ))}
                      </div>
                    </li>
                  ))}
                  {a.teams.length === 0 && (
                    <li className="text-xs text-muted-foreground">Sem equipes nesta área.</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FlowView({
  orgName,
  branches,
  onSelect,
}: {
  orgName: string;
  branches: Branch[];
  onSelect: (v: Selection) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-card p-6">
      <div className="min-w-max">
        <div className="flex justify-center">
          <div className="rounded-2xl border border-primary/40 bg-primary/10 px-5 py-3 text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Organização</div>
            <div className="font-display text-lg">{orgName}</div>
          </div>
        </div>
        <Connector />
        <div className="flex items-start justify-center gap-8">
          {branches.map((b) => (
            <div key={b.id} className="flex flex-col items-center">
              <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-2 text-center">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Building2 className="h-3.5 w-3.5" /> {b.name}
                </div>
                <div className="text-[11px] text-muted-foreground">{b.peopleCount} pessoas</div>
              </div>
              {b.areas.length > 0 && <Connector />}
              <div className="flex items-start gap-6">
                {b.areas.map((a) => (
                  <div key={a.id} className="flex flex-col items-center">
                    <button
                      onClick={() => onSelect({ kind: "area", data: a })}
                      className="rounded-2xl border border-border bg-background px-4 py-2 text-center transition hover:border-accent/50 hover:shadow-sm"
                    >
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">{a.teams.length} equipes</div>
                    </button>
                    {a.teams.length > 0 && <Connector />}
                    <div className="flex items-start gap-4">
                      {a.teams.map((t) => (
                        <div key={t.id} className="flex flex-col items-center">
                          <button
                            onClick={() => onSelect({ kind: "team", data: t })}
                            className="rounded-xl border border-border bg-secondary/30 px-3 py-1.5 text-center text-xs font-medium transition hover:border-accent/50"
                          >
                            <span className="flex items-center gap-1.5">
                              <Users2 className="h-3 w-3" /> {t.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{t.peopleCount} pessoas</span>
                          </button>
                          {t.members.length > 0 && <Connector short />}
                          <div className="flex max-w-[220px] flex-wrap justify-center gap-1.5">
                            {t.members.map((m) => (
                              <PersonChip key={m.id} member={m} team={t} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Connector({ short }: { short?: boolean }) {
  return <div className={"mx-auto w-px bg-border " + (short ? "h-4" : "h-6")} />;
}

function PersonChip({ member, team }: { member: Member; team: Team }) {
  const isLeader = team.leaderMembershipId === member.id || member.role === "leader";
  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <Link
          to="/app/team/$membershipId"
          params={{ membershipId: member.id }}
          className={
            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition " +
            (isLeader
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-background text-muted-foreground hover:border-accent/50")
          }
        >
          {isLeader ? <Crown className="h-3 w-3 text-primary" /> : <UserRound className="h-3 w-3" />}
          <span className="max-w-[120px] truncate">{member.name}</span>
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-sm">
        <div className="font-medium">{member.name}</div>
        <div className="text-xs text-muted-foreground">{member.email}</div>
        <div className="mt-2 space-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Cargo: </span>
            {member.roleTitle ?? "Não informado"}
          </div>
          <div>
            <span className="text-muted-foreground">Equipe: </span>
            {team.name}
          </div>
          <div>
            <span className="text-muted-foreground">Perfil: </span>
            {isLeader ? "Líder da equipe" : "Liderado"}
          </div>
        </div>
        <div className="mt-2 text-[11px] text-primary">Clique para abrir o perfil e o processo dessa pessoa</div>
      </HoverCardContent>
    </HoverCard>
  );
}

function BranchLabel({ branch }: { branch: Branch }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
      <Building2 className="h-3.5 w-3.5" /> {branch.name}
      {branch.city && <span className="text-muted-foreground/70">· {branch.city}</span>}
      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px]">{branch.peopleCount} pessoas</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
    </div>
  );
}

function AreaBlock({ area, onSelect }: { area: Area; onSelect: (v: Selection) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition hover:border-accent/30 hover:shadow-sm">
      <button
        onClick={() => onSelect({ kind: "area", data: area })}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <div className="text-sm font-medium">{area.name}</div>
          <div className="text-xs text-muted-foreground">{area.mission ?? "Sem missão definida"}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5">{area.peopleCount} pessoas</span>
            <span className="rounded-full bg-secondary px-2 py-0.5">{area.teams.length} equipes</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-primary">
          Ver área <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
      {area.teams.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {area.teams.map((t) => (
            <div key={t.id}>
              <button
                onClick={() => onSelect({ kind: "team", data: t })}
                className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <Users2 className="h-3 w-3" /> {t.name}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {t.peopleCount}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
              <div className="ml-4 flex flex-wrap gap-1.5 pb-1">
                {t.members.map((m) => (
                  <PersonChip key={m.id} member={m} team={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AreaPanel({ area }: { area: Area }) {
  const leaders = useMemo(
    () => area.teams.flatMap((t) => t.members.filter((m) => t.leaderMembershipId === m.id || m.role === "leader")),
    [area],
  );
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        Esta área reúne {area.peopleCount} pessoa(s) distribuídas em {area.teams.length} equipe(s).
      </div>
      <Row label="Missão" value={area.mission ?? "—"} />
      <Row label="Objetivo" value={area.objective ?? "—"} />
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">KPIs</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {area.kpis.length ? (
            area.kpis.map((k) => (
              <span key={k} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                {k}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">Nenhum</span>
          )}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Líderes na área</div>
        <div className="mt-1 space-y-0.5">
          {leaders.length ? (
            leaders.map((l) => (
              <div key={l.id} className="text-sm">
                {l.name} <span className="text-xs text-muted-foreground">{l.roleTitle ?? ""}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">Nenhum líder vinculado</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ team }: { team: Team }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        Este time tem {team.members.length} pessoa(s). Clique em alguém abaixo para abrir o detalhe do liderado.
      </div>
      <Row label="Missão" value={team.mission ?? "—"} />
      <Row label="Objetivos" value={team.objectives ?? "—"} />
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Membros ({team.members.length})
        </div>
        <ul className="mt-2 space-y-1">
          {team.members.map((m) => (
            <li key={m.id}>
              <Link
                to="/app/team/$membershipId"
                params={{ membershipId: m.id }}
                className="flex items-center justify-between rounded-xl px-3 py-2 transition hover:bg-secondary"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate font-medium text-foreground">
                    {(team.leaderMembershipId === m.id || m.role === "leader") && (
                      <Crown className="h-3 w-3 text-primary" />
                    )}
                    {m.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.roleTitle ? `${m.roleTitle} · ` : ""}
                    {m.email}
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{m.role}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
