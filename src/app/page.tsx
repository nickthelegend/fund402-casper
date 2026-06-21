export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-sm font-mono text-emerald-400">Casper · x402 · Odra</p>
      <h1 className="text-5xl font-bold tracking-tight">Fund402</h1>
      <p className="mt-4 text-xl text-zinc-300">Credit for the machine economy.</p>
      <p className="mt-6 max-w-prose text-zinc-400">
        When an AI agent hits an HTTP <span className="font-mono text-zinc-200">402 Payment
        Required</span> paywall with an empty wallet, the Fund402 gateway issues a Just-In-Time
        credit line, fronts the CEP-18 micropayment through an Odra vault, and settles it on
        Casper via the x402 facilitator — autonomously, in under human-perception time.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ["Gateway", "x402 challenge → verify → settle → proxy"],
          ["Odra Vault", "CEP-18 liquidity pool + tiered credit"],
          ["Agent SDK", "drop-in axios interceptor for any agent"],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="font-semibold text-zinc-100">{t}</div>
            <div className="mt-1 text-sm text-zinc-400">{d}</div>
          </div>
        ))}
      </div>

      <pre className="mt-10 overflow-x-auto rounded-xl border border-zinc-800 bg-black/50 p-4 text-sm text-emerald-300">
{`GET /v/<vault_id>/market/casper/stats
  ← 402 Payment Required  (payment-required: <base64>)
  → PAYMENT-SIGNATURE: <base64 x402 payload>
  ← 200 OK  (payment-response: settled deploy hash)`}
      </pre>

      <footer className="mt-16 text-sm text-zinc-500">
        Gateway on <span className="font-mono">:3005</span> · Dashboard <span className="font-mono">:3007</span> · Demo <span className="font-mono">:3006</span>
      </footer>
    </main>
  );
}
