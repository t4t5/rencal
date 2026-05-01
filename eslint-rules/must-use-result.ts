import { ESLintUtils } from "@typescript-eslint/utils"
import * as ts from "typescript"

const createRule = ESLintUtils.RuleCreator(() => "https://better-result.dev")

const isFromBetterResult = (symbol: ts.Symbol | undefined): boolean => {
  const decl = symbol?.declarations?.[0]
  return !!decl?.getSourceFile().fileName.includes("better-result")
}

const isResultType = (type: ts.Type): boolean => {
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(isResultType)
  }

  // Result<T, E> alias from better-result.
  if (type.aliasSymbol?.getName() === "Result" && isFromBetterResult(type.aliasSymbol)) {
    return true
  }

  const symbol = type.getSymbol()
  if (!symbol) return false
  const name = symbol.getName()

  // Concrete Ok / Err classes from better-result.
  if ((name === "Ok" || name === "Err") && isFromBetterResult(symbol)) {
    return true
  }

  // Promise<Result<...>> — recurse into the unwrapped type.
  if (name === "Promise") {
    const args = (type as ts.TypeReference).typeArguments
    if (args?.[0]) return isResultType(args[0])
  }

  return false
}

export const mustUseResult = createRule({
  name: "must-use-result",
  meta: {
    type: "problem",
    docs: {
      description: "Result values must be inspected, not discarded.",
    },
    messages: {
      mustUse:
        "Result is being discarded. Inspect it with .match / .isOk / .isErr / .unwrap* / .unwrapOr, return it, or assign it.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()

    return {
      ExpressionStatement(node) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(node.expression)
        const type = checker.getTypeAtLocation(tsNode)
        if (isResultType(type)) {
          context.report({ node: node.expression, messageId: "mustUse" })
        }
      },
    }
  },
})
