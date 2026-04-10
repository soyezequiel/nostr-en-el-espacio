import type { NodeExpansionState } from '@/features/graph/app/store/types'

interface NodeExpansionProgressCardProps {
  className?: string
  nodeLabel?: string | null
  state: NodeExpansionState
  title?: string
  variant?: 'panel' | 'overlay'
}

const joinClassNames = (...classNames: Array<string | false | null | undefined>) =>
  classNames.filter(Boolean).join(' ')

const formatPhaseLabel = (phase: NodeExpansionState['phase']) => {
  switch (phase) {
    case 'preparing':
      return 'preparando'
    case 'fetching-structure':
      return 'consultando relays'
    case 'correlating-followers':
      return 'correlacionando evidencia'
    case 'merging':
      return 'actualizando grafo'
    case 'idle':
      return 'esperando'
  }
}

export function NodeExpansionProgressCard({
  className,
  nodeLabel = null,
  state,
  title = 'Expansion en curso',
  variant = 'panel',
}: NodeExpansionProgressCardProps) {
  const progressStep = state.step ?? 0
  const progressTotalSteps = state.totalSteps ?? 0
  const hasProgress = progressStep > 0 && progressTotalSteps > 0
  const progressWidth = hasProgress
    ? `${Math.max(0, Math.min(100, (progressStep / progressTotalSteps) * 100))}%`
    : null

  return (
    <section
      aria-busy={state.status === 'loading'}
      className={joinClassNames(
        'node-expansion-progress',
        `node-expansion-progress--${variant}`,
        className,
      )}
    >
      <div className="node-expansion-progress__header">
        <div className="node-expansion-progress__title-row">
          <span aria-hidden="true" className="node-expansion-progress__spinner" />
          <div className="node-expansion-progress__heading">
            <p className="node-expansion-progress__eyebrow">{title}</p>
            {nodeLabel ? (
              <h3 className="node-expansion-progress__node">{nodeLabel}</h3>
            ) : null}
          </div>
        </div>

        {hasProgress ? (
          <span className="node-expansion-progress__step">
            Paso {progressStep} de {progressTotalSteps}
          </span>
        ) : null}
      </div>

      <p
        aria-live="polite"
        className="node-expansion-progress__message"
        role="status"
      >
        {state.message ?? 'Procesando evidencia estructural...'}
      </p>

      {hasProgress && progressWidth ? (
        <div
          aria-hidden="true"
          className="node-expansion-progress__meter"
        >
          <span
            className="node-expansion-progress__meter-fill"
            style={{ width: progressWidth }}
          />
        </div>
      ) : null}

      {hasProgress ? (
        <div className="node-expansion-progress__meta">
          <span>Trabajando</span>
          {hasProgress ? <span>{formatPhaseLabel(state.phase)}</span> : null}
        </div>
      ) : null}
    </section>
  )
}
