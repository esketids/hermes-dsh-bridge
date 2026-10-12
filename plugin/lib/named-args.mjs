/**
 * named-args — turn `{ ref, value }` into the positional list a published signature declares.
 *
 * Pure ESM, node builtins only (in fact: none), so it is unit-testable with plain `node`:
 *
 *   node plugin/lib/named-args.test.mjs
 *
 * Why it exists: the catalog path hands a caller's `args` to the target method as a positional
 * list. A named object used to become the *first* positional argument, so a two-parameter method
 * (`set(ref, value)`) received the whole object in `ref` and failed reading a property off it.
 * Mapping by the published parameter names makes the documented shape work, and leaves a
 * request-shaped method (`search(request)`) passed the object it is.
 */

import { signatureParams } from './write-guard.mjs'

/** A plain object is an object literal (or a null-prototype record) — not an array, Date, … */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * `args` as a positional list in published-signature order, or `undefined` when the shape does not
 * qualify (not a non-empty plain object, no declared parameters, or a key the signature never
 * names — a request-shaped parameter must keep receiving the object as-is).
 *
 * Parameters are matched by name, never by position. The list is cut at the *last* declared
 * parameter the caller supplied: every slot up to it is that parameter's value, or `undefined`
 * when the caller omitted it, so an omitted parameter in the middle never shifts a later value
 * into its slot. Nothing is padded past the last supplied parameter — no value is invented.
 */
export function positionalFromNamed(signature, args) {
  if (!isPlainObject(args)) return undefined
  if (Object.keys(args).length === 0) return undefined
  const params = signatureParams(signature)
  if (params.length === 0) return undefined
  const declared = new Set(params.map((p) => p.name))
  for (const key of Object.keys(args)) {
    if (!declared.has(key)) return undefined
  }
  // `args` is non-empty and every key is declared, so at least one parameter is supplied.
  let last = -1
  for (const [i, p] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(args, p.name)) last = i
  }
  const out = []
  for (let i = 0; i <= last; i++) {
    const p = params[i]
    out.push(Object.prototype.hasOwnProperty.call(args, p.name) ? args[p.name] : undefined)
  }
  return out
}
