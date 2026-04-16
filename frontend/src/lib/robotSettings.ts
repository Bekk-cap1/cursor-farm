/** Локально: не показывать виджет чиби/робота на страницах приложения. */
export const ROBOT_DISABLED_STORAGE_KEY = 'farm_ai_robot_disabled'

export function readRobotDisabled(): boolean {
  try {
    return localStorage.getItem(ROBOT_DISABLED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRobotDisabled(disabled: boolean): void {
  try {
    if (disabled) localStorage.setItem(ROBOT_DISABLED_STORAGE_KEY, '1')
    else localStorage.removeItem(ROBOT_DISABLED_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('farm-robot-setting-changed'))
}
