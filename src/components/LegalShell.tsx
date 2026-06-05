import DownloadPdfButton from '@/components/DownloadPdfButton'

// Branded shell for the marketing /terms and /privacy pages. Self-contained
// (the marketing repo can't import DA Platform's auth shell), but mirrors its
// login-style animated gradient backdrop + navy topbar with the real logo, and
// floats the document on a wide white sheet. @media print strips everything but
// the sheet (with logo) so "Download PDF" yields a clean branded document.

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:wght@400;500;600&display=swap');

  :root {
    --da-ink: #0B1220;
    --da-ink-2: #11192B;
    --da-blue: #2B5BD7;
    --da-radius: 10px;
    --da-radius-lg: 16px;
    --da-text: #0B1220;
    --da-text-muted: #5A6478;
    --da-line: #E5E3DA;
  }

  .lp-page {
    position: fixed; inset: 0;
    display: grid; grid-template-rows: auto 1fr; overflow: auto;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: var(--da-text); background: #0B1220;
  }
  .lp-backdrop { position: absolute; inset: 0; overflow: hidden; background: #0B1220; }
  .lp-blob { position: absolute; border-radius: 50%; filter: blur(40px); }
  .lp-blob-a { width: 900px; height: 900px; left: -15%; top: -20%;
    background: radial-gradient(circle, rgba(43,91,215,.55), transparent 60%);
    animation: lpBlobA 22s ease-in-out infinite alternate; }
  .lp-blob-b { width: 800px; height: 800px; right: -15%; top: 20%;
    background: radial-gradient(circle, rgba(233,162,59,.45), transparent 60%);
    animation: lpBlobB 28s ease-in-out infinite alternate; }
  .lp-blob-c { width: 700px; height: 700px; left: 30%; bottom: -25%;
    background: radial-gradient(circle, rgba(110,68,200,.4), transparent 60%);
    animation: lpBlobC 25s ease-in-out infinite alternate; }

  .lp-topbar {
    position: relative; z-index: 2;
    display: flex; justify-content: space-between; align-items: center;
    padding: 24px 40px; color: #fff;
  }
  .lp-logo { text-decoration: none; display: inline-flex; align-items: center; }
  .lp-logo img { height: 36px; width: auto; display: block; }
  .lp-topbar-right a { color: rgba(255,255,255,.85); text-decoration: none; font-size: 13px; }
  .lp-topbar-right a:hover { color: #fff; }

  .lp-doc-wrap { position: relative; z-index: 2; display: grid; place-items: start center; padding: 24px 16px 72px; }
  .lp-doc {
    width: 100%; max-width: 820px; background: #fff;
    border: 1px solid rgba(255,255,255,0.4); border-radius: var(--da-radius-lg);
    padding: 48px 56px 44px;
    box-shadow: 0 40px 80px -20px rgba(0,0,0,.5), 0 8px 16px -8px rgba(0,0,0,.3);
    font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--da-text);
  }
  .lp-doc-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
  .lp-doc-back { font-size: 13.5px; color: var(--da-text-muted); text-decoration: none; }
  .lp-doc-back:hover { color: var(--da-text); }
  .lp-pdf-btn {
    display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 16px;
    font-family: inherit; font-size: 13.5px; font-weight: 600; color: #fff; background: var(--da-ink);
    border: none; border-radius: var(--da-radius); cursor: pointer; transition: background .15s;
  }
  .lp-pdf-btn:hover { background: var(--da-ink-2); }
  .lp-pdf-btn > svg { flex-shrink: 0; }
  .lp-print-logo { display: none; }

  .lp-doc h1 { font-family: 'Newsreader', Georgia, serif; font-size: 34px; font-weight: 600; letter-spacing: -0.02em; color: var(--da-ink); line-height: 1.2; margin: 0 0 14px; }
  .lp-doc h2 { font-size: 19px; font-weight: 600; color: var(--da-ink); margin: 34px 0 10px; letter-spacing: -0.01em; }
  .lp-doc p { font-size: 15px; line-height: 1.75; color: #2A3344; margin: 0 0 14px; }
  .lp-doc ul { margin: 0 0 16px; padding-left: 22px; }
  .lp-doc li { font-size: 15px; line-height: 1.7; color: #2A3344; margin-bottom: 8px; }
  .lp-doc strong { color: var(--da-ink); font-weight: 600; }
  .lp-doc-sep { border: none; border-top: 1px solid var(--da-line); margin: 36px 0 18px; }
  .lp-doc-footer { font-size: 13.5px; color: var(--da-text-muted); }
  .lp-doc-footer a { color: var(--da-blue); text-decoration: none; }
  .lp-doc-footer a:hover { text-decoration: underline; }

  @keyframes lpBlobA { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(80px,40px) scale(1.1); } }
  @keyframes lpBlobB { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-60px,-50px) scale(.9); } }
  @keyframes lpBlobC { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-40px,30px) scale(1.15); } }

  @media (max-width: 640px) {
    .lp-topbar { padding: 20px; }
    .lp-doc { padding: 32px 22px 28px; border-radius: 12px; }
    .lp-doc h1 { font-size: 27px; }
  }

  @media print {
    .lp-backdrop, .lp-topbar, .lp-doc-toolbar { display: none !important; }
    .lp-page { position: static; display: block; overflow: visible; background: #fff; }
    .lp-doc-wrap { padding: 0; display: block; }
    .lp-doc { max-width: none; border: none; border-radius: 0; box-shadow: none; padding: 0; }
    .lp-print-logo { display: block; height: 34px; margin: 0 0 24px; }
    .lp-doc h1, .lp-doc h2, .lp-doc strong { color: #000; }
    .lp-doc p, .lp-doc li { color: #111; }
  }
`

export default function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lp-page">
        <div className="lp-backdrop">
          <div className="lp-blob lp-blob-a" />
          <div className="lp-blob lp-blob-b" />
          <div className="lp-blob lp-blob-c" />
        </div>

        <header className="lp-topbar">
          <a href="/" className="lp-logo" aria-label="DealerAddendums home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/login-logo.svg" alt="DealerAddendums" />
          </a>
          <div className="lp-topbar-right">
            <a href="https://app.dealeraddendums.com">Sign in →</a>
          </div>
        </header>

        <main className="lp-doc-wrap">
          <article className="lp-doc">
            <div className="lp-doc-toolbar">
              <a href="/" className="lp-doc-back">← Back to home</a>
              <DownloadPdfButton />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="lp-print-logo" src="/images/login-logo.svg" alt={`DealerAddendums — ${title}`} />
            {children}
            <hr className="lp-doc-sep" />
            <p className="lp-doc-footer">
              <a href="/terms">Terms of Use</a>{'  ·  '}
              <a href="/privacy">Privacy Policy</a>{'  ·  '}
              <a href="/">Home</a>
            </p>
          </article>
        </main>
      </div>
    </>
  )
}
