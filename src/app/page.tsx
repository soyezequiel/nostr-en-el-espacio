import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-lc-black pt-24 text-lc-white">
      <section className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-lc-green">
          La Crypta Identity
        </p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Explorá identidad Nostr desde Sigma.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-lc-muted sm:text-lg">
          Cargá un npub o nprofile, consultá relays y proyectá el vecindario
          social sin el grafo legacy.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link className="lc-pill lc-pill-primary justify-center" href="/labs/sigma">
            Abrir Sigma
          </Link>
          <Link className="lc-pill justify-center" href="/profile">
            Ver perfil
          </Link>
          <Link className="lc-pill justify-center" href="/badges">
            Ver badges
          </Link>
        </div>
      </section>
    </main>
  )
}
