// Custom JSX runtime that attaches source info to DOM nodes
import * as Original from "react/jsx-dev-runtime"

const SOURCE_KEY = Symbol.for("__vortexSource__")

export const Fragment = Original.Fragment

export function jsxDEV(type, props, key, isStatic, source, self) {
  // Only attach source to host elements (div, button, etc.)
  if (source?.fileName && typeof type === "string") {
    const sourceInfo = {
      fileName: source.fileName,
      lineNumber: source.lineNumber,
      columnNumber: source.columnNumber,
    }

    const originalRef = props?.ref
    const enhancedProps = {
      ...props,
      ref: (node) => {
        if (node) {
          node[SOURCE_KEY] = sourceInfo
        }
        // Call original ref if exists
        if (typeof originalRef === "function") originalRef(node)
        else if (originalRef) originalRef.current = node
      },
    }

    return Original.jsxDEV(type, enhancedProps, key, isStatic, source, self)
  }

  return Original.jsxDEV(type, props, key, isStatic, source, self)
}
