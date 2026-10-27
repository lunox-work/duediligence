# The Codex run judged in RESULTS.md "In CI", blind by placement: inside
# node:22 with only the handout checkout (cloned --single-branch at the
# base commit, so no later history), the brief and the spec mounted; no
# specs/, seal or reference on the container. Run as
#   docker run --rm -e HUSKY=0 -v <checkout>:/work/repo -v <task>:/task:ro \
#     -v <out>:/out -v <codex home with auth.json>:/root/.codex \
#     -v $PWD/run.sh:/run.sh:ro node:22 bash /run.sh
# <task> holds prompt.md (the handout's BRIEF.md, spec path set to
# /task/spec.md, the skill-session audit paragraph dropped) and spec.md.
# Then: git add -A && git commit on a branch, and
#   independent-tests ci --seal limit-jobs-confirmed.seal.gz --repo <checkout> --ref HEAD
set -e
git config --global --add safe.directory '*'
cd /work/repo
npx -y npm@10.9.2 ci --no-audit --no-fund > /out/setup.log 2>&1
for p in packages/core packages/db packages/shared packages/github; do (cd $p && npm run build >> /out/setup.log 2>&1); done
(cd apps/worker && npx tsc -p tsconfig.test.json && node --test "dist-test/test/local-process.test.js" 2>&1 | tail -3) >> /out/setup.log 2>&1 || true
echo "setup done" >> /out/setup.log
npx -y @openai/codex@0.164.0 exec --sandbox danger-full-access -c approval_policy='"never"' --skip-git-repo-check -C /work/repo --json - < /task/prompt.md > /out/codex.jsonl 2> /out/codex.err
echo "codex exit $?" >> /out/setup.log
