'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

type DeveloperZapButtonProps = {
  lightningAddress?: string
}

type LnurlPayResponse = {
  callback: string
  maxSendable: number
  minSendable: number
  metadata: string
  commentAllowed?: number
}

type LnurlInvoiceResponse = {
  pr?: string
  reason?: string
  status?: string
}

const DEFAULT_AMOUNTS = [1000, 5000, 21000]
const REQUEST_TIMEOUT_MS = 12000

function parseLightningAddress(address: string) {
  const normalized = address.trim().toLowerCase()
  const [name, domain, ...rest] = normalized.split('@')
  if (!name || !domain || rest.length > 0) {
    throw new Error('La Lightning Address no tiene formato usuario@dominio.')
  }
  return {
    name,
    domain,
    lnurlpUrl: `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`,
  }
}

function assertLnurlPayResponse(value: unknown): asserts value is LnurlPayResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('El servidor LNURL no devolvio una respuesta valida.')
  }

  const candidate = value as Partial<LnurlPayResponse>
  if (
    typeof candidate.callback !== 'string' ||
    typeof candidate.maxSendable !== 'number' ||
    typeof candidate.minSendable !== 'number' ||
    typeof candidate.metadata !== 'string'
  ) {
    throw new Error('La Lightning Address no expone un endpoint LNURL-pay completo.')
  }

  if (!candidate.callback.startsWith('https://')) {
    throw new Error('Por seguridad, el callback LNURL-pay debe usar HTTPS.')
  }
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`El servidor respondio ${response.status}.`)
    }
    return (await response.json()) as T
  } finally {
    window.clearTimeout(timeout)
  }
}

function clampAmount(amountSats: number, lnurl: LnurlPayResponse) {
  const minSats = Math.ceil(lnurl.minSendable / 1000)
  const maxSats = Math.floor(lnurl.maxSendable / 1000)
  return Math.min(Math.max(amountSats, minSats), maxSats)
}

function buildInvoiceUrl(lnurl: LnurlPayResponse, amountSats: number, comment: string) {
  const url = new URL(lnurl.callback)
  url.searchParams.set('amount', String(amountSats * 1000))
  const allowedCommentLength = lnurl.commentAllowed ?? 0
  if (allowedCommentLength > 0 && comment.trim()) {
    url.searchParams.set('comment', comment.trim().slice(0, allowedCommentLength))
  }
  return url.toString()
}

