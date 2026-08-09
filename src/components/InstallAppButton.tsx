import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type NavigatorStandalone = Navigator & { standalone?: boolean };

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installed, setInstalled] = useState(() => matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorStandalone).standalone));

  useEffect(() => {
    const capturePrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallEvent); };
    const confirmInstall = () => { setInstalled(true); setPromptEvent(null); setHelpOpen(false); };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", confirmInstall);
    return () => { window.removeEventListener("beforeinstallprompt", capturePrompt); window.removeEventListener("appinstalled", confirmInstall); };
  }, []);

  async function install() {
    if (installed) return;
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    setHelpOpen(true);
  }

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const macSafari = /macintosh/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/chrome|crios|edg/i.test(navigator.userAgent);
  return <>
    <button type="button" className="install-app" onClick={install} disabled={installed}>{installed ? "App instalado" : "Instalar app"}</button>
    {helpOpen && <div className="install-modal-backdrop" onMouseDown={() => setHelpOpen(false)}>
      <section className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="install-modal-header"><img src={`${import.meta.env.BASE_URL}branding/icon-192.png`} alt=""/><div><h2 id="install-title">Instalar SISPDEMANDAS</h2><p>Use o comando de instalação do seu sistema.</p></div><button type="button" aria-label="Fechar" onClick={() => setHelpOpen(false)}>×</button></div>
        {ios ? <ol><li>Abra esta página no Safari.</li><li>Toque no botão <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li></ol> : macSafari ? <ol><li>No Safari, abra o menu <strong>Arquivo</strong>.</li><li>Escolha <strong>Adicionar ao Dock</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol> : <ol><li>Abra o menu do Chrome ou Edge.</li><li>Escolha <strong>Instalar SISPDEMANDAS</strong> ou <strong>Aplicativos → Instalar este site como aplicativo</strong>.</li><li>Confirme a instalação.</li></ol>}
        <p className="muted">O iOS e o Safari não permitem abrir a confirmação nativa por código. Nesses sistemas, estes passos são exigidos pela própria plataforma.</p>
        <button type="button" className="primary" onClick={() => setHelpOpen(false)}>Entendi</button>
      </section>
    </div>}
  </>;
}
