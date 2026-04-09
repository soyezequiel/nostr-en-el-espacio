import { useStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import { createAnalysisSlice } from '@/features/graph/app/store/slices/analysisSlice'
import { createExportSlice } from '@/features/graph/app/store/slices/exportSlice'
import { createGraphSlice } from '@/features/graph/app/store/slices/graphSlice'
import { createKeywordSlice } from '@/features/graph/app/store/slices/keywordSlice'
import { createRelaySlice } from '@/features/graph/app/store/slices/relaySlice'
import { createUiSlice } from '@/features/graph/app/store/slices/uiSlice'
import { createZapSlice } from '@/features/graph/app/store/slices/zapSlice'
import type {
  AppStore,
  AppStoreApi,
  SavedRootEntry,
} from '@/features/graph/app/store/types'

export const createAppStore = (): AppStoreApi =>
  createStore<AppStore>()(
    persist(
      (...args) => ({
        ...createGraphSlice(...args),
        ...createAnalysisSlice(...args),
        ...createZapSlice(...args),
        ...createKeywordSlice(...args),
        ...createRelaySlice(...args),
        ...createUiSlice(...args),
        ...createExportSlice(...args),
      }),
      {
        name: 'nostr-graph-saved-roots',
        storage: createJSONStorage(() => localStorage),
        partialize: (state): { savedRoots: SavedRootEntry[] } => ({
          savedRoots: state.savedRoots,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setSavedRootsHydrated(true)
        },
      },
    ),
  )

export const appStore = createAppStore()

export const useAppStore = <T>(selector: (state: AppStore) => T) =>
  useStore(appStore, selector)
