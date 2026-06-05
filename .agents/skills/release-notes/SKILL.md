---
name: release-notes
description: Draft short project release notes from git tag diffs. Use when asked to summarize changes between releases/tags, especially when release notes should reference pull request numbers.
---

# Release Notes

Use this skill to draft concise release notes for renCal from git history.

## Workflow

1. Identify the current and previous release tags.
   - If the user names a tag, use that as the current tag.
   - Otherwise use `git describe --tags --abbrev=0` for the current tag.
   - Find the previous tag with `git tag --sort=-creatordate` or semver ordering when relevant.

2. Inspect the changes between tags:

   ```bash
   git log --oneline --decorate <previous-tag>..<current-tag>
   git diff --stat <previous-tag>..<current-tag>
   ```

3. Inspect commit subjects/bodies for PR references:

   ```bash
   git log --format='%h%x09%s%x09%b' <previous-tag>..<current-tag>
   ```

   - Preserve PR references like `(#30)` from merge/squash commit subjects.
   - If a change comes from a non-PR commit, reference the short commit hash only when useful.
   - Prefer grouping related implementation details under the same PR number instead of listing every touched file.

4. If the diffstat is broad or unclear, inspect focused diffs for changed areas:
   ```bash
   git diff <previous-tag>..<current-tag> -- <path>
   ```

## Output style

- Return short bullet-form notes.
- Mention the compared range when helpful, e.g. `v0.1.0 since v0.0.6`.
- Each bullet should describe user-visible impact first, then cite the PR/commit at the end.
- Avoid internal implementation details unless they explain a visible improvement.
- Keep wording release-note friendly: concise, polished, and understandable to users.

## Example

```markdown
- Added keyboard navigation for agenda events with `Tab` / `Shift+Tab`, `Enter` to open, and `Esc` to exit. (#30)
- Multi-day events in week view now keep their titles visible while scrolling horizontally. (#29)
- Updated shortcut documentation to point users to the `?` shortcuts overlay. (a26cd24)
```
