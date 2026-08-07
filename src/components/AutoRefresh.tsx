import { useEffect } from "react";

const intervalMs = 60_000;

function deployedScriptUrl(html: string) {
  const match = html.match(/<script[^>]+src="([^"]*\/assets\/[^"?]+\.js)"/);
  return match?.[1] ?? null;
}

export function AutoRefresh() {
  useEffect(() => {
    let refreshing = false;

    const checkForUpdate = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      try {
        const response = await fetch(import.meta.env.BASE_URL, {
          cache: "no-store",
        });
        const deployed = deployedScriptUrl(await response.text());
        const current = document
          .querySelector('script[type="module"]')
          ?.getAttribute("src");
        if (deployed && current && !current.endsWith(deployed)) {
          refreshing = true;
          window.location.reload();
        }
      } catch {
        // A próxima verificação será feita quando a conexão voltar.
      }
    };

    const timer = window.setInterval(checkForUpdate, intervalMs);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);
  return null;
}
