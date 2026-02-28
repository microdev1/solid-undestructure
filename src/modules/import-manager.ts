import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

/**
 * Ensures the required Solid.js imports (mergeProps, splitProps) are present in the program.
 * If an import from 'solid-js' already exists, it adds to it; otherwise, creates a new import.
 */
export function ensureImports(
  programPath: NodePath<t.Program>,
  needsMergeProps: boolean,
  needsSplitProps: boolean
) {
  const imports = new Set<string>()

  // Find existing solid-js import declaration directly from program body
  const solidjsImportNode = programPath.node.body.find(
    (stmt): stmt is t.ImportDeclaration =>
      t.isImportDeclaration(stmt) && stmt.source.value === 'solid-js'
  )

  if (solidjsImportNode) {
    solidjsImportNode.specifiers.forEach((spec) => {
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        imports.add(spec.imported.name)
      }
    })
  }

  const toAdd: string[] = []
  if (needsMergeProps && !imports.has('mergeProps')) {
    toAdd.push('mergeProps')
  }
  if (needsSplitProps && !imports.has('splitProps')) {
    toAdd.push('splitProps')
  }

  if (toAdd.length > 0) {
    if (solidjsImportNode) {
      // Add to existing import
      toAdd.forEach((name) => {
        solidjsImportNode.specifiers.push(t.importSpecifier(t.identifier(name), t.identifier(name)))
      })
    } else {
      // Create new import
      const newImport = t.importDeclaration(
        toAdd.map((name) => t.importSpecifier(t.identifier(name), t.identifier(name))),
        t.stringLiteral('solid-js')
      )
      programPath.node.body.unshift(newImport)
    }
  }
}
