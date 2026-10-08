# Issue tracker: GitHub

Issues and specs live in magnus-lycka/rpgcad on GitHub.
Use the gh CLI from this repository.

- Create issues with gh issue create; use --body-file for multiline bodies.
- Read issues with gh issue view, including labels and comments.
- List issues with gh issue list and appropriate filters.
- Comment with gh issue comment.
- Apply or remove labels with gh issue edit.
- Close resolved issues with gh issue close.
- Link child issues using native sub-issues where supported;
  otherwise add "Part of #<parent>" to the child and a task list
  to the parent.
- Represent blockers using native issue dependencies where
  supported; otherwise add "Blocked by: #<number>" to the issue.

## Pull requests as a triage surface

PRs as a request surface: no.

## Skill terminology

"Publish to the issue tracker" means create a GitHub issue.
"Fetch the relevant ticket" means read the GitHub issue,
including its labels and comments.
