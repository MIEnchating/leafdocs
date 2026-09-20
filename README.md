# LeafDocs

独立的文档服务，提供公开阅读页与登录后的在线块编辑工作台。站点名称、图标和简介可在后台的「站点设置」中修改，无需绑定其他产品。

## 文档导入与导出

在后台侧栏或文档的「更多操作」中打开 **导入与导出**。

- **Markdown**：可一次导入多个 `.md` / `.markdown` 文件，首行一级标题或文件名作为文档标题；可将当前文档导出为 Markdown。常见标题、列表、代码和表格可转换，部分块样式会简化。图片使用 HTTPS 链接；导出时本地图片会转为当前站点的绝对链接，不嵌入图片文件。
- **JSON**：导出当前文档或全部文档，保留当前草稿、目录、块数据及站内上传图片；重新导入时恢复目录并复制图片。它是文档内容备份，不包含账号、站点设置、发布快照或历史版本；完整灾备仍需备份数据库和上传目录。
- **导入行为**：每次创建新草稿，不覆盖已有文档、不自动发布；重名访问路径会自动调整。单次最多 200 篇、25 MB。导出前会先保存当前修改；保存失败时会停止导出，避免遗漏修改。

使用已有反向代理时，请将请求体大小限制设为至少 25 MB，以便导入包含图片的 JSON 文件。

## Docker 部署（无需克隆项目）

服务器只需 Docker Engine、Compose 插件、Bash、curl 和 openssl，不需要 Node.js、Git 或项目源码。使用已有 Nginx 提供 HTTPS；安装脚本只启动应用与 PostgreSQL，不占用 80/443。

下载并运行部署脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/MIEnchating/leafdocs/main/deploy.sh -o leafdocs-deploy.sh
bash leafdocs-deploy.sh --network newapi_default
```

`newapi_default` 替换成 **Nginx 容器实际连接的已有网络**；脚本不会创建这个外部网络。Nginx 运行在宿主机时，使用 `--network -`。首次安装会询问域名、管理员邮箱和密码（至少 12 字节），数据库密码自动生成。

默认部署目录是 `~/leafdocs`，仅保存脚本、Compose 配置、`.env` 和网络选择记录；可用 `--dir /你的目录` 指定其他目录。脚本不下载项目源码，也不自动安装或修改系统服务。

**首次启动自动创建管理员，无需执行 `db:seed`。** 首次凭据缺失或格式无效时，应用会明确报错而不会以无法登录的状态启动。已有管理员时会保留原账号密码，修改 `.env` 不会重置密码或新增账号。默认文档库为空，可在后台新建或导入内容。

### 配置现有 Nginx

域名 DNS 指向服务器，为与 `.env` 中 `DOMAIN` 一致的域名配置 HTTPS 证书。Nginx 容器与应用共享指定网络后，反代目标为 `http://leafdocs-backend:3210`：

```nginx
client_max_body_size 25m;
location / {
    proxy_pass http://leafdocs-backend:3210;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
}
```

Nginx 在宿主机运行时，目标改为 `http://127.0.0.1:3210`。本机 3210 端口已占用时，在 `.env` 添加 `LEAFDOCS_PORT=3211` 并重新运行脚本，宿主机反代目标也改为 3211；容器网络中的目标仍为 `leafdocs-backend:3210`。数据库只连接内部网络，不向主机发布端口。

打开 `https://你的域名/admin`，使用首次配置的邮箱密码登录。生产登录依赖 HTTPS。

### 已有部署迁移到脚本

如果此前已经在 `~/leafdocs/deploy` 配置了 `.env`，直接指定这个目录和 Nginx 网络：

```bash
bash leafdocs-deploy.sh --dir "$HOME/leafdocs/deploy" --network newapi_default
```

脚本保留已有 `.env`，复用原来的 `leafdocs_database` 和 `leafdocs_uploads` 数据卷；变更前的 Compose 文件保存为 `compose.previous.yaml`。旧的 `compose.override.yaml` 不会被删除，但脚本明确指定 Compose 文件，不会合并旧 override。不要删除 `.env` 或数据卷，也无需重新导入文档。

若旧的 LeafDocs Caddy 容器仍在运行，可执行 `docker stop leafdocs-caddy-1` 停止它；无需停止其他服务的 Nginx，也不需要删除数据库或图片卷。

### 更新、日志与备份

后续直接运行部署目录中的脚本，无需 Git：

