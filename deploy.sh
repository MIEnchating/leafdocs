#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

install_dir="${HOME}/leafdocs"
base_url="https://raw.githubusercontent.com/MIEnchating/leafdocs/main/deploy"
usage() {
  cat <<'HELP'
用法：bash leafdocs-deploy.sh [--help]

固定目录：$HOME/leafdocs。目录不存在时创建，存在时更新 docker-compose.yml。
下载环境变量示例并保存为 .env；已有 .env 保持不变。
脚本只准备配置文件，配置、拉取镜像和启动由你手动执行。
HELP
}
while (($#)); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
done
command -v curl >/dev/null || { echo '请先安装 curl。' >&2; exit 1; }

if [[ -d "$install_dir" ]]; then
  printf '更新部署目录：%s\n' "$install_dir"
else
  mkdir -p -- "$install_dir"
  printf '创建部署目录：%s\n' "$install_dir"
fi
install_dir="$(cd -- "$install_dir" && pwd)"
temp_dir="$(mktemp -d "$install_dir/.deploy-XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT

# Both downloads must succeed before touching existing deployment files.
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 \
  "$base_url/docker-compose.yml" -o "$temp_dir/docker-compose.yml"
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 \
  "$base_url/.env.example" -o "$temp_dir/.env"
[[ -s "$temp_dir/docker-compose.yml" && -s "$temp_dir/.env" ]] || { echo '下载文件为空，请重试。' >&2; exit 1; }

if [[ -e "$install_dir/docker-compose.yml" ]] && ! cmp -s "$install_dir/docker-compose.yml" "$temp_dir/docker-compose.yml"; then
  backup_file="$(mktemp "$install_dir/docker-compose.yml.backup.XXXXXX")"
  cp -- "$install_dir/docker-compose.yml" "$backup_file"
  printf '旧 Compose 已备份：%s\n' "$backup_file"
fi
mv -- "$temp_dir/docker-compose.yml" "$install_dir/docker-compose.yml"
if [[ -e "$install_dir/.env" || -L "$install_dir/.env" ]]; then
  echo '保留已有 .env；请核对域名、管理员配置和 PROXY_NETWORK。'
else
  mv -- "$temp_dir/.env" "$install_dir/.env"
  chmod 600 "$install_dir/.env"
  echo '环境变量示例已保存为 .env，请填写配置。'
fi

cat <<'NEXT'
文件已准备完成。请依次执行（可用你习惯的编辑器替换 nano）：
NEXT
printf '  cd %q\n' "$install_dir"
cat <<'NEXT'
  nano .env
  docker compose -f docker-compose.yml pull
  docker compose -f docker-compose.yml up -d --wait

.env 中填写 DOMAIN、POSTGRES_PASSWORD、ADMIN_EMAIL、ADMIN_PASSWORD，
并将 PROXY_NETWORK 设为 Nginx 容器实际连接的已有网络（默认 newapi_default）。
Nginx 配置 HTTPS，反代目标为 http://leafdocs-backend:3210。
首次启动应用会自动创建管理员；已有账号密码保持不变。
更新会复用 leafdocs_database 和 leafdocs_uploads 数据卷。
若自定义过 Compose，请与备份对照后再启动。始终使用 -f docker-compose.yml。
NEXT
