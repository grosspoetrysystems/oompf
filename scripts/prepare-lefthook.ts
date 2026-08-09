if (!(Bun.which("git") && Bun.which("lefthook"))) {
  process.exit(0);
}

const repository = Bun.spawnSync(
  ["git", "rev-parse", "--is-inside-work-tree"],
  {
    stderr: "ignore",
    stdout: "ignore",
  }
);

if (repository.exitCode === 0) {
  Bun.spawnSync(["lefthook", "install"], {
    stderr: "inherit",
    stdout: "inherit",
  });
}
