// One JSON line per finished test, for sandbox/run.mjs to read. Subtests
// finish before their parent, so the runner, not this file, works out
// which tests are leaves and what their full names are.
export default async function* reporter(source) {
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const { data } = event;
    const error = data.details?.error;
    yield `${JSON.stringify({
      ok: event.type === "test:pass",
      skipped: data.skip !== undefined || data.todo !== undefined,
      name: data.name,
      nesting: data.nesting,
      suite: data.details?.type === "suite",
      error:
        error === undefined
          ? null
          : {
              failureType: error.failureType ?? null,
              code: error.cause?.code ?? error.code ?? null,
              message: String(error.cause?.message ?? error.message ?? ""),
            },
    })}\n`;
  }
}
