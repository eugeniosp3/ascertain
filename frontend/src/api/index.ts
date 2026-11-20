import { createHttpApi } from './client'
import { createMockApi } from './mock-api'
import type { DashboardApi } from './types'

// API mode selection: choose the in-memory demo or HTTP adapter explicitly at startup.
// HTTP failures stay visible; they never silently switch the application to demo data.
const configuredMode = import.meta.env.VITE_DATA_MODE
if (configuredMode !== undefined && configuredMode !== 'demo' && configuredMode !== 'api') {
  throw new Error('VITE_DATA_MODE must be demo or api.')
}

export const dataMode: 'demo' | 'api' = configuredMode ?? 'demo'
export const api: DashboardApi =
  dataMode === 'api' ? createHttpApi(import.meta.env.VITE_API_BASE ?? '/api') : createMockApi()

export type * from './types'
export { ApiError, isApiError } from './client'
