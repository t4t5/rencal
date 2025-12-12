// Proof of concept: Parse a file and extract CVA config
// Run with: npx tsx vortex/parse-cva.ts
import fs from "fs"
import ts from "typescript"

const filePath = "./src/components/ui/button.tsx"
const sourceCode = fs.readFileSync(filePath, "utf-8")

// Parse the file
const sourceFile = ts.createSourceFile(
  filePath,
  sourceCode,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)

// Find cva() calls
function findCvaCalls(node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    const expression = node.expression
    if (ts.isIdentifier(expression) && expression.text === "cva") {
      console.log("\n=== Found cva() call ===")
      console.log("Line:", sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1)

      // Extract arguments
      node.arguments.forEach((arg, i) => {
        console.log(`\nArgument ${i}:`)

        if (ts.isStringLiteral(arg)) {
          // Base classes (string)
          console.log("  Type: Base classes (string)")
          console.log("  Value:", arg.text.slice(0, 100) + "...")
        } else if (ts.isObjectLiteralExpression(arg)) {
          // Config object
          console.log("  Type: Config object")
          extractConfigObject(arg)
        }
      })
    }
  }

  ts.forEachChild(node, findCvaCalls)
}

function extractConfigObject(obj: ts.ObjectLiteralExpression): void {
  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text

      if (propName === "variants" && ts.isObjectLiteralExpression(prop.initializer)) {
        console.log("\n  Variants:")
        extractVariants(prop.initializer)
      } else if (propName === "defaultVariants" && ts.isObjectLiteralExpression(prop.initializer)) {
        console.log("\n  Default Variants:")
        extractDefaults(prop.initializer)
      }
    }
  })
}

function extractVariants(obj: ts.ObjectLiteralExpression): void {
  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const variantName = prop.name.text
      console.log(`    ${variantName}:`)

      if (ts.isObjectLiteralExpression(prop.initializer)) {
        prop.initializer.properties.forEach((valueProp) => {
          if (ts.isPropertyAssignment(valueProp) && ts.isIdentifier(valueProp.name)) {
            const valueName = valueProp.name.text
            let classValue = "(complex)"

            if (ts.isStringLiteral(valueProp.initializer)) {
              classValue = valueProp.initializer.text.slice(0, 50) + "..."
            }

            console.log(`      - ${valueName}: "${classValue}"`)
          }
        })
      }
    }
  })
}

function extractDefaults(obj: ts.ObjectLiteralExpression): void {
  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text
      let value = "(unknown)"

      if (ts.isStringLiteral(prop.initializer)) {
        value = prop.initializer.text
      }

      console.log(`    ${name}: "${value}"`)
    }
  })
}

console.log("Parsing:", filePath)
findCvaCalls(sourceFile)
