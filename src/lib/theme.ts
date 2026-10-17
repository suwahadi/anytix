export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "theme";

export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}

/** Runs in <head> before paint so the stored or system theme applies without a flash. */
export const THEME_SCRIPT = `(function(){
  var stored = null;
  try { stored = localStorage.getItem("${THEME_STORAGE_KEY}"); } catch (e) {}
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var choice = stored === "light" || stored === "dark" ? stored : (media.matches ? "dark" : "light");
    document.documentElement.dataset.theme = choice;
  }
  apply();
  media.addEventListener("change", function () {
    try { stored = localStorage.getItem("${THEME_STORAGE_KEY}"); } catch (e) {}
    apply();
  });
})();`;
