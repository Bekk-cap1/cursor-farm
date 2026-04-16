export type ChibiWidgetLang = 'ru' | 'en'

/** Итоговый масштаб модели после входа (нижний правый «док» — мельче, чтобы не заслонять UI). */
export const CHIBI_ROOT_DISPLAY_SCALE = 0.42

/** Зона канвы: фиксированный блок внизу справа (не на весь экран). */
export const CHIBI_CANVAS_MAX_WIDTH_PX = 520
export const CHIBI_CANVAS_MAX_HEIGHT_VH = 40
export const CHIBI_CANVAS_MAX_HEIGHT_PX = 380

/** Холст не доходит до самого низа окна — иначе ноги у края визуально «теряются». */
export const CHIBI_CANVAS_BOTTOM_INSET_PX = 0

/**
 * Мировая Y корня, когда персонаж «стоит на полу» (y=0).
 * Геометрия чиби: подошвы ниже origin корня (~−0.25); без смещения ноги клипятся снизу кадра.
 */
export const CHIBI_ROOT_FLOOR_Y = 0.26

/**
 * Доп. множитель по глубине: в ближайшей к камере точке зоны ходьбы — крупнее,
 * в дальней — мельче (лёгкий «параллакс» без смены камеры).
 */
export const CHIBI_DEPTH_SCALE_AT_CLOSE = 1.08
export const CHIBI_DEPTH_SCALE_AT_FAR = 0.94

export type ChibiWidgetConfig = {
  /** Цвет одежды (рубашка / акцент), hex */
  outfit: string
  /** Тон кожи, hex */
  skin: string
  /** Lerp по X, 0.04–0.06 по ТЗ */
  speed: number
  zIndex: number
  lang: ChibiWidgetLang
  onOpenAgent?: () => void
}

export const defaultChibiConfig: ChibiWidgetConfig = {
  /** Неон акцента: изумруд / умная ферма (не фиолетовый AI) */
  outfit: '#10b981',
  /** «Панели» сенсоров — мятный хром */
  skin: '#c8f0e0',
  speed: 0.05,
  zIndex: 40,
  lang: 'ru',
}

export type ChibiWidgetOptions = Partial<ChibiWidgetConfig> & { color?: string }

export function mergeChibiConfig(partial?: ChibiWidgetOptions): ChibiWidgetConfig {
  return {
    ...defaultChibiConfig,
    ...partial,
    outfit: partial?.outfit ?? partial?.color ?? defaultChibiConfig.outfit,
    skin: partial?.skin ?? defaultChibiConfig.skin,
    lang: partial?.lang ?? defaultChibiConfig.lang,
    onOpenAgent: partial?.onOpenAgent,
  }
}

/** @deprecated используйте mergeChibiConfig */
export const defaultRobotConfig = defaultChibiConfig
export function mergeRobotConfig(partial?: ChibiWidgetOptions): ChibiWidgetConfig {
  return mergeChibiConfig(partial)
}
