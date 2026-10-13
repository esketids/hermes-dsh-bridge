/**
 * plan-call — decide whether one catalog call is reachable *without invoking the method*.
 *
 * Pure ESM, node builtins only (in fact: none), so it is unit-testable with plain `node`:
 *
 *   node plugin/lib/plan-call.test.mjs
 *
 * Why it exists: auditing 473 published methods meant executing them, and executing a method with
 * a placeholder callback is how `systemPrompt.tools({})` killed every model turn until restart.
 * `dsh_cmd { ..., dry_run: true }` runs the same checks in the same order — tier verdict, method
 * existence, write guard — and reports the outcome instead of calling. The argument list is
 * summarised by shape only; no supplied value ever reaches the report, because a value on this
 * surface may be a secret.
 */

import { guardWriteCall, signatureParams } from './write-guard.mjs'
import { positionalFromNamed } from './named-args.mjs'

/** A stable, value-free description of one positional argument. */
function shapeOf(value) {
  if (value === null) return { kind: 'null' }
  if (value === undefined) return { kind: 'undefined' }
  if (typeof value === 'string') return { kind: 'string', length: value.length }
  if (Array.isArray(value)) return { kind: 'array', length: value.length }
  if (typeof value === 'function') return { kind: 'function' }
  if (typeof value !== 'object') return { kind: typeof value }
  const tag = Object.prototype.toString.call(value).slice(8, -1)
  if (tag !== 'Object') return { kind: tag }
  return { kind: 'object' }
}

/**
 * The plan for one `{ group, op, args }` dispatch, computed without side effects.
 *
 * @param {object} input
 * @param {string} input.service        the catalog service key
 * @param {string} input.op             the method name
 * @param {string} [input.signature]    the published signature (may be empty/absent)
 * @param {any}    [input.args]         exactly what the caller supplied
 * @param {number} [input.tier]         the tier the dispatcher assigned
 * @param {{allowed: boolean, why?: string}} [input.permission] the dispatcher's tier verdict
 * @param {boolean} [input.hasMethod]   `typeof target[op] === 'function'`
 * @returns {{reachable: boolean, tier: number|undefined, permission: object, hasMethod: boolean,
 *   guard: object, signature: string|null, params: object[], callArgs: object[], named: boolean,
 *   refusals: string[]}}
 */
export function planCall({ service, op, signature, args, tier, permission, hasMethod } = {}) {
  const verdict = permission ?? { allowed: false, why: 'no tier verdict was computed for this call' }
  const allowed = verdict.allowed === true
  const methodExists = hasMethod === true
  const guard = guardWriteCall({ service, op, signature, args })

  const namedArgs = positionalFromNamed(signature, args)
  const positional = namedArgs ?? (Array.isArray(args) ? args : [args ?? {}])
  const callArgs = positional.map((value, position) => ({ position, ...shapeOf(value) }))

  const refusals = []
  if (!allowed) refusals.push(verdict.why ?? `${service}.${op} is not permitted`)
  if (!methodExists) refusals.push(`service "${service}" has no method "${op}"`)
  if (!guard.ok) refusals.push(guard.why)

  return {
    reachable: refusals.length === 0,
    tier,
    permission: verdict,
    hasMethod: methodExists,
    guard,
    signature: typeof signature === 'string' ? signature : null,
    params: signatureParams(signature),
    callArgs,
    named: namedArgs !== undefined,
    refusals,
  }
}
