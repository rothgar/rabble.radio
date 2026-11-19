---
name: qa-live
description: Check the deployed site (https://rabble.rodeo) like a QA tester and open a GitHub issue for each real problem found — the deterministic checks in scripts/qa-live.mjs first, then an exploratory pass in headless Chromium at phone width, then issues filed through the GitHub REST API with de-duplication against open `qa` issues. Use when asked to QA, regression-test or smoke-test the live site, or when a box is started with /qa-live.
---
# QA pass on the live site

You are checking the deployed product at `https://rabble.rodeo`, not the
copy in this box. Nothing here changes code: the output of a run is zero or
more GitHub issues, each describing one problem precisely enough that a
worker can fix it without asking.

## 1. Deterministic checks

```bash
node scripts/qa-live.mjs --json > /tmp/qa.json; cat /tmp/qa.json
```

Every `"ok": false` entry is a problem to investigate (re-run the exact
request with curl, note status, body and timing). `slow` names checks over
five seconds: a problem only if it repeats on a second run a minute later.
"skipped" details are not problems.

## 2. Exploratory pass

Drive the site in headless Chromium the way `verify-recipes` drives the
local app, against the live origin, phone width first:

```bash
shot() { chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=390,844 --virtual-time-budget=10000 --screenshot="$1" "${@:3}" "$2" 2>/dev/null; }
shot /tmp/home.png       https://rabble.rodeo/
shot /tmp/home-dark.png  https://rabble.rodeo/ --force-dark-mode
shot /tmp/stations.png   https://rabble.rodeo/stations
shot /tmp/downloads.png  https://rabble.rodeo/downloads
ID=$(curl -s https://rabble.rodeo/api/spaces | jq -r '(.spaces[] | select(.status=="live") | .id) // .spaces[0].id')
shot /tmp/show.png "https://rabble.rodeo/show/$ID"
shot /tmp/show-desktop.png "https://rabble.rodeo/show/$ID" --window-size=1280,900
```

Look at each PNG and judge it as a user would: content missing or stuck on
a skeleton, text cut off or overflowing the viewport, overlapping elements,
unreadable contrast in dark mode, a button that leads nowhere, an error
banner. Then read the DOM of anything suspicious
(`chromium --headless=new --no-sandbox --dump-dom URL`) to name the element.

If a show is live, join it as an anonymous listener (the script already
called the join API; in the browser, open the show page and press Listen
with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`)
and screenshot the room. A listener must not be asked for microphone
access.

Not problems: no live shows, pages that need a Bluesky login (`/me`,
creating a show, host controls), audio quality, and anything the Android or
iOS apps do.

## 3. File issues

List what is already open so the same problem is not filed twice:

```bash
gh api 'repos/rothgar/rabble.radio/issues?labels=qa&state=open&per_page=100' --jq '.[] | "\(.number)\t\(.title)"'
```

Use `gh api` only (REST); `gh issue ...` uses GraphQL, which this box's
credential does not cover. For each distinct problem:

- **Already open** (same page or route and the same symptom): add one
  comment: `Still present on <UTC date>: <one line of evidence>`.
  ```bash
  gh api -X POST repos/rothgar/rabble.radio/issues/<N>/comments -f body="..."
  ```
- **New**: create it with labels `bug` and `qa`:
  ```bash
  gh api -X POST repos/rothgar/rabble.radio/issues \
    -f title='QA: <symptom> on <page or route>' \
    -f 'labels[]=bug' -f 'labels[]=qa' -F body=@/tmp/issue.md
  ```

An issue body is at most 15 lines:

```
**Where:** https://rabble.rodeo/<path> (phone width / desktop / API)
**Observed:** <exact status, body excerpt or what the screenshot shows>
**Expected:** <one sentence>
**Reproduce:** <curl command or URL plus the one click>
**Found by:** qa-live run <UTC timestamp>
```

The title is the symptom, not the cause: "QA: stations page shows an empty
list while /api/spaces returns 4 shows", not "QA: bug in stations". One
issue per problem, at most five per run; if more turn up, file the five
most user-visible and mention the rest in the fifth. A run with nothing
wrong files nothing.

## 4. Finish

End with a short summary in the terminal: checks run, screenshots taken,
issues opened or updated (numbers), and anything skipped. Then stop; the
manager triages the issues from here.
