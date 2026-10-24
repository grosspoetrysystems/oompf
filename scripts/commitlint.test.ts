import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const signOff = "Signed-off-by: Jane Doe <jane@example.com>";

const runCommitlint = async (message: string) => {
  const directory = await mkdtemp(join(tmpdir(), "oompf-commitlint-"));
  const file = join(directory, "COMMIT_EDITMSG");
  await Bun.write(file, message);

  try {
    return Bun.spawnSync(
      ["bunx", "--no-install", "commitlint", "--edit", file],
      {
        cwd: join(import.meta.dir, ".."),
        stderr: "ignore",
        stdout: "ignore",
      }
    ).exitCode;
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

const signed = (subject: string, trailers = signOff) =>
  `${subject}\n\n${trailers}\n`;

test("accepts signed commits with one-line subjects and breaking markers", async () => {
  expect(await runCommitlint(signed("fix(GPS-123): stop crashing"))).toBe(0);
  expect(await runCommitlint(signed("chore: bump deps"))).toBe(0);
  expect(
    await runCommitlint(
      signed(
        "feat(GPS-123)!: change the API",
        `${signOff}\nSigned-off-by: John Doe <john@example.com>`
      )
    )
  ).toBe(0);
});

test("rejects unsigned, prose-body, malformed-signature, and footer commits", async () => {
  const messages = {
    "breaking footer": signed(
      "fix(GPS-123): stop crashing",
      `BREAKING CHANGE: nope\n${signOff}`
    ),
    "missing @": signed(
      "fix(GPS-123): stop crashing",
      "Signed-off-by: Jane Doe <jane.example.com>"
    ),
    "missing email": signed(
      "fix(GPS-123): stop crashing",
      "Signed-off-by: Jane Doe <>"
    ),
    prose: `fix(GPS-123): stop crashing\n\nReason: explain the change\n\n${signOff}\n`,
    "unrelated footer": signed(
      "fix(GPS-123): stop crashing",
      `Refs: #123\n${signOff}`
    ),
    unsigned: "fix(GPS-123): stop crashing\n",
    "unsigned breaking footer":
      "fix(GPS-123): stop crashing\n\nBREAKING CHANGE: nope\n",
    "whitespace-only signer": signed(
      "fix(GPS-123): stop crashing",
      "Signed-off-by:  <jane@example.com>"
    ),
  };

  for (const message of Object.values(messages)) {
    expect(await runCommitlint(message)).not.toBe(0);
  }
});

const invalidHeaders = {
  "invalid scope": "fix(core): add search",
  "long subject": `fix(GPS-123): ${"a".repeat(90)}`,
  "trailing period": "fix(GPS-123): add search.",
  "unknown type": "feature(GPS-123): add search",
  "uppercase subject": "fix(GPS-123): Add search",
  "uppercase type": "Fix(GPS-123): add search",
};

for (const [name, subject] of Object.entries(invalidHeaders)) {
  test(`rejects ${name} headers`, async () => {
    expect(await runCommitlint(signed(subject))).not.toBe(0);
  });
}
