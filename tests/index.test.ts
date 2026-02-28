import { describe, expect, test } from 'bun:test'
import { Plugin } from 'vite'
import solidPropsTransform from '../src'

// Helper: run the plugin's transform and return the output code (or null)
function transform(code: string, id = 'Component.tsx'): string | null {
  const plugin = solidPropsTransform() as Plugin & {
    transform(code: string, id: string): { code: string } | null
  }
  const result = plugin.transform(code, id)
  return result?.code ?? null
}

/** Calls transform and asserts the result is non-null */
function transformOrThrow(code: string, id = 'Component.tsx'): string {
  const out = transform(code, id)
  if (out == null) throw new Error('Expected transform to produce output')
  return out
}

// ─── Skipping ────────────────────────────────────────────────────────────────

describe('skipping', () => {
  test('returns null for non-tsx/jsx files', () => {
    expect(transform('const x = 1', 'file.css')).toBeNull()
  })

  test('returns null for node_modules', () => {
    const code = `function Foo({ a }) { return <div>{a}</div> }`
    expect(transform(code, 'node_modules/pkg/index.tsx')).toBeNull()
  })

  test('returns null when there is no destructuring pattern', () => {
    const code = `function Foo(props) { return <div>{props.a}</div> }`
    expect(transform(code, 'Foo.tsx')).toBeNull()
  })

  test('does not transform non-component functions', () => {
    const code = `function helper({ a, b }) { return a + b }`
    const out = transform(code, 'utils.ts')
    // Plugin still parses/generates but should NOT add mergeProps/splitProps
    expect(out).not.toContain('mergeProps')
    expect(out).not.toContain('splitProps')
  })
})

// ─── Basic Destructuring ─────────────────────────────────────────────────────

