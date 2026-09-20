# LeafDocs

独立的文档服务，提供公开阅读页与登录后的在线块编辑工作台。站点名称、图标和简介可在后台的「站点设置」中修改，无需绑定其他产品。

## 文档导入与导出

在后台侧栏或文档的「更多操作」中打开 **导入与导出**。

- **Markdown**：可一次导入多个 `.md` / `.markdown` 文件，首行一级标题或文件名作为文档标题；可将当前文档导出为 Markdown。常见标题、列表、代码和表格可转换，部分块样式会简化。图片使用 HTTPS 链接；导出时本地图片会转为当前站点的绝对链接，不嵌入图片文件。
- **JSON**：导出当前文档或全部文档，保留当前草稿、目录、块数据及站内上传图片；重新导入时恢复目录并复制图片。它是文档内容备份，不包含账号、站点设置、发布快照或历史版本；完整灾备仍需备份数据库和上传目录。
- **导入行为**：每次创建新草稿，不覆盖已有文档、不自动发布；重名访问路径会自动调整。单次最多 200 篇、25 MB。导出前会先保存当前修改；保存失败时会停止导出，避免遗漏修改。

使用已有反向代理时，请将请求体大小限制设为至少 25 MB，以便导入包含图片的 JSON 文件。

## 部署到自己的服务器

