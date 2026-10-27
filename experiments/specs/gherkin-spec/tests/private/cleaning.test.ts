import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

function scenario(title: string, ...steps: string[]): string {
  return "\n" + `  Scenario: ${title}\n` + steps.map((step) => `    ${step}\n`).join("");
}

// Extends public "[boundary-1] list markers and stray whitespace are removed from criteria"
test("[boundary-1] every marker kind is removed with other text, other spacing and another order", () => {
  const file = generateFeatureFile({
    key: "FIN-30",
    title: "Refunds",
    criteria: [
      "[x] Holds are released",
      "2. Ledgers   balance",
      "-\tRefunds are issued",
      "[ ]   Limits\r\n\r\nare checked",
      "1) Statements are mailed\t\t",
      " \n *   Fees are waived",
      "2) Disputes are logged",
      "1. Chargebacks are flagged",
    ],
  });
  assert.equal(
    file.text,
    "Feature: Refunds\n" +
      scenario("Holds are released", "Then holds are released") +
      scenario("Ledgers balance", "Then ledgers balance") +
      scenario("Refunds are issued", "Then refunds are issued") +
      scenario("Limits are checked", "Then limits are checked") +
      scenario("Statements are mailed", "Then statements are mailed") +
      scenario("Fees are waived", "Then fees are waived") +
      scenario("Disputes are logged", "Then disputes are logged") +
      scenario("Chargebacks are flagged", "Then chargebacks are flagged"),
  );
});

// Extends public "[boundary-1] list markers and stray whitespace are removed from criteria":
// markers come off the start only.
test("[boundary-1] marker characters in the middle or end of a criterion are kept", () => {
  const file = generateFeatureFile({
    key: "FIN-31",
    title: "Fees",
    criteria: ["Fees - if any - are refunded", "Totals * rates are shown -", "Tasks [x] are ticked"],
  });
  assert.equal(
    file.text,
    "Feature: Fees\n" +
      scenario("Fees - if any - are refunded", "Then fees - if any - are refunded") +
      scenario("Totals * rates are shown -", "Then totals * rates are shown -") +
      scenario("Tasks [x] are ticked", "Then tasks [x] are ticked"),
  );
});

// Extends public "[boundary-1] list markers and stray whitespace are removed from criteria":
// cleaning happens before the first word is looked at.
test("[boundary-1] a marker and whitespace are removed before an acronym or steps are recognised", () => {
  const file = generateFeatureFile({
    key: "FIN-32",
    title: "Errors",
    criteria: [
      "- API errors are logged",
      "  * \tGiven a payout\tfailed\nWhen  the job runs  ",
      "[x] V2 payouts are enabled",
    ],
  });
  assert.equal(
    file.text,
    "Feature: Errors\n" +
      scenario("API errors are logged", "Then API errors are logged") +
      scenario(
        "Given a payout failed When the job runs",
        "Given a payout failed",
        "When the job runs",
      ) +
      scenario("V2 payouts are enabled", "Then V2 payouts are enabled"),
  );
});

// Extends public "[boundary-1] the title is cleaned of whitespace but keeps its list marker"
test("[boundary-1] the title keeps other list markers and has its whitespace runs collapsed", () => {
  const cases: [string, string][] = [
    ["[ ] Payout  report", "[ ] Payout report"],
    ["\t1. Payout\r\n\r\nreport ", "1. Payout report"],
    ["* Payouts", "* Payouts"],
    ["2) [x]  Payouts\t", "2) [x] Payouts"],
  ];
  for (const [title, cleaned] of cases) {
    const file = generateFeatureFile({ key: "FIN-33", title, criteria: ["Reports are sent"] });
    assert.equal(
      file.text,
      `Feature: ${cleaned}\n` + scenario("Reports are sent", "Then reports are sent"),
    );
  }
});

// Extends public "[boundary-1] the title is cleaned of whitespace but keeps its list marker":
// list markers are not removed from the title, so it is not empty.
test("[boundary-1] a title that is only a list marker is kept", () => {
  const file = generateFeatureFile({ key: "FIN-34", title: "  -  ", criteria: ["Reports are sent"] });
  assert.equal(file.text, "Feature: -\n" + scenario("Reports are sent", "Then reports are sent"));
});

