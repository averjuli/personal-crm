#!/usr/bin/env python3
"""Select staging-verified releases and retain complete GHCR image builds."""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote, urlencode


SHA_PATTERN = re.compile(r"[0-9a-f]{40}")
REPOSITORY = os.environ["GITHUB_REPOSITORY"]


def github_api(path, method="GET"):
    result = subprocess.run(
        ["gh", "api", "--method", method, path],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def github_pages(path, key=None):
    separator = "&" if "?" in path else "?"
    page = 1
    while True:
        response = github_api(f"{path}{separator}per_page=100&page={page}")
        items = response[key] if key else response
        yield from items
        if len(items) < 100:
            return
        page += 1


def select_version():
    if os.environ.get("ROLLBACK") == "true":
        # The server resolves the previous version. Staging history is irrelevant here.
        with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
            output.write("sha=\n")
        return

    requested = os.environ.get("REQUESTED_SHA", "").strip()
    if requested and not SHA_PATTERN.fullmatch(requested):
        raise ValueError("Enter a full, lowercase, 40-character commit SHA")

    # GitHub's status filter can omit recent completed runs. Fetch the branch
    # history and validate status and the requested SHA locally.
    parameters = {"branch": "main"}
    runs_path = f"repos/{REPOSITORY}/actions/workflows/deploy.yml/runs?{urlencode(parameters)}"
    deployments = []
    runs = sorted(
        github_pages(runs_path, "workflow_runs"),
        key=lambda run: run["updated_at"], reverse=True,
    )
    for run in runs:
        # A job cannot finish after its run's last update. Older runs cannot
        # contain a newer success once this bound falls below the best result.
        if deployments and run["updated_at"] < max(deployments)[0]:
            break
        if run["status"] != "completed":
            continue
        if run["event"] not in ("push", "workflow_dispatch"):
            continue
        if requested and run["head_sha"] != requested:
            continue
        jobs_path = f"repos/{REPOSITORY}/actions/runs/{run['id']}/jobs?filter=all"
        for job in github_pages(jobs_path, "jobs"):
            # The second name supports staging runs created before this change.
            if job["name"] in ("Deploy staging", "deploy-staging") and job["conclusion"] == "success":
                deployments.append((job["completed_at"], run["head_sha"], run["html_url"]))

    if not deployments:
        raise ValueError("No successful staging deployment was found for the requested version")
    completed_at, version, run_url = max(deployments)
    if not SHA_PATTERN.fullmatch(version):
        raise ValueError("Staging history returned an invalid commit SHA")
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
        output.write(f"sha={version}\n")
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as summary:
        summary.write(
            f"## Selected production version\n\n"
            f"- SHA `{version}`\n"
            f"- Staging completed `{completed_at}`\n"
            f"- [Successful staging run]({run_url})\n"
        )
    print(f"Selected {version}, verified on staging at {completed_at}")


def prune_registry():
    owner, package = REPOSITORY.lower().split("/", 1)
    repository = github_api(f"repos/{REPOSITORY}")
    namespace = "orgs" if repository["owner"]["type"] == "Organization" else "users"
    package_path = f"{namespace}/{owner}/packages/container/{quote(package, safe='')}"
    versions = list(github_pages(f"{package_path}/versions"))
    builds = sorted(
        (version for version in versions if any(
            SHA_PATTERN.fullmatch(tag) for tag in version["metadata"]["container"]["tags"]
        )),
        key=lambda version: (version["created_at"], version["id"]),
        reverse=True,
    )
    if not builds:
        raise ValueError("No SHA-tagged registry builds were found")

    retained = builds[:10]
    retained_ids = {version["id"] for version in retained}
    # Preserve other tags and their manifests as well as our ten SHA builds.
    other_tagged = [version for version in versions if any(
        not SHA_PATTERN.fullmatch(tag) for tag in version["metadata"]["container"]["tags"]
    )]
    roots = retained + other_tagged
    protected_digests = set()
    pending = [version["name"] for version in roots]

    with tempfile.TemporaryDirectory() as directory:
        docker_environment = dict(os.environ, DOCKER_CONFIG=directory)
        subprocess.run(
            ["docker", "login", "ghcr.io", "--username", os.environ["GITHUB_ACTOR"], "--password-stdin"],
            input=os.environ["GH_TOKEN"], text=True, check=True, capture_output=True,
            env=docker_environment,
        )
        # Read the entire retained graph before deleting anything. OCI indexes
        # reference untagged platform and provenance manifests in GHCR.
        while pending:
            digest = pending.pop()
            if digest in protected_digests:
                continue
            protected_digests.add(digest)
            result = subprocess.run(
                ["docker", "buildx", "imagetools", "inspect", "--raw", f"ghcr.io/{owner}/{package}@{digest}"],
                check=True, capture_output=True, text=True, env=docker_environment,
            )
            manifest = json.loads(result.stdout)
            pending.extend(item["digest"] for item in manifest.get("manifests", []))

    cutoff = min(version["created_at"] for version in retained)
    old_build_ids = {version["id"] for version in builds} - retained_ids
    removed = 0
    for version in versions:
        tags = version["metadata"]["container"]["tags"]
        if version["name"] in protected_digests:
            continue
        # Recent untagged manifests can belong to an image still being published.
        if version["id"] in old_build_ids or (not tags and version["created_at"] < cutoff):
            github_api(f"{package_path}/versions/{version['id']}", "DELETE")
            print(f"Removed registry version {version['name']}")
            removed += 1
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as summary:
        summary.write(f"\nRegistry cleanup kept {len(retained)} SHA builds and removed {removed} old manifests.\n")


def main():
    if sys.argv[1:] == ["select"]:
        select_version()
    elif sys.argv[1:] == ["prune"]:
        prune_registry()
    else:
        raise ValueError("Usage: github-release.py select | prune")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        # API and Docker diagnostics do not contain the token passed through stdin.
        print(error.stderr or str(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
