import type { BattleBuddyApi } from './index'

declare global {
  interface Window {
    battleBuddy: BattleBuddyApi
  }
}

export {}
