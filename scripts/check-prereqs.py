#!/usr/bin/env python3
"""Verify development prerequisites for Archon contributors."""
import subprocess
import sys


def check(label: str, cmd: list[str], min_version: tuple[int, ...]) -> bool:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        version_line = out.splitlines()[0]
        # Extract first dotted version string
        import re
        match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", version_line)
        if not match:
            print(f"  {label}: UNKNOWN version string '{version_line}'")
            return False
        actual = tuple(int(x) for x in match.groups() if x is not None)
        ok = actual >= min_version
        status = "OK" if ok else "TOO OLD"
        print(f"  {label}: {'.'.join(str(x) for x in actual)} ({status})")
        return ok
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"  {label}: NOT FOUND")
        return False


def main() -> int:
    print("Checking Archon development prerequisites:")
    results = [
        check("bun", ["bun", "--version"], (1, 0, 0)),
        check("git", ["git", "--version"], (2, 0, 0)),
        check("docker", ["docker", "--version"], (20, 0, 0)),
    ]
    if all(results):
        print("All prerequisites satisfied.")
        return 0
    print("Some prerequisites are missing or out of date.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