describe('basic destructuring', () => {
  test('replaces destructured props with member expressions', () => {
    const code = `
function Greeting({ name, age }) {
  return <div>Hello {name}, age {age}</div>
}
`
    const out = transformOrThrow(code)
    // Should reference _props.name and _props.age (the generated identifier)
    expect(out).toContain('.name')
    expect(out).toContain('.age')
    // The destructuring pattern should be gone
    expect(out).not.toMatch(/function Greeting\(\s*\{/)
  })

  test('works with arrow function components', () => {
    const code = `const Greeting = ({ name }) => <div>{name}</div>`
    const out = transformOrThrow(code)
    expect(out).toContain('.name')
  })

  test('works with exported arrow function', () => {
    const code = `export const Greeting = ({ name }) => { return <div>{name}</div> }`
    const out = transformOrThrow(code)
    expect(out).toContain('.name')
  })
})

// ─── Component Definition Styles ─────────────────────────────────────────────

describe('component definition styles', () => {
  test('default export function declaration', () => {
    const code = `
export default function Button({ label }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.label')
  })

  test('default export arrow function', () => {
    const code = `
const Component = ({ title }) => {
  return <h1>{title}</h1>
}
export default Component
`
    const out = transformOrThrow(code)
    expect(out).toContain('.title')
  })

  test('inline default export arrow function', () => {
    const code = `export default ({ message }) => <div>{message}</div>`
    const out = transformOrThrow(code)
    expect(out).toContain('.message')
  })

  test('named export function declaration', () => {
    const code = `
export function Header({ title, subtitle }) {
  return <header><h1>{title}</h1><h2>{subtitle}</h2></header>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.title')
    expect(out).toContain('.subtitle')
  })

  test('function expression assigned to const', () => {
    const code = `
const Card = function({ title }) {
  return <div>{title}</div>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.title')
  })

  test('function expression assigned to let', () => {
    const code = `
let Widget = function({ value }) {
  return <span>{value}</span>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.value')
  })

  test('function expression assigned to var', () => {
    const code = `
var Panel = function({ content }) {
  return <div>{content}</div>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.content')
  })

  test('component with generic type parameter', () => {
    const code = `
function List<T>({ items }: { items: T[] }) {
  return <ul>{items.map(i => <li>{i}</li>)}</ul>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.items')
  })

  test('arrow function with generic type parameter', () => {
    const code = `
const Select = <T,>({ options, value }: { options: T[]; value: T }) => {
  return <select value={value}>{options}</select>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.options')
    expect(out).toContain('.value')
  })

  test('mixed default and named exports', () => {
    const code = `
export function Header({ title }) {
  return <h1>{title}</h1>
}

export function Footer({ copyright }) {
  return <footer>{copyright}</footer>
}

export default function Main({ content }) {
  return <main>{content}</main>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.title')
    expect(out).toContain('.copyright')
    expect(out).toContain('.content')
  })

  test('immediately exported function declaration', () => {
    const code = `
export { Link }

function Link({ href, children }) {
  return <a href={href}>{children}</a>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.href')
    expect(out).toContain('.children')
  })

  test('re-exported component', () => {
    const code = `
const Button = ({ label }) => <button>{label}</button>
export { Button }
`
    const out = transformOrThrow(code)
    expect(out).toContain('.label')
  })
})

// ─── Default Values ──────────────────────────────────────────────────────────

describe('default values', () => {
  test('wraps defaults in mergeProps', () => {
    const code = `
function Button({ label = 'Click me', disabled = false }) {
  return <button disabled={disabled}>{label}</button>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('mergeProps')
    expect(out).toContain("'Click me'")
    expect(out).toContain('false')
  })

  test('adds mergeProps import from solid-js', () => {
    const code = `
function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('from "solid-js"')
    expect(out).toContain('mergeProps')
  })

  test('appends to existing solid-js import', () => {
    const code = `
import { createSignal } from 'solid-js'

function Counter({ count = 0 }) {
  return <span>{count}</span>
}
`
    const out = transformOrThrow(code)
    // Should have a single import that includes both createSignal and mergeProps
    expect(out).toContain('createSignal')
    expect(out).toContain('mergeProps')
  })
})

// ─── Rest Properties ─────────────────────────────────────────────────────────

describe('rest properties', () => {
  test('uses splitProps for rest spread', () => {
    const code = `
function Card({ title, ...rest }) {
  return <div {...rest}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('splitProps')
    expect(out).toContain('"title"')
    expect(out).toContain('rest')
  })

  test('adds splitProps import', () => {
    const code = `
function Card({ title, ...rest }) {
  return <div {...rest}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('splitProps')
    expect(out).toContain('from "solid-js"')
  })
})

// ─── Nested Destructuring ────────────────────────────────────────────────────

describe('nested destructuring', () => {
  test('converts nested patterns to member expressions', () => {
    const code = `
function Info({ nested: { a, b } }) {
  return <div>{a} - {b}</div>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('.nested.a')
    expect(out).toContain('.nested.b')
  })
})

// ─── Combined Features ──────────────────────────────────────────────────────

describe('combined features', () => {
  test('defaults + rest produces mergeProps AND splitProps', () => {
    const code = `
function Widget({ label = 'hi', ...rest }) {
  return <div {...rest}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expect(out).toContain('mergeProps')
    expect(out).toContain('splitProps')
  })

  test('TestComponent: defaults + nested + rest', () => {
    const code = `
import { For } from 'solid-js'

function TestComponent({
  name = 'World',
  count = 0,
  avatar = '/default.png',
  items,
  nested: { a, b },
  ...rest
}: {
  name?: string
  count?: number
  avatar?: string
  items: string[]
  nested: { a: number; b: number }
  class?: string
  onClick?: () => void
}) {
  return (
    <div {...rest}>
      <p>{rest.class}</p>
      <pre>{a}</pre>
      <pre>{b}</pre>
      <img src={avatar} alt={name} />
      <h1>Hello {name}!</h1>
      <p>Count: {count}</p>
      <ul>
        <For each={items}>{(item) => <li>{item}</li>}</For>
      </ul>
    </div>
  )
}

export default TestComponent
`
    const out = transformOrThrow(code)

    // mergeProps for defaults
    expect(out).toContain('mergeProps')
    expect(out).toContain("'World'")
    expect(out).toContain("'/default.png'")

    // splitProps for rest
    expect(out).toContain('splitProps')
    expect(out).toContain('"name"')
    expect(out).toContain('"count"')
    expect(out).toContain('"avatar"')
    expect(out).toContain('"items"')
    expect(out).toContain('"nested"')

    // Nested member expressions
    expect(out).toContain('.nested.a')
    expect(out).toContain('.nested.b')

    // rest should still be used directly
    expect(out).toContain('{...rest}')
    expect(out).toContain('rest.class')

    // Import was appended to existing solid-js import
    expect(out).toContain('For')
    expect(out).toContain('mergeProps')
    expect(out).toContain('splitProps')

    // No leftover destructuring in function signature
    expect(out).not.toMatch(/function TestComponent\(\s*\{/)
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('renamed props are replaced correctly', () => {
    const code = `
function Tag({ label: text }) {
  return <span>{text}</span>
}
`
    const out = transformOrThrow(code)
    // 'text' should be replaced with a member expression accessing 'label' (the original prop key)
    expect(out).toContain('.label')
    expect(out).not.toContain('.text')
  })

  test('multiple components in one file are all transformed', () => {
    const code = `
function A({ x }) { return <div>{x}</div> }
function B({ y }) { return <span>{y}</span> }
`
    const out = transformOrThrow(code)
    expect(out).toContain('.x')
    expect(out).toContain('.y')
  })

  test('preserves non-component functions unchanged', () => {
    const code = `
function helper({ a, b }) { return a + b }
function Comp({ name }) { return <div>{name}</div> }
`
    const out = transformOrThrow(code)
    // Comp should be transformed
    expect(out).toContain('.name')
    // helper keeps destructuring (not a component)
    expect(out).toContain('function helper({')
  })

  test('handles .jsx extension', () => {
    const code = `function Foo({ a }) { return <div>{a}</div> }`
    const out = transformOrThrow(code, 'Foo.jsx')
    expect(out).toContain('.a')
  })

  test('handles .ts extension with JSX pragma', () => {
    // .ts files are processed too — the regex matches tsx? and jsx?
    const code = `function Foo({ a }) { return <div>{a}</div> }`
    const out = transform(code, 'Foo.ts')
    // Plugin tries to parse but .ts with JSX may fail gracefully
    // Either transformed or null is acceptable
    expect(out === null || out.includes('.a')).toBe(true)
  })
})
