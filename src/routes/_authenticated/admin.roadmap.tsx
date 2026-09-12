import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Plus, Trash2, Save, Loader2, Users, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/roadmap")({
  component: RoadmapPage,
});

function RoadmapPage() {
  return (
    <>
      <AdminPageHeader
        title="Changelog & Roadmap"
        description="O que foi corrigido, implementado ou modificado; documentação técnica, processos e roadmap; capacidade atual da plataforma."
      />
      <Tabs defaultValue="changelog">
        <TabsList>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
          <TabsTrigger value="technical">Documentação técnica</TabsTrigger>
          <TabsTrigger value="processes">Processos</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="capacity">Capacidade</TabsTrigger>
        </TabsList>
        <TabsContent value="changelog" className="mt-4">
          <ChangelogTab />
        </TabsContent>
        <TabsContent value="technical" className="mt-4">
          <DocTab
            slug="technical"
            title="Documentação técnica"
            placeholder="Arquitetura, stack, integrações, como rodar localmente..."
          />
        </TabsContent>
        <TabsContent value="processes" className="mt-4">
          <DocTab
            slug="processes"
            title="Processos"
            placeholder="Como pedir uma mudança, fluxo de deploy, quem aprova o quê..."
          />
        </TabsContent>
        <TabsContent value="roadmap" className="mt-4">
          <DocTab
            slug="roadmap"
            title="Roadmap"
            placeholder="Próximas entregas, por prioridade e prazo estimado..."
          />
        </TabsContent>
        <TabsContent value="capacity" className="mt-4">
          <CapacityTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------------------- Changelog ----------------------

type ChangelogType = "fix" | "feature" | "change";
type ChangelogEntry = {
  id: string;
  type: ChangelogType;
  title: string;
  description: string | null;
  publishedAt: string;
};

const TYPE_META: Record<ChangelogType, { label: string; cls: string }> = {
  fix: {
    label: "Corrigido",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  feature: {
    label: "Implementado",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  change: {
    label: "Modificado",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
};

function ChangelogTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ChangelogType>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const list = useQuery({
    queryKey: ["admin", "changelog"],
    queryFn: () => api<ChangelogEntry[]>("/admin/changelog"),
  });

  const create = useMutation({
    mutationFn: () =>
      api("/admin/changelog", {
        method: "POST",
        body: { type, title, description: description || null },
      }),
    onSuccess: () => {
      toast.success("Entrada registrada.");
      setOpen(false);
      setTitle("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["admin", "changelog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/changelog/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "changelog"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova entrada
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova entrada no changelog</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as ChangelogType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fix">Corrigido</SelectItem>
                    <SelectItem value="feature">Implementado</SelectItem>
                    <SelectItem value="change">Modificado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Título</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Reorganização dos módulos C.O.R.E."
                />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={!title || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {list.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (list.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma entrada registrada ainda.
        </div>
      ) : (
        <ul className="space-y-2">
          {(list.data ?? []).map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TYPE_META[e.type].cls}`}
                    >
                      {TYPE_META[e.type].label}
                    </span>
                    <span className="font-medium">{e.title}</span>
                  </div>
                  {e.description && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                      {e.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.publishedAt).toLocaleDateString("pt-BR")}
                  </span>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------- Documentação técnica / Processos / Roadmap ----------------------

type PlatformDoc = { slug: string; title: string; contentMarkdown: string | null };

function DocTab({
  slug,
  title: defaultTitle,
  placeholder,
}: {
  slug: string;
  title: string;
  placeholder: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState("");

  const q = useQuery({
    queryKey: ["admin", "docs", slug],
    queryFn: () => api<PlatformDoc>(`/admin/docs/${slug}`),
  });

  const startEdit = () => {
    setTitle(q.data?.title || defaultTitle);
    setContent(q.data?.contentMarkdown ?? "");
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api(`/admin/docs/${slug}`, {
        method: "PUT",
        body: { title, contentMarkdown: content || null },
      }),
    onSuccess: () => {
      toast.success("Documento salvo.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin", "docs", slug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const doc = q.data;
  const hasContent = !!doc?.contentMarkdown?.trim();

  if (editing) {
    return (
      <div className="space-y-3">
        <div>
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Conteúdo (markdown)</Label>
          <Textarea
            rows={16}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}{" "}
            Salvar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={startEdit}>
          Editar
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        {!hasContent ? (
          <div className="text-center text-sm text-muted-foreground">
            Nada escrito ainda. Clique em "Editar" para começar.
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{doc?.contentMarkdown ?? ""}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------- Capacidade ----------------------

type Capacity = {
  uniqueUsers: number;
  organizations: number;
  activeOrganizations: number;
  capacityLimit: number;
};

function CapacityTab() {
  const q = useQuery({
    queryKey: ["admin", "capacity"],
    queryFn: () => api<Capacity>("/admin/capacity"),
  });
  const c = q.data;
  const pct = c ? Math.min(100, Math.round((c.uniqueUsers / c.capacityLimit) * 100)) : 0;

  return (
    <div className="space-y-4">
      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : c ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Usuários únicos
              </div>
              <div className="mt-1 font-display text-3xl">{c.uniqueUsers}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                de ~{c.capacityLimit} (capacidade atual)
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Organizações
              </div>
              <div className="mt-1 font-display text-3xl">{c.organizations}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.activeOrganizations} ativa(s)
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Uso da capacidade
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{pct}% da capacidade atual</div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200/60 bg-amber-500/5 p-4 text-xs text-amber-800 dark:border-amber-500/25 dark:text-amber-300">
            Orçamento de infraestrutura para crescer acima dessa capacidade é uma decisão de negócio
            (plano/servidor no provedor de hospedagem) — não é algo que dá pra estimar em código.
            Use o campo abaixo para registrar notas e decisões conforme forem definidas com o time.
          </div>
          <DocTab
            slug="infra-budget"
            title="Notas de orçamento de infraestrutura"
            placeholder="Provedor, plano atual, custo estimado de upgrade, quem aprova..."
          />
        </>
      ) : null}
    </div>
  );
}
