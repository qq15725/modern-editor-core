import { isPath } from './path'
import { isPoint } from './point'
import { isRange } from './range'
import type { Path } from './path'
import type { Point } from './point'
import type { Range } from './range'

export type Location = Path | Point | Range

export function isLocation(value: any): value is Location {
  return isPath(value) || isPoint(value) || isRange(value)
}
