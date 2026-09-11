import { useTheme } from "../lib/ui/theme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      aria-label="切换主题"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
