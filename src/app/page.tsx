import '@/features/graph/graph.css';
import Link from 'next/link';

import GraphClient from '@/features/graph/GraphClient';

export default function Home() {
  const showDevLabLink = process.env.NODE_ENV === 'development';

  return (
    <>
      <GraphClient />
      {showDevLabLink ? (
        <Link
          className="fixed bottom-4 right-4 z-[1000] rounded-xl border border-white/15 bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-2xl shadow-black/40 backdrop-blur transition hover:border-[#7dd3a7]/60 hover:text-[#7dd3a7]"
          href="/labs/sigma?testMode=1&fixture=drag-local"
        >
          Abrir Sigma Lab
        </Link>
      ) : null}
    </>
  );
}
