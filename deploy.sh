#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Standalone installer: only Docker images and small deployment files are needed.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install_dir="${HOME}/leafdocs"
if [[ -f "$script_dir/.proxy-network" && -f "$script_dir/.env" ]]; then install_dir="$script_dir"; fi
proxy_network=""
network_selected=false
action=install
usage() {
  cat <<'HELP'
Usage: bash deploy.sh [install|update|status|logs] [--dir DIRECTORY] [--network NETWORK]

  --dir       Deployment directory (default: ~/leafdocs).
  --network   Existing Docker network used by your HTTPS proxy; use - for a host proxy.
              A previously selected network is reused on updates.

First installation prompts for the HTTPS domain, administrator email and password.
Existing .env files and the leafdocs_database / leafdocs_uploads volumes are preserved.
HELP
}
while (($#)); do
  case "$1" in
    install|update|status|logs) action="$1"; shift ;;
    --dir|--network)
      if (($# < 2)) || [[ -z "$2" ]]; then usage >&2; exit 1; fi
      if [[ "$1" == --dir ]]; then install_dir="$2"; else proxy_network="$2"; network_selected=true; fi
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
done

for command in docker mktemp; do
  command -v "$command" >/dev/null || { printf '请先安装 %s。\n' "$command" >&2; exit 1; }
done
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo '无法连接 Docker，请检查服务和当前用户权限。' >&2; exit 1; }
if [[ "$action" != install && ! -f "$install_dir/.env" ]]; then
  echo '此目录没有 .env，请先安装或用 --dir 指向已有部署目录。' >&2; exit 1
fi
mkdir -p "$install_dir"
install_dir="$(cd "$install_dir" && pwd)"
compose=(docker compose --project-directory "$install_dir" --env-file "$install_dir/.env" -p leafdocs -f "$install_dir/compose.yaml")
case "$action" in
  status) "${compose[@]}" ps; exit ;;
  logs) "${compose[@]}" logs --tail=100 app db; exit ;;
esac

prompt() {
  local label="$1" target="$2" secret="${3:-false}" value
  if [[ ! -t 0 ]]; then echo '首次安装需要交互终端，请先下载脚本再用 bash 执行。' >&2; exit 1; fi
  if [[ "$secret" == true ]]; then read -r -s -p "$label" value; printf '\n'; else read -r -p "$label" value; fi
  printf -v "$target" '%s' "$value"
}
if [[ "$network_selected" == false ]]; then
  if [[ -f "$install_dir/.proxy-network" ]]; then
    proxy_network="$(cat "$install_dir/.proxy-network")"
  else
    prompt 'Nginx 容器的现有网络名（宿主机反代直接回车）：' proxy_network
  fi
