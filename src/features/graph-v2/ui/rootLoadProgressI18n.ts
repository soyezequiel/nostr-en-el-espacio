export interface RootLoadProgressCopy {
  locale: string
  defaultIdentity: string
  title: (identity: string) => string
  measuringLinks: string
  nodesSuffix: string
  linksSuffix: string
  complete: string
  noLiveData: string
  loadingGraph: string
  noRelay: string
  metrics: {
    nodes: string
    follows: string
    followers: string
    events: string
    lastRelay: string
    source: string
  }
  cacheSourceValue: string
  steps: Array<{
    id: string
    label: string
    floor: number
  }>
}

export function buildRootLoadProgressCopy({
  locale,
  t,
}: {
  locale: string
  t: (key: string, values?: Record<string, unknown>) => string
}): RootLoadProgressCopy {
  return {
    locale,
    defaultIdentity: t('progress.defaultIdentity'),
    title: (identity) => t('progress.title', { identity }),
    measuringLinks: t('progress.measuringLinks'),
    nodesSuffix: t('progress.nodesSuffix'),
    linksSuffix: t('progress.linksSuffix'),
    complete: t('progress.complete'),
    noLiveData: t('progress.noLiveData'),
    loadingGraph: t('progress.loadingGraph'),
    noRelay: t('progress.noRelay'),
    metrics: {
      nodes: t('progress.metrics.nodes'),
      follows: t('progress.metrics.follows'),
      followers: t('progress.metrics.followers'),
      events: t('progress.metrics.events'),
      lastRelay: t('progress.metrics.lastRelay'),
      source: t('progress.metrics.source'),
    },
    cacheSourceValue: t('progress.cacheSourceValue'),
    steps: [
      { id: 'identity', label: t('progress.steps.identity'), floor: 6 },
      { id: 'cache', label: t('progress.steps.cache'), floor: 12 },
      { id: 'relays', label: t('progress.steps.relays'), floor: 24 },
      { id: 'discovery', label: t('progress.steps.discovery'), floor: 42 },
      { id: 'pagination', label: t('progress.steps.pagination'), floor: 62 },
      { id: 'parse', label: t('progress.steps.parse'), floor: 74 },
      { id: 'merge', label: t('progress.steps.merge'), floor: 86 },
      { id: 'enrich', label: t('progress.steps.enrich'), floor: 92 },
    ],
  }
}
