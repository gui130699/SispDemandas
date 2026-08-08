import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setDeferred(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  async function install() {
    if (deferred) { await deferred.prompt(); const result = await deferred.userChoice; setMessage(result.outcome === "accepted" ? "Aplicativo instalado." : "Instalação cancelada."); setDeferred(null); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const mac = /macintosh/i.test(navigator.userAgent);
    setMessage(ios ? "No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”." : mac ? "No Safari, use Arquivo > Adicionar ao Dock. No Chrome/Edge, use o menu Instalar aplicativo." : "Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.");
  }
  return <span className="install-wrap"><button type="button" className="install-app" onClick={install}>Instalar app</button>{message && <span className="install-tip" role="status">{message}</span>}</span>;
}
