import { processor } from '@src/eslint/modules/processor'
import { describe, expect, test } from 'bun:test'
import { Linter } from 'eslint'

describe('processor.preprocess', () => {
  test('transforms TSX files with destructured props', () => {
    const code = `
      function Component({ size }: { size: string }) {
        return <div>{size}</div>
      }
    `
    const [result] = processor.preprocess(code, 'Component.tsx')
    expect(result).toContain('props.size')
  })

  test('returns original code for non-component files', () => {
    const code = `const x = 1`
    const [result] = processor.preprocess(code, 'utils.ts')
    expect(result).toBe(code)
  })

  test('returns original code for non-matching files', () => {
    const code = `export const config = {}`
    const [result] = processor.preprocess(code, 'config.json')
    expect(result).toBe(code)
  })

  test('returns original code when no destructured component props', () => {
    const code = `
      function helper(props: { x: number }) {
        return props.x + 1
      }
    `
    const [result] = processor.preprocess(code, 'helper.ts')
    expect(result).toBe(code)
  })
})

describe('processor.postprocess', () => {
  test('replaces props.X with original name in messages', () => {
    // First, preprocess to populate the cache
    const code = `
      function Component({ size }: { size: string }) {
        return <div>{size}</div>
      }
    `
    processor.preprocess(code, 'test-post.tsx')

    const messages = [
      [
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable '_props.size' should be used within JSX.",
          line: 3,
          column: 5,
          endColumn: 16
        }
      ]
    ]

    const result = processor.postprocess(
      messages as Parameters<typeof processor.postprocess>[0],
      'test-post.tsx'
    )
    expect(result[0].message).toBe("The reactive variable 'size' should be used within JSX.")
    const r = result[0]
    // No prior expansions on this line, column stays the same
    expect(r.column).toBe(5)
    // endColumn shrinks: 16 - 7 = 9
    expect(r.endColumn).toBe(9)
  })

  test('handles renamed props in messages', () => {
    const code = `
      function Component({ size: mySize }: { size: string }) {
        return <div>{mySize}</div>
      }
    `
    processor.preprocess(code, 'test-renamed.tsx')

    const messages: Linter.LintMessage[][] = [
      [
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable '_props.size' should be used within JSX.",
          line: 3,
          column: 5,
          endColumn: 16,
          severity: 2
        }
      ]
    ]

    const result = processor.postprocess(messages, 'test-renamed.tsx')
    expect(result[0].message).toBe("The reactive variable 'mySize' should be used within JSX.")
    const r = result[0]
    expect(r.column).toBe(5)
    // endColumn shrinks: 16 - 5 = 11
    expect(r.endColumn).toBe(11)
  })

  test('replaces rest mapping identifier in messages', () => {
    const code = `
      function Component({ title, ...props }) {
        return <div class={props.class}>{title}</div>
      }
    `
    processor.preprocess(code, 'test-rest.tsx')

    const messages: Linter.LintMessage[][] = [
      [
        {
          ruleId: 'no-undef',
          message: "'_props' is not defined.",
          line: 3,
          column: 26,
          endColumn: 32,
          severity: 2
        }
      ]
    ]

    const result = processor.postprocess(messages, 'test-rest.tsx')
    expect(result[0].message).toBe("'props' is not defined.")
    // endColumn should shrink: 32 - ('_props'.length - 'props'.length) = 32 - 1 = 31
    expect(result[0].endColumn).toBe(31)
  })

  test('propAccess replacement takes priority over rest mapping', () => {
    const code = `
      function Component({ title, ...props }) {
        return <div class={props.class}>{title}</div>
      }
    `
    processor.preprocess(code, 'test-rest-priority.tsx')

    const messages: Linter.LintMessage[][] = [
      [
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable '_props.title' should be used within JSX.",
          line: 3,
          column: 5,
          endColumn: 18,
          severity: 2
        }
      ]
    ]

    const result = processor.postprocess(messages, 'test-rest-priority.tsx')
    // Should show 'title', not 'props.title' (propAccess should win over rest mapping)
    expect(result[0].message).toBe("The reactive variable 'title' should be used within JSX.")
    // endColumn should shrink: 18 - ('_props.title'.length - 'title'.length) = 18 - 7 = 11
    expect(result[0].endColumn).toBe(11)
  })

  test('adjusts columns for second prop occurrence on same line', () => {
    const code = `export function Component({
  size = 'default',
  ...props
}: { size?: 'default' | 'sm' } & Solid.ComponentProps<'pre'>) {
  const dimension = size === 'default' ? ('md') : size
  return <pre {...props}>{dimension}</pre>
}`
    processor.preprocess(code, 'test-second-occurrence.tsx')

    const messages: Linter.LintMessage[][] = [
      [
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable '_props.size' should be used within JSX.",
          line: 5,
          column: 21,
          endColumn: 32,
          severity: 2
        },
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable '_props.size' should be used within JSX.",
          line: 5,
          column: 58,
          endColumn: 69,
          severity: 2
        }
      ]
    ]

    const result = processor.postprocess(messages, 'test-second-occurrence.tsx')

    // First occurrence: no prior expansions, column stays at 21
    const first = result[0]
    expect(first.column).toBe(21)
    expect(first.endColumn).toBe(25) // 21 + 'size'.length

    // Second occurrence: one prior expansion shifted columns by 7
    const second = result[1]
    expect(second.column).toBe(51) // 58 - 7
    expect(second.endColumn).toBe(55) // 69 - 7 - 7 = 55
  })

  test('passes through messages unchanged for non-transformed files', () => {
    const messages: Linter.LintMessage[][] = [
      [
        {
          ruleId: 'some/rule',
          message: 'some error',
          line: 1,
          column: 1,
          severity: 2
        }
      ]
    ]

    const result = processor.postprocess(messages, 'non-transformed.tsx')
    expect(result).toEqual(messages[0])
  })
})
