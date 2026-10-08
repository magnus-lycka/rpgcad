"""Run the same complete, read-only checks locally, in pre-commit, and in CI."""

# Invoke only the fixed local check commands below.
import subprocess  # nosec B404

COMMANDS = (
    ("uv", "lock", "--check"),
    ("uv", "run", "--locked", "ruff", "check", "."),
    ("uv", "run", "--locked", "ruff", "format", "--check", "."),
    ("uv", "run", "--locked", "ty", "check"),
    (
        "uv",
        "run",
        "--locked",
        "bandit",
        "-c",
        "pyproject.toml",
        "-r",
        "prototype",
        "scripts",
    ),
    ("uv", "run", "--locked", "deptry", "."),
    ("uv", "run", "--locked", "pytest"),
    ("npm", "run", "check"),
)


def main() -> int:
    for command in COMMANDS:
        print(f"\n> {' '.join(command)}", flush=True)
        # These commands are fixed above, with no user-supplied arguments.
        result = subprocess.run(command, check=False)  # nosec B603
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
