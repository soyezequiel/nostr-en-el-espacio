import type { RootLoadState } from '@/features/graph-runtime/app/store/types'
import { isRootLoadProgressActive } from '@/features/graph-v2/ui/rootLoadProgressViewModel'

export interface RootLoadChromeVisibilityInput {
  hasRoot: boolean
  isRootLoadScreenOpen: boolean
  isRootSheetOpen: boolean
  rootLoad: RootLoadState
  rootPubkey: string | null
  sceneNodeCount: number
  rootLoadHudEnabled: boolean
}

export interface RootLoadChromeVisibilityResult {
  showOverlay: boolean
  showHud: boolean
}

export function getRootLoadChromeVisibility({
  hasRoot,
  isRootLoadScreenOpen,
  isRootSheetOpen,
  rootLoad,
  rootPubkey,
  sceneNodeCount,
  rootLoadHudEnabled,
}: RootLoadChromeVisibilityInput): RootLoadChromeVisibilityResult {
  const isGraphLoading =
    !isRootSheetOpen &&
    (isRootLoadScreenOpen ||
      (rootPubkey !== null &&
        rootLoad.status === 'loading' &&
        sceneNodeCount < 3))

  const showOverlay = isGraphLoading
  const showHud =
    rootLoadHudEnabled &&
    !isGraphLoading &&
    !isRootSheetOpen &&
    hasRoot &&
    rootLoad.visibleLinkProgress !== null &&
    isRootLoadProgressActive(rootLoad)

  return {
    showOverlay,
    showHud,
  }
}
