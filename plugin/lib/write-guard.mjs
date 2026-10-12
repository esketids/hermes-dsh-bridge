/**
 * write-guard — the rule that stops a generic catalog dispatch from writing to an authority
 * surface with arguments it never earned.
 *
 * Pure ESM, node builtins only (in fact: none), so it is unit-testable with plain `node`:
 *
 *   node plugin/lib/write-guard.test.mjs
 *
 * Why it exists: a tier-3 probe called a credentials setter as
 * `dsh_cmd { group: 'credentials', op: '<setter>', args: {} }`. The dispatcher turned that into
 * `callArgs = [{}]` and invoked the mutating method with the empty object as its first
 * positional argument. The harness persisted the result into ~/.dsh/.credentials.yaml as a
 * mapping whose key and value were both `{}`; on the next launch the credentials plugin rejected
 * the document and the app refused to boot until the file was repaired by hand.
 *
 * The rule that follows from that: a write on an authority/credential surface needs explicit
 * arguments that satisfy the method's *published signature*, and the bridge never auto-fills
 * them. Reads are untouched.
 */

/** Authority / credential / install surfaces: the tier-3 service keys. */
export const AUTHORITY_SERVICES = Object.freeze([
  'credentials', 'credentialsController', 'deepseekAccount', 'authorization', 'pluginManager', 'configEditor',
])

const AUTHORITY_SET = new Set(AUTHORITY_SERVICES)

/**
 * Every verb that makes a method a write. `sign` covers `signIn`/`signOut`; the credentials
 * surface's `set`/`unset` and its record editors (`modifyRecord`, …) are the reason `unset` and
 * `modify` are here at all.
 */
const MUTATING_VERBS = [
  'set', 'unset', 'put', 'write', 'store', 'delete', 'remove', 'clear', 'revoke', 'create',
  'update', 'add', 'modify', 'mutate', 'patch', 'upsert', 'replace', 'insert', 'assign', 'rotate',
  'purge', 'truncate', 'register', 'deregister', 'mount', 'unmount', 'start', 'stop', 'cancel',
  'kill', 'submit', 'commit', 'publish', 'deploy', 'upload', 'lock', 'unlock', 'flush', 'install',
  'uninstall', 'enable', 'disable', 'reset', 'grant', 'save', 'apply', 'sign', 'link', 'unlink',
  'rename', 'edit', 'configure',
]

/**
 * A mutating method name: a verb, then a word boundary — end of string, or an uppercase letter /
 * digit / `_` — so `address` (`add`), `setup` (`set`), `status`, `enabled` and other read names
 * are not misread as writes. Matching is case-insensitive, but the boundary is not: that is why
 * the verbs are expanded to `[aA]`-style classes rather than using the `i` flag, which would also
 * make the boundary's `[A-Z0-9_]` match `setup`'s `u`.
 */
const anyCase = (word) => [...word].map((ch) => `[${ch}${ch.toUpperCase()}]`).join('')

export const MUTATING_OP = new RegExp(`^(?:${MUTATING_VERBS.map(anyCase).join('|')})(?=$|[A-Z0-9_])`)

/** The harness' own credential-reference grammar (`credential ref "…" must match …`). */
export const REF_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Parameter names that carry a reference (a credential ref, env-var name, plugin id, …). */
const REF_LIKE = new Set(['ref', 'key', 'name', 'env'])

/** Parameter names that carry a secret: must be a real, non-empty string when supplied. */
const SECRET_LIKE = new Set(['value', 'secret', 'token', 'apikey', 'apikeyenv', 'password'])

/** Parameter names the bridge itself can synthesise (never for a mutating op). */
const RUNTIME_LIKE = /\bAbortSignal\b|\bAgent\b|\bSession\b/

export function isAuthorityService(key) {
  return typeof key === 'string' && AUTHORITY_SET.has(key)
}

export function isMutatingOp(op) {
  return typeof op === 'string' && MUTATING_OP.test(op)
}

