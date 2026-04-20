# NearMe — Claude Code Context

Auto-read by Claude Code sessions in this repo. See [README.md](./README.md) for human-readable docs.

## Workflow rules

1. **Ask yes/no before anything that hits production or destroys git state.** That includes: pushing to `main`, reverts, force-pushes, `git clean`, `rm -rf`, Vercel production redeploys, DB migrations. Outlining a plan is not permission to execute.
2. **Test on the `test` branch first** for non-trivial changes. Merge to `main` only after explicit approval and a preview check.
3. **Don't test pipeline changes against rural addresses only.** Urban + rural sanity-check is the rule. The founder's own address has been broken in production before by rural-only testing.
4. **Keep updates during work terse.** Long narratives slow the user down — short status messages preferred.

## Dev environment

- Git identity: globally configured to `41998050+thinlyspread@users.noreply.github.com` (required by Vercel's commit-author check).
- Package manager: npm.
- Node version: 24.x (Vercel default).

## Key NearMe gotchas — don't relearn these

Full list in [README.md](./README.md#gotchas). Five things in particular:

1. Don't add `source=outdoor` to Street View **metadata** calls (silently drops urban coverage — only OK on image endpoints).
2. Don't loosen the street-name regex in `src/lib/api.js` `getStreetName` — it filters out motorways etc. on purpose.
3. Don't relax `VISION_CONFIG.minScoreToAccept: 3` — it's tuned.
4. `getCoordinateHash` uses `toFixed(4)` (~10 m) deliberately. Don't widen it for shared cache without redesigning the distance filter.
5. Cloud Vision has a 100/min-per-IP rate limit — aggressive sampling strategies blow it silently on replay.

## Cross-game rules

See the [playbook](https://github.com/Pegsy-Games/playbook/blob/main/LESSONS_LEARNED.md) for platform rules (Vercel, git, env vars) that apply to every Pegsy Games project.
