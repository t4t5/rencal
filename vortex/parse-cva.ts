// Parse CVA config from TypeScript/TSX files
// Run with: npx tsx vortex/parse-cva.ts
import fs from "fs"
import ts from "typescript"

export interface VariantValue {
  name: string
  classes: string
  line: number
}

export interface Variant {
  name: string
  values: VariantValue[]
}

export interface CvaConfig {
  filePath: string
  line: number
  baseClasses: string
  variants: Variant[]
  defaultVariants: Record<string, string>
}

export function parseCvaConfig(filePath: string): CvaConfig[] {
  const sourceCode = fs.readFileSync(filePath, "utf-8")
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const configs: CvaConfig[] = []

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      if (ts.isIdentifier(expression) && expression.text === "cva") {
        const config = extractCvaConfig(node, sourceFile, filePath)
        if (config) configs.push(config)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return configs
}

function extractCvaConfig(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  filePath: string,
): CvaConfig | null {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  let baseClasses = ""
  let variants: Variant[] = []
  let defaultVariants: Record<string, string> = {}

  node.arguments.forEach((arg) => {
    if (ts.isStringLiteral(arg)) {
      baseClasses = arg.text
    } else if (ts.isObjectLiteralExpression(arg)) {
      const extracted = extractConfigObject(arg, sourceFile)
      variants = extracted.variants
      defaultVariants = extracted.defaultVariants
    }
  })

  return { filePath, line, baseClasses, variants, defaultVariants }
}

function extractConfigObject(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): { variants: Variant[]; defaultVariants: Record<string, string> } {
  let variants: Variant[] = []
  let defaultVariants: Record<string, string> = {}

  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text

      if (propName === "variants" && ts.isObjectLiteralExpression(prop.initializer)) {
        variants = extractVariants(prop.initializer, sourceFile)
      } else if (propName === "defaultVariants" && ts.isObjectLiteralExpression(prop.initializer)) {
        defaultVariants = extractDefaults(prop.initializer)
      }
    }
  })

  return { variants, defaultVariants }
}

function extractVariants(obj: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): Variant[] {
  const variants: Variant[] = []

  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const variantName = prop.name.text
      const values: VariantValue[] = []

      if (ts.isObjectLiteralExpression(prop.initializer)) {
        prop.initializer.properties.forEach((valueProp) => {
          if (ts.isPropertyAssignment(valueProp)) {
            const valueName = ts.isIdentifier(valueProp.name)
              ? valueProp.name.text
              : ts.isStringLiteral(valueProp.name)
                ? valueProp.name.text
                : ""

            const line = sourceFile.getLineAndCharacterOfPosition(valueProp.getStart()).line + 1
            let classes = ""

            if (ts.isStringLiteral(valueProp.initializer)) {
              classes = valueProp.initializer.text
            }

            if (valueName) {
              values.push({ name: valueName, classes, line })
            }
          }
        })
      }

      variants.push({ name: variantName, values })
    }
  })

  return variants
}

function extractDefaults(obj: ts.ObjectLiteralExpression): Record<string, string> {
  const defaults: Record<string, string> = {}

  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text
      if (ts.isStringLiteral(prop.initializer)) {
        defaults[name] = prop.initializer.text
      }
    }
  })

  return defaults
}

// Test if run directly
const config = parseCvaConfig("./src/components/ui/button.tsx")
console.log(JSON.stringify(config, null, 2))
