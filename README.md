# LeafDocs

独立的文档服务，提供公开阅读页与登录后的在线块编辑工作台。站点名称、图标和简介可在后台的「站点设置」中修改，无需绑定其他产品。

## 一键部署到 Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/select-repo?type=blueprint)

仓库内的 `render.yaml` 会一起创建 Node.js 服务、PostgreSQL 数据库和用于保存上传图片的持久化磁盘。使用付费 Web / 数据库实例和磁盘，具体费用以 Render 创建页面为准。

1. 将项目推送到自己的 GitHub 仓库。
2. 打开 [Render Blueprint](https://dashboard.render.com/select-repo?type=blueprint)，授权并选择该仓库。私有仓库也可通过此入口部署。
3. 填写 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`（至少 12 字节，建议使用至少 16 位随机密码），确认资源和费用后点击部署。
4. 首次部署钩子完成后，打开分配的 HTTPS 地址；访问 `/admin`，使用上面的账号登录。首次部署会创建管理员与示例文档。

公开仓库可使用专属一键部署链接：`https://render.com/deploy?repo=你的GitHub仓库完整URL`。

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
