const references =
  /(?<![\w/#@])(?:#([1-9]\d*)|@([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)|([a-f\d]{7,40}))(?![\w-])/gi

function linkText(value, repoUrl) {
  const children = []
  let offset = 0

  for (const match of value.matchAll(references)) {
    const [label, pull, username, hash] = match

    // A hexadecimal word without a digit is too easy to mistake for prose.
    if (hash && !/\d/.test(hash)) continue

    if (match.index > offset) {
      children.push({ type: "text", value: value.slice(offset, match.index) })
    }

    const href = pull
      ? `${repoUrl}/pull/${pull}`
      : username
        ? `https://github.com/${username}`
        : `${repoUrl}/commit/${hash}`

    children.push({
      type: "element",
      tagName: "a",
      properties: { href },
      children: [{ type: "text", value: label }],
    })
    offset = match.index + label.length
  }

  if (offset === 0) return null
  if (offset < value.length) {
    children.push({ type: "text", value: value.slice(offset) })
  }

  return children
}

function visit(node, repoUrl) {
  if (!node.children || ["a", "code", "pre", "script", "style"].includes(node.tagName)) return

  node.children = node.children.flatMap((child) => {
    if (child.type === "text") return linkText(child.value, repoUrl) ?? [child]
    visit(child, repoUrl)
    return [child]
  })
}

export function linkGitHubReferences(repoUrl) {
  return (tree) => visit(tree, repoUrl)
}
