import { createMarkdownProcessor } from "@astrojs/markdown-remark"
import assert from "node:assert/strict"
import { test } from "node:test"

import { linkGitHubReferences } from "./link-github-references.mjs"

const repoUrl = "https://github.com/t4t5/rencal"
const markdown = await createMarkdownProcessor({
  rehypePlugins: [[linkGitHubReferences, repoUrl]],
})

test("links PRs, commits, and GitHub usernames in release prose", async () => {
  const { code } = await markdown.render("Thanks @t4t5. (#151, #159, #167) Fixed in c1fb9aa.")

  assert.match(code, /<a href="https:\/\/github\.com\/t4t5">@t4t5<\/a>/)
  for (const number of [151, 159, 167]) {
    assert.match(code, new RegExp(`<a href="${repoUrl}/pull/${number}">#${number}</a>`))
  }
  assert.match(code, /<a href="https:\/\/github\.com\/t4t5\/rencal\/commit\/c1fb9aa">c1fb9aa<\/a>/)
})

test("preserves existing links, code, email addresses, and ordinary words", async () => {
  const { code } = await markdown.render(
    "[#151](https://example.com) `@t4t5 #159 c1fb9aa` someone@example.com decade and abc1234extra.\n\n```text\n#167 @t4t5 c1fb9aa\n```",
  )

  assert.match(code, /<a href="https:\/\/example\.com">#151<\/a>/)
  assert.match(code, /<code>@t4t5 #159 c1fb9aa<\/code>/)
  assert.match(code, /<a href="mailto:someone@example\.com">someone@example\.com<\/a>/)
  assert.match(code, /decade and abc1234extra/)
  assert.match(code, /<pre[\s\S]*#167 @t4t5 c1fb9aa/)
  assert.doesNotMatch(code, /github\.com\/t4t5\/rencal\/(pull|commit)/)
})
