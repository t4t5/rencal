import { ESLintUtils } from "@typescript-eslint/utils"
import * as ts from "typescript"

const createRule = ESLintUtils.RuleCreator(() => "https://better-result.dev")

const isFromBetterResult = (symbol: ts.Symbol | undefined): boolean => {
  const decl = symbol?.declarations?.[0]
  return !!decl?.getSourceFile().fileName.includes("better-result")
}

const containsResult = (type: ts.Type): boolean => {
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(containsResult)
  }

  if (type.aliasSymbol?.getName() === "Result" && isFromBetterResult(type.aliasSymbol)) {
    return true
  }

  const symbol = type.getSymbol()
  if (!symbol) return false
  const name = symbol.getName()
  if ((name === "Ok" || name === "Err") && isFromBetterResult(symbol)) {
    return true
  }

  return false
}

export const noBarePromise = createRule({
  name: "no-bare-promise",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow awaiting bare Promises. Wrap with Result.tryPromise so errors flow through Result.",
    },
    messages: {
      bareAwait:
        "Awaiting a bare Promise. Wrap with Result.tryPromise (or Result.await for Promise<Result>) so the error becomes part of the type.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()

    return {
      AwaitExpression(node) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(node.argument)
        const type = checker.getTypeAtLocation(tsNode)
        const awaitedType = checker.getAwaitedType(type) ?? type
        if (!containsResult(awaitedType)) {
          context.report({ node, messageId: "bareAwait" })
        }
      },
    }
  },
})
