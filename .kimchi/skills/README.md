# Kimchi persona skills

Skills are Markdown files in the Agent Skills format (`<name>/SKILL.md` with a
`name` / `description` frontmatter). A persona in `.kimchi/agents/<persona>.md`
lists the skills it wants in its frontmatter:

```yaml
skills: [rabble-design-system, frontend-design]
```

`scripts/kimchi-agent.sh` resolves each name against `.claude/skills/<name>`
(shared with Claude Code) and then `.kimchi/skills/<name>` (Kimchi only) and
appends the SKILL.md bodies to the persona's system prompt.

- `frontend-design/` is vendored from Anthropic's `frontend-design` Claude Code
  plugin (Apache-2.0, see LICENSE.txt) so Kimchi personas get the same design
  guidance Claude Code loads from the plugin.
