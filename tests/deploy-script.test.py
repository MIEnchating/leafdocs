"""Run: python3 tests/deploy-script.test.py. Downloads are mocked; no Docker starts."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix="leafdocs-deploy-test-") as directory:
    temp = Path(directory)
    bin_dir = temp / "bin"
    bin_dir.mkdir()
    curl = bin_dir / "curl"
    curl.write_text('''#!/usr/bin/env python3
import os, pathlib, shutil, sys
args = sys.argv[1:]
url = next(arg for arg in args if arg.startswith('https://'))
name = url.rsplit('/', 1)[1]
assert url == 'https://raw.githubusercontent.com/MIEnchating/leafdocs/main/deploy/' + name
if os.environ.get('FAIL_DOWNLOAD') == name:
    sys.exit(22)
output = pathlib.Path(args[args.index('-o') + 1])
shutil.copyfile(pathlib.Path(os.environ['DEPLOY_TEST_ROOT']) / 'deploy' / name, output)
''')
    curl.chmod(0o755)
    docker = bin_dir / "docker"
    docker.write_text('''#!/usr/bin/env python3
import os, pathlib, sys
pathlib.Path(os.environ['DEPLOY_TEST_DOCKER']).touch()
sys.exit(99)
''')
    docker.chmod(0o755)
    env = {
        **os.environ,
        "PATH": str(bin_dir) + ":" + os.environ["PATH"],
        "DEPLOY_TEST_ROOT": str(ROOT),
        "HOME": str(temp / "test home"),
        "DEPLOY_TEST_DOCKER": str(temp / "docker-called"),
    }

    def run(*args, **overrides):
        return subprocess.run(
            ["bash", str(ROOT / "deploy.sh"), *args],
            env={**env, **overrides}, capture_output=True, text=True, timeout=10,
        )

    deploy = Path(env["HOME"]) / "leafdocs"
    result = run()
    assert result.returncode == 0, result.stderr
    assert "创建部署目录" in result.stdout
    assert set(p.name for p in deploy.iterdir()) == {"docker-compose.yml", ".env"}
    assert (deploy / ".env").read_bytes() == (ROOT / "deploy/.env.example").read_bytes()
    assert (deploy / ".env").stat().st_mode & 0o777 == 0o600
    assert "nano .env" in result.stdout
    assert "docker compose -f docker-compose.yml pull" in result.stdout
    assert "docker compose -f docker-compose.yml up -d --wait" in result.stdout

    original_env = (
        "DOMAIN=docs.example.com\nPOSTGRES_PASSWORD=originalDatabasePassword123\n"
        "ADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD='Long$pass#with space'\n"
        "PROXY_NETWORK=custom_nginx_network\n"
    )
    (deploy / ".env").write_text(original_env)
    (deploy / "docker-compose.yml").write_text("old custom configuration\n")
    (deploy / "compose.yaml").write_text("legacy compose\n")
    (deploy / "compose.override.yaml").write_text("legacy override\n")
    result = run()
    assert result.returncode == 0, result.stderr
    assert "更新部署目录" in result.stdout
    assert (deploy / ".env").read_text() == original_env
    backups = list(deploy.glob("docker-compose.yml.backup.*"))
    assert len(backups) == 1 and backups[0].read_text() == "old custom configuration\n"
    assert (deploy / "docker-compose.yml").read_bytes() == (ROOT / "deploy/docker-compose.yml").read_bytes()
    assert (deploy / "compose.yaml").read_text() == "legacy compose\n"
    assert (deploy / "compose.override.yaml").read_text() == "legacy override\n"
    assert run().returncode == 0
    assert list(deploy.glob("docker-compose.yml.backup.*")) == backups

    for filename in ["docker-compose.yml", ".env.example"]:
        before = {p.name: p.read_bytes() for p in deploy.iterdir()}
        result = run(FAIL_DOWNLOAD=filename)
        assert result.returncode != 0
        assert {p.name: p.read_bytes() for p in deploy.iterdir()} == before
        fresh = temp / ("failed-" + filename)
        assert run(HOME=str(fresh), FAIL_DOWNLOAD=filename).returncode != 0
        assert not list((fresh / "leafdocs").iterdir())

    assert run("--help").returncode == 0
    assert run("--dir", str(temp / "custom")).returncode != 0
    assert not (temp / "custom").exists()
    assert run("update").returncode != 0
    assert not (temp / "docker-called").exists(), "Script must never invoke Docker"
    print("PASS: create directory, update with backup, preserve .env, manual commands, failed downloads, no Docker calls")

    # Parse with the real Compose plugin, without creating networks or containers.
    real_docker = shutil.which("docker")
    if not real_docker:
        raise RuntimeError("Docker Compose is required to validate the template")
    config_env = {k: v for k, v in os.environ.items() if k not in {
        "DOMAIN", "POSTGRES_PASSWORD", "ADMIN_EMAIL", "ADMIN_PASSWORD", "PROXY_NETWORK", "LEAFDOCS_IMAGE",
    }}
    parsed = subprocess.run([
        real_docker, "compose", "--env-file", str(deploy / ".env"),
        "-f", str(deploy / "docker-compose.yml"), "config", "--format", "json",
    ], env=config_env, capture_output=True, text=True, check=True)
    cfg = json.loads(parsed.stdout)
    assert cfg["name"] == "leafdocs"
    assert set(cfg["services"]) == {"app", "db"}
    assert set(cfg["services"]["db"]["networks"]) == {"default"}
    assert set(cfg["services"]["app"]["networks"]) == {"default", "proxy"}
    assert cfg["networks"]["proxy"]["name"] == "custom_nginx_network"
    assert cfg["networks"]["proxy"]["external"] is True
    assert cfg["services"]["app"]["networks"]["proxy"]["aliases"] == ["leafdocs-backend"]
    assert all(not s.get("ports") for s in cfg["services"].values())
    assert cfg["volumes"]["database"]["name"] == "leafdocs_database"
    assert cfg["volumes"]["uploads"]["name"] == "leafdocs_uploads"
    assert cfg["services"]["app"]["environment"]["ADMIN_PASSWORD"].replace("$$", "$") == "Long$pass#with space"
    print("PASS: Compose syntax, custom proxy network, isolated database, stable volumes, password characters")
