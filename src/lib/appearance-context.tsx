import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------
// Preferências de aparidade — tema claro/escuro e tamanho da fonte.
//
// A paleta `.dark` já existe completa em `src/styles.css`; este
// provider só cuida de aplicar/remover a classe `.dark` no <html>.
// A fonte é escalada via `fontSize` no <html>: como todo o layout
// usa unidades rem, um único valor na raiz escala a interface
// inteira sem tocar em componente nenhum.
// ---------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";
export type FontScale = "sm" | "md" | "lg" | "xl";

const THEME_KEY = "lider_core_theme";
const FONT_KEY = "lider_core_font_scale";

const FONT_SIZES: Record<FontScale, string> = {
  sm: "14px",
  md: "16px",
  lg: "17.5px",
  xl: "19px",
};

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  sm: "Pequena",
  md: "Padrão",
  lg: "Grande",
  xl: "Muito grande",
};

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Claro",
  dark: "Escuro",
  system: "Sistema",
};

export const THEME_LABEL_MAP = THEME_LABELS;

function readTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage indisponível (modo privado restrito) — segue o padrão
  }
  return "system";
}

function readFontScale(): FontScale {
  try {
    const raw = localStorage.getItem(FONT_KEY);
    if (raw === "sm" || raw === "md" || raw === "lg" || raw === "xl") return raw;
  } catch {
    // ignora leitura falha
  }
  return "md";
}

/** Resolve "system" contra a preferência do navegador. */
function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function resolveIsDark(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemPrefersDark();
}

type AppearanceState = {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  fontScale: FontScale;
  setFontScale: (s: FontScale) => void;
  /** Tema efetivo após resolver "system" — útil para ícones e previews. */
  isDark: boolean;
};

const AppearanceContext = createContext<AppearanceState | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readTheme);
  const [fontScale, setFontScaleState] = useState<FontScale>(readFontScale);
  const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark(readTheme()));

  useEffect(() => {
    const apply = () => {
      const dark = resolveIsDark(theme);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.fontSize = FONT_SIZES[fontScale];
      setIsDark(dark);
    };
    apply();
    try {
      localStorage.setItem(THEME_KEY, theme);
      localStorage.setItem(FONT_KEY, fontScale);
    } catch {
      // persistência é best-effort
    }
  }, [theme, fontScale]);

  // Em "system", acompanhar mudanças na preferência do navegador.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => setIsDark(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemePreference) => setThemeState(t), []);
  const setFontScale = useCallback((s: FontScale) => setFontScaleState(s), []);

  const value = useMemo<AppearanceState>(
    () => ({ theme, setTheme, fontScale, setFontScale, isDark }),
    [theme, fontScale, isDark, setTheme, setFontScale],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceState {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used inside AppearanceProvider");
  return ctx;
}