```bash
bash ~/leafdocs/deploy.sh update
bash ~/leafdocs/deploy.sh status
bash ~/leafdocs/deploy.sh logs
```

使用自定义目录或从旧版迁移时，每次带上同一个 `--dir`，例如：

```bash
bash ~/leafdocs/deploy/deploy.sh update --dir "$HOME/leafdocs/deploy"
```

更新镜像保留账号、文档和图片。需要更新脚本本身时，重新下载并使用相同的 `--dir` 和网络参数运行。升级前备份数据；在实际部署目录执行：

```bash
mkdir -p backups
chmod 700 backups
docker compose -p leafdocs -f compose.yaml exec -T db pg_dump -U leafdocs -d leafdocs -Fc > backups/database.dump
docker compose -p leafdocs -f compose.yaml exec -T app tar -czf - -C /app/.data uploads > backups/uploads.tar.gz
```

把备份另存到服务器以外的位置。不要执行 `docker compose down -v`，它会删除数据卷。

## 自动发布 Docker Hub 镜像

GitHub Actions 工作流位于 `.github/workflows/dockerhub.yml`，只推送到 [Docker Hub：mienvirtuoso/leafdocs](https://hub.docker.com/r/mienvirtuoso/leafdocs)，不发布到 GitHub Packages / GHCR。

在 Docker Hub 创建具有 **Read & Write** 权限的 Access Token，并在仓库的 **Settings → Secrets and variables → Actions** 中创建 Secret `DOCKERHUB_TOKEN`。用户名已设置为 `mienvirtuoso`。首次镜像发布成功后，服务器才能拉取镜像；确保 Docker Hub 仓库为公开，私有仓库需要先在服务器执行 `docker login`。

推送到 `main` 自动发布 `latest` 和 `sha-完整提交号` 标签；推送 `v1.2.3` 这样的版本标签会发布 `1.2.3` 和提交号标签。也可在 Actions 页面手动运行 **Publish Docker Hub image**。镜像包含 `linux/amd64` 和 `linux/arm64` 两种架构。

如需固定版本，在部署目录的 `.env` 中设置 `LEAFDOCS_IMAGE=mienvirtuoso/leafdocs:1.2.3`，再运行部署脚本的 `update` 命令。

## 本机开发

```bash
npm install
npm run db:dev       # 创建隔离的 PostgreSQL；首次登录信息写入 .data/local-admin.txt
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3210
```

编辑入口为 `/admin`，访客入口为 `/`。编辑器支持 BlockNote 块编辑、图片上传、自动保存草稿、预览、版本历史、恢复、发布和撤下发布。只有已发布快照会出现在公开页面。

每篇文档的标题和图标可在正文上方直接编辑；页面设置负责访问路径与所属目录。整站提供三款浅色和三款暗色主题，代码配色可独立选择。已有示例文档属于内容数据，可在工作台自行编辑或删除。

通用组件位于 `src/components/ui/`：Radix 菜单、选择器、浮层、图标选择器和异步确认框。`SurfaceDialog` 使用浏览器顶层模态框并管理焦点与滚动锁；其中的 Radix 浮层自动挂载到模态框内部。

生产环境配置 `.env` 中的 `DATABASE_URL`、`APP_URL`、`ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，使用 PostgreSQL 运行 `npm run db:migrate`；不要提交 `.env` 或本机凭据。

从其他电脑访问开发站点时，`APP_URL` 必须与浏览器中的协议、主机、端口一致，例如 `http://服务器IP:3210`。它同时决定登录来源校验和开发资源允许的主机，不要通过关闭来源校验解决登录问题。生产环境使用 HTTPS，生产会话 Cookie 强制设置 Secure。

登录使用 POST，即使 JavaScript 尚未加载或被禁用，也可提交并跳转后台。旧版包含邮箱或密码的登录 URL 会重定向到干净的 `/login`。登录测试读取本机 `.env`，禁用 trace 和截图以避免记录凭据：`npm run test:e2e -- tests/login.spec.ts --project=chromium`。覆盖登录/退出、无 JavaScript 登录、错误登录、来源拦截与 URL 清理。实现参考 OWASP Authentication、Session Management 和 CSRF Prevention Cheat Sheets；开发环境 HTTP 不能代替生产 HTTPS。

## 滚动回归检查

先启动本机数据库和开发站点，再运行：

```bash
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

覆盖代码横向滚动、页面纵向滚动、横向边界、嵌套面板和移动端溢出。Shift + 滚轮的横向映射只在 Chromium 中断言；其他浏览器验证原生水平滚动手势。