fi
[[ "$proxy_network" != - ]] || proxy_network=""
if [[ -n "$proxy_network" ]]; then
  [[ "$proxy_network" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Docker 网络名格式不正确。' >&2; exit 1; }
  docker network inspect "$proxy_network" >/dev/null 2>&1 || { printf '网络 %s 不存在，请填写 Nginx 容器实际使用的网络。\n' "$proxy_network" >&2; exit 1; }
fi

temp_dir="$(mktemp -d "$install_dir/.deploy-XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT
env_file="$install_dir/.env"
if [[ ! -f "$env_file" ]]; then
  command -v openssl >/dev/null || { echo '首次安装需要 openssl 生成数据库密码，请先安装。' >&2; exit 1; }
  prompt '站点域名（例如 docs.example.com，不含 https://）：' domain
  [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$domain" == *.* ]] || { echo '请填写有效域名。' >&2; exit 1; }
  prompt '管理员邮箱：' admin_email
  [[ "$admin_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ && ${#admin_email} -le 254 ]] || { echo '邮箱格式不正确。' >&2; exit 1; }
  prompt '管理员密码（至少 12 字节，输入不回显）：' admin_password true
  password_bytes="$(LC_ALL=C printf '%s' "$admin_password" | wc -c)"
  ((password_bytes >= 12 && password_bytes <= 1024)) || { echo '密码须为 12 至 1024 字节。' >&2; exit 1; }
  prompt '再次输入管理员密码：' password_confirmation true
  [[ "$admin_password" == "$password_confirmation" ]] || { echo '两次密码不一致。' >&2; exit 1; }
  database_password="$(openssl rand -hex 32)"
  # Compose single-quoted values preserve $, # and backslashes; escape literal quotes.
  write_env() { local value="${2//\'/\\\'}"; printf "%s='%s'\n" "$1" "$value"; }
  {
    write_env DOMAIN "$domain"
    write_env POSTGRES_PASSWORD "$database_password"
    write_env ADMIN_EMAIL "$admin_email"
    write_env ADMIN_PASSWORD "$admin_password"
    write_env LEAFDOCS_IMAGE 'mienvirtuoso/leafdocs:latest'
  } > "$temp_dir/.env"
  env_file="$temp_dir/.env"
  unset admin_password password_confirmation database_password
else
  echo '保留已有 .env；数据库密码和管理员配置不会被覆盖。'
fi

cat > "$temp_dir/compose.yaml" <<'YAML'
name: leafdocs
services:
  db:
    image: postgres:17-bookworm
    restart: unless-stopped
    environment:
      POSTGRES_DB: leafdocs
      POSTGRES_USER: leafdocs
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?请设置数据库密码}
    volumes:
      - database:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U leafdocs -d leafdocs"]
      interval: 5s
      timeout: 5s
      retries: 20
    networks: [default]
  app:
    image: ${LEAFDOCS_IMAGE:-mienvirtuoso/leafdocs:latest}
    restart: unless-stopped
    init: true
    environment:
      DATABASE_URL: postgresql://leafdocs:${POSTGRES_PASSWORD:?请设置数据库密码}@db:5432/leafdocs?schema=public
      APP_URL: https://${DOMAIN:?请设置域名}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
    volumes:
      - uploads:/app/.data/uploads
    ports:
      - "127.0.0.1:${LEAFDOCS_PORT:-3210}:3210"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3210/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 10s
      start_period: 60s
      retries: 5
    networks:
      default: {}
YAML
if [[ -n "$proxy_network" ]]; then
  cat >> "$temp_dir/compose.yaml" <<'YAML'
      proxy:
        aliases: [leafdocs-backend]
YAML
fi
cat >> "$temp_dir/compose.yaml" <<'YAML'
volumes:
  database:
    name: leafdocs_database
  uploads:
    name: leafdocs_uploads
networks:
  default: {}
YAML
if [[ -n "$proxy_network" ]]; then
  printf '  proxy:\n    external: true\n    name: %s\n' "$proxy_network" >> "$temp_dir/compose.yaml"
fi

docker compose --env-file "$env_file" -p leafdocs -f "$temp_dir/compose.yaml" config --quiet
if [[ -f "$install_dir/compose.yaml" ]] && ! cmp -s "$install_dir/compose.yaml" "$temp_dir/compose.yaml"; then
  cp "$install_dir/compose.yaml" "$temp_dir/compose.previous.yaml"
  mv "$temp_dir/compose.previous.yaml" "$install_dir/compose.previous.yaml"
fi
if [[ "$env_file" != "$install_dir/.env" ]]; then mv "$env_file" "$install_dir/.env"; fi
mv "$temp_dir/compose.yaml" "$install_dir/compose.yaml"
printf '%s\n' "$proxy_network" > "$install_dir/.proxy-network"
if [[ -f "$0" && ! "$0" -ef "$install_dir/deploy.sh" ]]; then cp "$0" "$install_dir/deploy.sh"; fi
chmod 600 "$install_dir/.env"

"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 180
echo 'LeafDocs 已启动；首次管理员已自动创建。已有账号和密码保持不变。'
printf '部署目录：%s\n' "$install_dir"
if [[ -n "$proxy_network" ]]; then
  printf '请在连接 %s 网络的 Nginx 中配置 HTTPS，反代到 http://leafdocs-backend:3210\n' "$proxy_network"
else
  echo '请在宿主机反向代理中配置 HTTPS，反代到 http://127.0.0.1:3210（自定义 LEAFDOCS_PORT 时使用对应端口）。'
fi
echo '请求体限制至少设为 25 MB。登录地址为 https://配置的域名/admin。'
