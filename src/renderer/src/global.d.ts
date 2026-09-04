import type { DuckyApi } from '../../preload/index'

declare global {
  interface Window {
    ducky: DuckyApi
  }
}