提供 Docker Compose 配置，包含应用、PostgreSQL 和自动申请/续期 HTTPS 证书的 Caddy。应用直接拉取 Docker Hub 镜像 `mienvirtuoso/leafdocs:latest`，支持 amd64 / arm64，无需在服务器上构建。准备一台安装了 Git、Docker Engine 和 Compose 插件的 Linux 服务器，建议至少 2 GB 内存。安装 Docker 可参考 [官方文档](https://docs.docker.com/engine/install/)。

先把域名（例如 `docs.example.com`）的 A 记录指向服务器公网 IP；若配置了 AAAA 记录，也必须指向可用的 IPv6 地址。放行服务器防火墙和云安全组的 TCP 80、443 端口，并确保没有其他服务占用这两个端口。使用直连 DNS 完成首次部署。

```bash
git clone https://github.com/MIEnchating/leafdocs.git
cd leafdocs/deploy
cp .env.example .env
chmod 600 .env
openssl rand -hex 32   # 生成数据库密码
openssl rand -hex 24   # 生成管理员密码
nano .env
```

在 `.env` 中填写域名、生成的两个不同密码和管理员邮箱：

```dotenv
DOMAIN=docs.example.com
POSTGRES_PASSWORD=填入生成的数据库密码
ADMIN_EMAIL=你的邮箱
ADMIN_PASSWORD=填入生成的管理员密码
```

`DOMAIN` 只填域名，不含协议或路径。数据库密码使用生成的十六进制字符串，避免连接 URL 中的特殊字符。然后在 `deploy` 目录执行：

```bash
docker compose pull
docker compose up -d --wait
```

这两条命令会下载镜像、自动迁移数据库并启动 HTTPS。

### 设置管理员账号和密码（首次部署必做）

**没有默认管理员账号或默认密码。** `deploy/.env` 中的 `ADMIN_EMAIL` 就是登录账号，`ADMIN_PASSWORD` 就是你选择的登录密码；必须在首次启动前填写，密码至少 12 字节，建议使用上面生成的随机密码。例如：

```dotenv
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD='替换为你自己生成的强密码'
```

容器启动成功后，在 `deploy` 目录执行初始化，账号才会真正写入数据库：

```bash
docker compose exec app npm run db:seed
```

看到“已创建管理员账号”后，访问 `https://你的域名/admin`，使用 `.env` 中填写的邮箱和密码登录。此命令同时创建示例文档，只在首次安装时执行。若首次创建账号前又修改了 `.env`，先执行 `docker compose up -d --wait`，让容器加载新配置，再执行初始化。

打开 `https://你的域名` 阅读文档。生产登录依赖 HTTPS，请使用域名访问。

数据库、图片和证书保存在 Docker 命名卷中，更新和普通重启会保留。修改 `.env` 中的管理员密码不会重置已有账号。此方式安装的是全新站点，本机已有文档与图片需要另行迁移。

日常操作（均在 `deploy` 目录执行）：

```bash
docker compose ps                 # 查看运行状态
docker compose logs --tail=100 app caddy  # 查看应用和证书日志
git pull --ff-only
docker compose pull               # 下载新镜像
docker compose up -d --wait        # 使用新镜像启动
```

更新前备份数据库和图片；不要执行 `docker compose down -v`，它会删除数据卷。备份示例：

```bash
mkdir -p backups
chmod 700 backups
docker compose exec -T db pg_dump -U leafdocs -d leafdocs -Fc > backups/database.dump
docker compose exec -T app tar -czf - -C /app/.data uploads > backups/uploads.tar.gz
```

将备份另存到服务器以外的位置。若服务器已有 Nginx、宝塔或 1Panel 管理 80/443，请先调整反向代理方案，避免与此配置中的 Caddy 冲突。

## 自动发布 Docker Hub 镜像

GitHub Actions 工作流位于 `.github/workflows/dockerhub.yml`，只推送到 [Docker Hub：mienvirtuoso/leafdocs](https://hub.docker.com/r/mienvirtuoso/leafdocs)，不发布到 GitHub Packages / GHCR。

在 Docker Hub 创建具有 **Read & Write** 权限的 Access Token，并在仓库的 **Settings → Secrets and variables → Actions** 中创建 Secret `DOCKERHUB_TOKEN`。用户名已设置为 `mienvirtuoso`。首次镜像发布成功后，服务器才能拉取镜像；确保 Docker Hub 仓库为公开，私有仓库需要先在服务器执行 `docker login`。

推送到 `main` 自动发布 `latest` 和 `sha-完整提交号` 标签；推送 `v1.2.3` 这样的版本标签会发布 `1.2.3` 和提交号标签。也可在 Actions 页面手动运行 **Publish Docker Hub image**。镜像包含 `linux/amd64` 和 `linux/arm64` 两种架构。

如需固定版本，在 `deploy/.env` 中设置 `LEAFDOCS_IMAGE=mienvirtuoso/leafdocs:1.2.3`，再执行 `docker compose pull && docker compose up -d --wait`。

## 一键部署到 Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMIEnchating%2Fleafdocs)

仓库内的 `render.yaml` 会一起创建 Node.js 服务、PostgreSQL 数据库和用于保存上传图片的持久化磁盘。使用付费 Web / 数据库实例和磁盘，具体费用以 Render 创建页面为准。

1. 点击上面的 **Deploy to Render** 按钮，登录 Render 并授权 GitHub。
2. 确认使用 [MIEnchating/leafdocs](https://github.com/MIEnchating/leafdocs) 仓库的部署模板；如需维护自己的版本，可先 Fork，再通过 [Render Blueprint](https://dashboard.render.com/select-repo?type=blueprint) 选择自己的仓库。私有仓库也可通过此入口部署。
3. 填写 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`（至少 12 字节，建议使用至少 16 位随机密码），确认资源和费用后点击部署。
4. 首次部署钩子完成后，打开分配的 HTTPS 地址；访问 `/admin`，使用上面的账号登录。首次部署会创建管理员与示例文档。

专属一键部署链接：[部署 LeafDocs](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMIEnchating%2Fleafdocs)。

部署会自动运行数据库迁移，并使用 Render 分配的域名进行登录来源校验；后续推送到关联分支会自动重新部署。示例数据仅在首次部署时初始化，日常重启不会恢复已删除的文档。图片保存在持久化磁盘中，重新部署不会丢失。数据库与磁盘仍需分别备份。

绑定自定义域名后，在 Render 环境变量中设置 `APP_URL=https://你的域名` 并重新部署；登录和编辑请统一使用该域名。初始化失败时，在服务 Shell 中运行 `npm run db:seed` 并检查日志；此命令保留已有管理员密码。修改环境变量中的 `ADMIN_PASSWORD` 不会重置已有密码。

此部署创建全新站点；本机 `.data`、已编辑的数据库内容和 `.env` 不会随 Git 推送上传。现有文档需要单独迁移数据库和上传目录。由于站点包含后台、数据库与本地图片存储，不能直接作为 GitHub Pages 静态站点部署；迁移到 Vercel 等无持久化文件系统的平台前，需要先接入外部对象存储。

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