// Extends public "[boundary-1] a list marker is removed only once"
test("[boundary-1] only the first of two markers of any kind is removed", () => {
  const file = generateFeatureFile({
    key: "FIN-35",
    title: "Markers",
    criteria: ["* * Fees are waived", "[x] [ ] Holds are released", "1. 2) Ledgers balance", "- [x] Limits are checked"],
  });
  assert.equal(
    file.text,
    "Feature: Markers\n" +
      scenario("* Fees are waived", "Then * Fees are waived") +
      scenario("[ ] Holds are released", "Then [ ] Holds are released") +
      scenario("2) Ledgers balance", "Then 2) Ledgers balance") +
      scenario("[x] Limits are checked", "Then [x] Limits are checked"),
  );
});

// Extends public "[boundary-2] empty criteria are skipped and repeated titles are numbered"
test("[boundary-2] numbering continues past three, into two digits", () => {
  const criteria: string[] = [];
  let expected = "Feature: Retries\n";
  for (let i = 1; i <= 11; i++) {
    criteria.push("Payouts are retried");
    expected += scenario(
      i === 1 ? "Payouts are retried" : `Payouts are retried (${i})`,
      "Then payouts are retried",
    );
  }
  const file = generateFeatureFile({ key: "PAY-22", title: "Retries", criteria });
  assert.equal(file.text, expected);
});

// Extends public "[boundary-2] empty criteria are skipped and repeated titles are numbered":
// each title is counted on its own, not with one shared counter.
test("[boundary-2] interleaved repeats are numbered per title", () => {
  const file = generateFeatureFile({
    key: "PAY-23",
    title: "Retries",
    criteria: ["Alpha is sent", "Beta is sent", "Alpha is sent", "Gamma is sent", "Beta is sent", "Alpha is sent"],
  });
  assert.equal(
    file.text,
    "Feature: Retries\n" +
      scenario("Alpha is sent", "Then alpha is sent") +
      scenario("Beta is sent", "Then beta is sent") +
      scenario("Alpha is sent (2)", "Then alpha is sent") +
      scenario("Gamma is sent", "Then gamma is sent") +
      scenario("Beta is sent (2)", "Then beta is sent") +
      scenario("Alpha is sent (3)", "Then alpha is sent"),
  );
});

// Extends public "[boundary-2] empty criteria are skipped and repeated titles are numbered"
test("[boundary-2] empty criteria at the start, end and between produce no scenario and no extra lines", () => {
  const file = generateFeatureFile({
    key: "PAY-24",
    title: "Retries",
    criteria: ["\r\n", "  ", "Alpha is sent", "", "\t", "\n\n", "Beta is sent", " \t\r\n ", ""],
  });
  assert.equal(
    file.text,
    "Feature: Retries\n" +
      scenario("Alpha is sent", "Then alpha is sent") +
      scenario("Beta is sent", "Then beta is sent"),
  );
});

// Extends public "[boundary-2] criteria that differ only before cleaning count as repeated"
test("[boundary-2] repeated criteria written as steps get numbered titles and the same steps", () => {
  const file = generateFeatureFile({
    key: "PAY-25",
    title: "Retries",
    criteria: [
      "Given a payout failed When the job runs",
      "1. Given  a payout failed\nWhen the job runs",
      "[ ] Given a payout\tfailed When the job runs ",
    ],
  });
  const steps = ["Given a payout failed", "When the job runs"];
  assert.equal(
    file.text,
    "Feature: Retries\n" +
      scenario("Given a payout failed When the job runs", ...steps) +
      scenario("Given a payout failed When the job runs (2)", ...steps) +
      scenario("Given a payout failed When the job runs (3)", ...steps),
  );
});

// Extends public "[boundary-2] criteria that differ only before cleaning count as repeated"
test("[boundary-2] every marker kind and whitespace variant counts as the same title", () => {
  const file = generateFeatureFile({
    key: "PAY-26",
    title: "Retries",
    criteria: [
      "* Payouts are retried",
      "[x]\tPayouts are retried",
      "2) Payouts\r\nare retried",
      "  Payouts are   retried  ",
    ],
  });
  assert.equal(
    file.text,
    "Feature: Retries\n" +
      scenario("Payouts are retried", "Then payouts are retried") +
      scenario("Payouts are retried (2)", "Then payouts are retried") +
      scenario("Payouts are retried (3)", "Then payouts are retried") +
      scenario("Payouts are retried (4)", "Then payouts are retried"),
  );
});
