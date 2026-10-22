import { useCallback, useRef, useState } from "react";
import { UploadCloud, X, Loader2, Image as ImageIcon } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  accept?: string;
  className?: string;
};

export function ImageUploader({
  value,
  onChange,
  label,
  hint,
  accept = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/x-icon,image/vnd.microsoft.icon",
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Arquivo maior que 5MB.");
        return;
      }
      setUploading(true);
      try {
        const res = await uploadFile<{ url: string }>("/admin/uploads", file);
        onChange(res.url);
        toast.success("Arquivo enviado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha no upload");
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Remover
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
          dragging
            ? "border-accent bg-accent/5"
            : "border-border hover:border-muted-foreground/40 hover:bg-secondary/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Enviando...
          </div>
        ) : value ? (
          <div className="flex w-full flex-col items-center gap-2">
            <img
              src={value}
              alt={label}
              className="max-h-24 max-w-full rounded-md bg-white/40 object-contain p-2"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              <span className="max-w-[280px] truncate">{value}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Clique ou solte outro arquivo para substituir
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <UploadCloud className="h-8 w-8" strokeWidth={1.5} />
            <div className="font-medium text-foreground">Arraste um arquivo ou clique</div>
            {hint && <div className="text-xs">{hint}</div>}
            <div className="text-[11px]">PNG, JPG, WEBP, SVG ou ICO — até 5MB</div>
          </div>
        )}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ou cole uma URL https://..."
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}