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

- Anthropic's `frontend-design` skill (Apache-2.0) is vendored in
  `.discobox/skills/frontend-design/` and linked from `.claude/skills/`, so
  Claude Code, discobox workers and Kimchi personas all resolve the same copy.
  This directory holds nothing else at the moment.