/** Parse "name(a: A, b?: B): C" → [{name, optional, type}] using top-level commas only. */
export function signatureParams(sig) {
  if (typeof sig !== 'string') return []
  const open = sig.indexOf('(')
  if (open === -1) return []
  let depth = 0
  let close = -1
  for (let i = open; i < sig.length; i++) {
    const ch = sig[i]
    if ('(<[{'.includes(ch)) depth++
    else if (ch === ')') { depth--; if (depth === 0) { close = i; break } }
    else if (')>]}'.includes(ch)) depth--
  }
  if (close === -1) return []
  const inner = sig.slice(open + 1, close)
  const parts = []
  let buf = ''
  let d = 0
  for (const ch of inner) {
    if ('(<[{'.includes(ch)) d++
    if (')>]}'.includes(ch)) d--
    if (ch === ',' && d === 0) { parts.push(buf); buf = '' } else buf += ch
  }
  if (buf.trim()) parts.push(buf)
  return parts.map((p) => {
    const m = p.trim().match(/^([A-Za-z_$][\w$]*)\s*(\?)?\s*(?::\s*([\s\S]+))?$/)
    return m ? { name: m[1], optional: Boolean(m[2]), type: (m[3] ?? '').trim() } : null
  }).filter(Boolean)
}

/** A plain object is an object literal (or a null-prototype record) — not an array, Date, … */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Empty means absent: undefined, null, '', [], {} or a non-finite number. `false`/0 are values. */
function isEmptyValue(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value === ''
  if (typeof value === 'number') return !Number.isFinite(value)
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/** Does `value` contradict the declared parameter type? Unknown/union types are left alone. */
function typeMismatch(value, type) {
  const t = typeof type === 'string' ? type : ''
  if (t === '') return false
  if (/\bstring\b/i.test(t)) return typeof value !== 'string'
  if (/\bnumber\b/i.test(t)) return typeof value !== 'number'
  if (/\bboolean\b/i.test(t)) return typeof value !== 'boolean'
  if (RUNTIME_LIKE.test(t)) return false
  if (/\b(?:Array|ReadonlyArray)\b|\w+\[\]/.test(t)) return !Array.isArray(value)
  if (/\b(?:object|Record|Map)\b/i.test(t)) return typeof value !== 'object' || value === null
  return false
}

/**
 * The decision point for one catalog call. Only an authority service *and* a mutating method is
 * guarded; everything else is always allowed. Reasons never quote an argument value — a value
 * on this surface may be a secret — they name parameters only.
 *
 * @returns {{ok: true} | {ok: false, why: string}}
 */
export function guardWriteCall({ service, op, signature, args } = {}) {
  if (!isAuthorityService(service) || !isMutatingOp(op)) return { ok: true }
  const fail = (why) => ({ ok: false, why })

  // 1. No arguments is not an argument list. `{}` / `[]` / a primitive is exactly the shape that
  //    became an empty-object credential reference.
  const positional = Array.isArray(args)
  if (args === undefined || args === null || typeof args !== 'object') return fail('writes need explicit arguments')
  if (positional ? args.length === 0 : (!isPlainObject(args) || Object.keys(args).length === 0)) {
    return fail('writes need explicit arguments')
  }

  const params = signatureParams(signature)
  const has = (p, i) => (positional ? i < args.length : Object.prototype.hasOwnProperty.call(args, p.name))
  const valueAt = (p, i) => (positional ? args[i] : args[p.name])

  // 2. Every required parameter of the published signature must be present and carry a value.
  for (const [i, p] of params.entries()) {
    if (p.optional) continue
    if (!has(p, i)) return fail(`write is missing required argument "${p.name}"`)
    const value = valueAt(p, i)
    if (isEmptyValue(value)) return fail(`required argument "${p.name}" is empty`)
    if (typeMismatch(value, p.type)) return fail(`required argument "${p.name}" does not match its declared type`)
  }

  // 3 + 4. Supplied values are checked by name: refs against the harness' own grammar, secrets
  //          for being a real string.
  for (const [i, p] of params.entries()) {
    if (!has(p, i)) continue
    const value = valueAt(p, i)
    if (value === undefined) continue
    const lower = p.name.toLowerCase()
    if (REF_LIKE.has(lower)) {
      if (typeof value !== 'string' || !REF_NAME_RE.test(value)) {
        return fail(`argument "${p.name}" must be a valid reference name`)
      }
      continue
    }
    if (SECRET_LIKE.has(lower)) {
      if (typeof value !== 'string' || value === '') return fail(`argument "${p.name}" must be a non-empty string`)
    }
  }

  return { ok: true }
}

/**
 * Narrow an argument-candidate list for the dispatcher: a mutating method is called with the
 * caller's own argument list only (index 0), never with a signature-derived auto-filled variant.
 * Reads keep every candidate.
 */
export function callerAttemptsOnly(op, candidates) {
  if (!Array.isArray(candidates)) return candidates
  return isMutatingOp(op) ? candidates.slice(0, 1) : candidates
}