export default function DeveloperZapButton({ lightningAddress }: DeveloperZapButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [amountSats, setAmountSats] = useState(DEFAULT_AMOUNTS[0])
  const [comment, setComment] = useState('Gracias por construir Nostr Espacial.')
  const [invoice, setInvoice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'invoice' | 'paid'>('idle')
  const [hasWebln, setHasWebln] = useState(false)
  const [copied, setCopied] = useState(false)

  const normalizedAddress = lightningAddress?.trim()

  const commentLimit = useMemo(() => Math.max(0, 140), [])

  const openModal = useCallback(() => {
    setIsOpen(true)
    setInvoice('')
    setStatus('idle')
    setError(null)
    setCopied(false)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    setHasWebln(Boolean(window.webln))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeModal, isOpen])

  const createInvoice = useCallback(
    async (payWithWebln: boolean) => {
      if (!normalizedAddress) return

      setStatus('loading')
      setError(null)
      setCopied(false)
      let receivedInvoice = ''

      try {
        const { lnurlpUrl } = parseLightningAddress(normalizedAddress)
        const lnurl = await fetchJsonWithTimeout<unknown>(lnurlpUrl)
        assertLnurlPayResponse(lnurl)

        const safeAmount = clampAmount(amountSats, lnurl)
        if (safeAmount !== amountSats) {
          setAmountSats(safeAmount)
        }

        const invoiceUrl = buildInvoiceUrl(lnurl, safeAmount, comment)
        const invoiceResponse = await fetchJsonWithTimeout<LnurlInvoiceResponse>(invoiceUrl)

        if (invoiceResponse.status === 'ERROR') {
          throw new Error(invoiceResponse.reason ?? 'No se pudo crear la factura Lightning.')
        }
        if (!invoiceResponse.pr) {
          throw new Error('El servidor LNURL no devolvio una factura BOLT11.')
        }

        receivedInvoice = invoiceResponse.pr
        setInvoice(receivedInvoice)
        setStatus('invoice')

        if (payWithWebln) {
          if (!window.webln) {
            throw new Error('No se detecto WebLN en este navegador.')
          }
          await window.webln.enable()
          await window.webln.sendPayment(receivedInvoice)
          setStatus('paid')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo preparar el zap.')
        setStatus(receivedInvoice ? 'invoice' : 'idle')
      }
    },
    [amountSats, comment, normalizedAddress],
  )

  const copyInvoice = useCallback(async () => {
    if (!invoice) return
    try {
      await navigator.clipboard.writeText(invoice)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('No se pudo copiar la factura desde el navegador.')
    }
  }, [invoice])

  if (!normalizedAddress) {
    return null
  }

  return (
    <>
      <button
        className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#ff4b5d]/40 bg-[#ff4b5d]/10 px-5 text-base font-bold text-[#f6f1e8] transition hover:border-[#ff7b88]/70 hover:bg-[#ff4b5d]/18 hover:text-[#ff9aa4] focus:outline-none focus:ring-2 focus:ring-[#ff9aa4] focus:ring-offset-2 focus:ring-offset-[#060606]"
        onClick={openModal}
        type="button"
      >
        <span className="text-[#ff6675] transition group-hover:scale-110">zap</span>
        Zapea al desarrollador
      </button>

      {isOpen ? (
        <div
          aria-labelledby="developer-zap-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/76 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[1.35rem] border border-[#ffffff18] bg-[#0a0a0a] shadow-[0_34px_120px_rgba(0,0,0,0.58)]">
            <div className="border-b border-[#ffffff12] px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-[#ff6675]">
                    Lightning
                  </p>
                  <h2
                    className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#f6f1e8]"
                    id="developer-zap-title"
                  >
                    Zapea al desarrollador
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#ada59b]">
                    Envia sats a {normalizedAddress} para apoyar el desarrollo del explorador.
                  </p>
                </div>
                <button
                  aria-label="Cerrar modal de zap"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ffffff14] text-[#b8b0a6] transition hover:border-[#ff7b88]/50 hover:text-[#ff9aa4]"
                  onClick={closeModal}
                  type="button"
                >
                  x
                </button>
              </div>
            </div>

            <div className="max-h-[min(76dvh,42rem)] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-3 gap-2">
                {DEFAULT_AMOUNTS.map((amount) => (
                  <button
                    className={`min-h-14 rounded-full border px-2 py-2 text-[0.82rem] font-bold transition sm:px-3 sm:text-sm ${
                      amountSats === amount
                        ? 'border-[#ff6675] bg-[#ff4b5d] text-[#080808]'
                        : 'border-[#ffffff18] bg-[#ffffff08] text-[#f6f1e8] hover:border-[#ff6675]/60'
                    }`}
                    key={amount}
                    onClick={() => setAmountSats(amount)}
                    type="button"
                  >
                    <span className="whitespace-nowrap">
                      {amount.toLocaleString('es-AR')} sats
                    </span>
                  </button>
                ))}
              </div>

              <label className="mt-5 block text-sm font-semibold text-[#f6f1e8]" htmlFor="zap-amount">
                Monto personalizado
              </label>
              <div className="mt-2 flex items-center rounded-2xl border border-[#ffffff18] bg-[#ffffff08] px-3">
                <input
                  className="min-w-0 flex-1 bg-transparent py-3 text-base font-bold text-[#f6f1e8] outline-none"
                  id="zap-amount"
                  min={1}
                  onChange={(event) => setAmountSats(Number(event.target.value) || 1)}
                  type="number"
                  value={amountSats}
                />
                <span className="text-sm font-semibold text-[#8f877f]">sats</span>
              </div>

              <label className="mt-5 block text-sm font-semibold text-[#f6f1e8]" htmlFor="zap-comment">
                Mensaje
              </label>
              <textarea
                className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-[#ffffff18] bg-[#ffffff08] p-3 text-sm leading-6 text-[#f6f1e8] outline-none transition placeholder:text-[#6f6861] focus:border-[#ff6675]/60"
                id="zap-comment"
                maxLength={commentLimit}
                onChange={(event) => setComment(event.target.value)}
                value={comment}
              />
              <p className="mt-2 text-xs text-[#8f877f]">
                {comment.length}/{commentLimit} caracteres
              </p>

              {error ? (
                <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm leading-6 text-red-200">
                  {error}
                </div>
              ) : null}

              {status === 'paid' ? (
                <div className="mt-5 rounded-2xl border border-[#ff6675]/25 bg-[#ff4b5d]/10 p-4 text-sm leading-6 text-[#f6f1e8]">
                  Pago enviado por WebLN. Gracias por apoyar el desarrollo.
                </div>
              ) : null}

              {invoice ? (
                <div className="mt-5 rounded-[1.2rem] border border-[#ffffff14] bg-[#050505] p-4">
                  <div className="mx-auto flex w-fit rounded-2xl bg-white p-3">
                    <QRCodeSVG
                      bgColor="#ffffff"
                      fgColor="#0a0a0a"
                      level="M"
                      size={190}
                      value={`lightning:${invoice}`}
                    />
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <a
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#ff4b5d] px-4 text-sm font-bold text-[#080808] transition hover:bg-[#ff6a78]"
                      href={`lightning:${invoice}`}
                    >
                      Abrir wallet
                    </a>
                    <button
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#ffffff18] px-4 text-sm font-bold text-[#f6f1e8] transition hover:border-[#ff6675]/60"
                      onClick={copyInvoice}
                      type="button"
                    >
                      {copied ? 'Copiada' : 'Copiar factura'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {hasWebln ? (
                  <button
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#ff4b5d] px-5 text-base font-bold text-[#080808] transition hover:bg-[#ff6a78] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={status === 'loading'}
                    onClick={() => void createInvoice(true)}
                    type="button"
                  >
                    {status === 'loading' ? 'Preparando...' : 'Pagar con WebLN'}
                  </button>
                ) : null}
                <button
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-[#ff4b5d]/40 bg-[#ff4b5d]/10 px-5 text-base font-bold text-[#f6f1e8] transition hover:border-[#ff7b88]/70 hover:bg-[#ff4b5d]/18 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={status === 'loading'}
                  onClick={() => void createInvoice(false)}
                  type="button"
                >
                  {status === 'loading' ? 'Preparando...' : 'Generar QR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
