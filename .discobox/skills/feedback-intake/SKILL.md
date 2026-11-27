---
name: feedback-intake
description: Turn reports from the site's feedback button (GET /api/feedback on https://rabble.rodeo, read with the FEEDBACK_READ_TOKEN credential) into GitHub issues the owner decides on — grouped by symptom, de-duplicated against open issues, labelled `feedback` and `status/needs-decision` so the factory never starts work on them without the owner's say. Use when asked to process, triage or review feedback, or when a box is started with /feedback-intake.
---
# Feedback intake

People press the feedback button on rabble.rodeo and in the apps; the
reports land in the `Feedback` table and nowhere else. This pass reads the
new ones and files an issue for each distinct, actionable thing, as a
proposal for the owner. It never changes code and never marks anything
ready for work.

## 1. Read the reports

```bash
eval "$(discobox-access env)"   # delivers FEEDBACK_READ_TOKEN and GH_TOKEN
curl -sS -H "Authorization: Bearer $FEEDBACK_READ_TOKEN" \
  'https://rabble.rodeo/api/feedback?limit=200' | jq '.feedback' > /tmp/feedback.json
jq -r '.[] | "\(.id)\t\(.createdAt)\t\(.category)/\(.platform)\t\(.message|.[0:80])"' /tmp/feedback.json
```

Each report has `id`, `message`, `category` (problem, idea, other, beta),
`platform` (web, android, ios), `appVersion`, `page`, `spaceId`, `handle`
(null when signed out), `email` (set only on a `beta` report — the Android
closed-testing sign-up address), `userAgent`, `context` (the client's own
diagnostics: room state, build id, device) and `createdAt`.

## 2. Find what was already processed

Every report that was handled is referenced by its id in an issue body or
comment as `<!-- feedback:ID -->`. Collect those markers:

```bash
gh api 'repos/rothgar/rabble.radio/issues?labels=feedback&state=all&per_page=100' \
  --jq '.[] | "\(.number)\t\(.state)\t\(.title)"'
gh api --paginate 'repos/rothgar/rabble.radio/issues?labels=feedback&state=all&per_page=100' \
  --jq '.[].body' | grep -o 'feedback:[a-z0-9]*' | sort -u > /tmp/seen.txt
for n in $(gh api 'repos/rothgar/rabble.radio/issues?labels=feedback&state=all&per_page=100' --jq '.[].number'); do
  gh api "repos/rothgar/rabble.radio/issues/$n/comments" --jq '.[].body' | grep -o 'feedback:[a-z0-9]*'
done | sort -u >> /tmp/seen.txt
```

A report whose id is in `/tmp/seen.txt` is done. Use `gh api` only (REST);
this box's credential does not cover GraphQL, so `gh issue` commands fail.

## 3. Decide, per new report

- **A problem or idea the owner should see**: file it (step 4). Several
  reports of the same thing become one issue quoting each of them.
- **Matches an open `feedback` issue**: one comment on that issue quoting
  the new report, with its marker.
- **An Android beta sign-up** (`category: beta`): never file a GitHub issue
  or quote it in one — the issue would be public and the report carries the
  submitter's email. Record it in the intake log (step 5) as
  `skipped: beta sign-up (see /admin/feedback)` and nothing else; the owner
  reviews and enrolls these from the admin page, by hand.
- **Not actionable** (a test message, thanks, abuse, empty): record it in
  the intake log (step 5) and nothing else.

When a report is about something the QA checks or a worker could
reproduce, say how, but do not reproduce it yourself beyond one quick look
(a curl, one screenshot): intake is a reading pass.

## 4. File an issue

```bash
gh api -X POST repos/rothgar/rabble.radio/issues \
  -f title='Feedback: <symptom or request, in the reporter's terms>' \
  -f 'labels[]=feedback' -f 'labels[]=status/needs-decision' -F body=@/tmp/issue.md
```

`status/needs-decision` means the owner has to say yes before any work
starts; the manager holds the issue until then, whatever its automation
settings. Do not add `bug`, `enhancement`, a priority or any other
`status/*` label: that is the owner's decision.

Body, at most 15 lines. The repository is public: never quote the report
or name the reporter. Paraphrase the problem in your own words with no
names, handles, emails or pasted text; the verbatim report stays in
`/admin/feedback`, which the marker line links to.

```
**Report:** <your paraphrase of the problem, one or two sentences, no quotes>

**From:** <"signed in" or "signed out">, <platform> <appVersion or build id>, on <page or show> at <createdAt>
**Context:** <one line from the diagnostics that matters, or "nothing notable">
**Looks like:** <your one-sentence reading: what is probably wrong or being asked>
**Suggested next step:** <reproduce via ..., ask the reporter ..., or product call>
<!-- feedback:ID -->
```

One marker line per report the issue covers. A comment on an existing
issue is the paraphrase, the From line and the marker.

## 5. Intake log

An issue titled `Feedback intake log` (label `feedback`, kept open) holds
one comment per run. Find it (`gh api ... --jq '.[] | select(.title=="Feedback intake log") | .number'`)
or create it once with that title and label and the body
`Each comment is one feedback-intake run: what came in and where it went.`
Then add a comment listing every report handled this run:

```
Run <UTC timestamp>: <n> new report(s)
- feedback:ID → #N (new) | → #N (comment) | skipped: <reason>
```

This is what makes the next run skip them. A run with no new reports still
posts a one-line comment saying so.

## 6. Finish

End with a short summary in the terminal: reports read, issues opened or
updated by number, reports skipped. Then stop; the owner decides in the
console or on GitHub, and the manager takes it from there.
