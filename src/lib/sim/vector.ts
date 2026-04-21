import type { Vector2 } from './types.ts'

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 }

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function cloneVector(vector: Vector2): Vector2 {
  return { x: vector.x, y: vector.y }
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(vector: Vector2, amount: number): Vector2 {
  return { x: vector.x * amount, y: vector.y * amount }
}

export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y
}

export function lengthSq(vector: Vector2): number {
  return dot(vector, vector)
}

export function length(vector: Vector2): number {
  return Math.sqrt(lengthSq(vector))
}

export function distance(a: Vector2, b: Vector2): number {
  return length(sub(a, b))
}

export function normalize(
  vector: Vector2,
  fallback: Vector2 = { x: 1, y: 0 },
): Vector2 {
  const magnitude = length(vector)

  if (magnitude <= Number.EPSILON) {
    return cloneVector(fallback)
  }

  return scale(vector, 1 / magnitude)
}

export function perp(vector: Vector2): Vector2 {
  return { x: -vector.y, y: vector.x }
}

export function angleToVector(angle: number): Vector2 {
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

export function lerpNumber(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha
}

export function lerpVector(start: Vector2, end: Vector2, alpha: number): Vector2 {
  return {
    x: lerpNumber(start.x, end.x, alpha),
    y: lerpNumber(start.y, end.y, alpha),
  }
}

export function clampMagnitude(vector: Vector2, maxLength: number): Vector2 {
  const magnitude = length(vector)

  if (magnitude <= maxLength) {
    return cloneVector(vector)
  }

  if (magnitude <= Number.EPSILON) {
    return cloneVector(vector)
  }

  return scale(vector, maxLength / magnitude)
}
