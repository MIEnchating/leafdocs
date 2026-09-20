import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/server/password";
import { contentText } from "../src/lib/server/validation";

const prisma = new PrismaClient();
const text = (value: string) => [{ type: "text", text: value, styles: {} }];
const p = (value: string) => ({ type: "paragraph", content: text(value) });
const h = (value: string) => ({ type: "heading", props: { level: 2 }, content: text(value) });
const bullet = (value: string) => ({ type: "bulletListItem", content: text(value) });
const code = (value: string, language = "bash") => ({ type: "codeBlock", props: { language }, content: text(value) });

const documents = [
  {
    id: "getting-started", title: "开始使用 New API", slug: "getting-started", icon: "👋", parentId: null,
    content: [
      p("欢迎使用 New API。这里从最小可用配置开始，带你完成渠道接入、访问令牌创建和第一次模型请求。"),
      h("New API 能帮你做什么"),
      p("New API 为不同模型服务提供统一的调用入口。管理员维护上游渠道、模型和用户权限；应用使用 New API 分配的访问令牌调用接口，无需直接持有上游密钥。"),
      bullet("管理员：部署服务，添加可用渠道，配置模型映射、分组与计费设置。"),
      bullet("开发者：创建访问令牌，在应用中配置服务地址和模型名称，然后检查请求日志。"),
      h("开始前准备"),
      bullet("一个可访问的 New API 实例地址，例如 https://api.example.com。"),
      bullet("管理员账号，以及至少一个上游提供商提供的有效 API 密钥。"),
      bullet("确认上游账号余额、模型权限和网络连接可用。"),
      h("推荐阅读顺序"),
      p("先阅读「部署与首次配置」，随后添加渠道，再按照「创建令牌与首次请求」完成一次实际调用。最后了解如何查看日志、保护密钥和排查错误。"),
      h("关于本文档"),
      p("这些文档提供通用入门流程。不同版本的控制台菜单、上游参数和支持能力可能有所不同，请以你正在使用的 New API 版本和提供商文档为准。"),
    ],
  },
  {
    id: "installation", title: "部署与首次配置", slug: "installation", icon: "🚀", parentId: null,
    content: [
      p("先建立一个可以持久保存数据的实例，再完成管理员初始化。下面的 Docker 示例适合本机体验。"),
      h("使用 Docker 启动"),
      code("docker run -d --name new-api \\\n  -p 3000:3000 \\\n  -v \"$PWD/new-api-data:/data\" \\\n  -e TZ=Asia/Shanghai \\\n  calciumion/new-api:latest"),
      p("打开 http://localhost:3000，按初始化向导创建管理员账号。首次初始化时使用唯一的强密码，并妥善保管。生产环境建议固定已验证的镜像版本。"),
      h("确认数据持久化"),
      p("示例把容器的 /data 挂载到当前目录下的 new-api-data。升级或替换容器前先备份持久化目录；使用外部数据库时还需要单独备份数据库。"),
      h("上线前配置"),
      bullet("通过反向代理为服务提供 HTTPS，并设置正确的站点地址。"),
      bullet("根据业务需要设置注册策略、默认分组、额度及请求限制。"),
      bullet("根据并发与可靠性需求配置外部数据库和缓存，具体环境变量请查看对应版本的部署说明。"),
      h("验证实例"),
      p("确认能够登录控制台、访问渠道配置页面，并能查看运行日志。完成这些步骤后，再添加上游渠道进行实际请求测试。"),
    ],
  },
  {
    id: "channels", title: "接入你的第一个渠道", slug: "channels", icon: "🔌", parentId: null,
    content: [
      p("渠道代表 New API 连接上游模型服务的配置。先接通一个模型，再逐步添加其他提供商。"),
      h("创建渠道"),
      bullet("进入管理员控制台的渠道管理，新增渠道并选择对应的提供商类型。"),
      bullet("填写便于识别的名称，并输入上游提供商签发的 API 密钥。"),
      bullet("按照提供商要求设置服务地址；不要在地址末尾重复添加 /v1 或接口路径。"),
      h("设置模型与分组"),
      p("将上游实际支持的模型添加到渠道。对外请求使用的模型名称必须与渠道允许的模型或已配置的模型映射一致。"),
      p("为渠道选择可用分组，并确认使用者或访问令牌可以使用该分组。如果分组不匹配，即使渠道正常也可能无法路由请求。"),
      h("测试连接"),
      p("保存渠道后执行测试。若出现鉴权错误，检查上游密钥及权限；若模型不存在，核对模型名；若网络超时，检查实例到上游服务的网络。"),
      h("日常维护"),
      bullet("及时轮换失效密钥，观察渠道错误率和响应时间。"),
      bullet("新增备用渠道后验证路由规则和分组设置，再投入使用。"),
      bullet("不要把上游 API 密钥写入公开文档、截图或客户端代码。"),
    ],
  },
  {
    id: "first-request", title: "创建令牌与首次请求", slug: "first-request", icon: "🔑", parentId: "getting-started",
    content: [
      p("应用调用 New API 时应使用控制台签发的访问令牌。下面使用 OpenAI 兼容的 Chat Completions 接口完成第一次请求。"),
      h("创建访问令牌"),
      p("进入令牌管理，创建一个用途明确的令牌。按需要设置额度、到期时间、可用模型和分组。复制后存入本地环境变量或密钥管理服务。"),
      h("发送测试请求"),
      code("export NEW_API_BASE_URL='https://api.example.com'\nexport NEW_API_KEY='replace-with-your-new-api-token'\nexport NEW_API_MODEL='replace-with-an-enabled-model'\n\ncurl \"${NEW_API_BASE_URL}/v1/chat/completions\" \\\n  -H \"Authorization: Bearer ${NEW_API_KEY}\" \\\n  -H 'Content-Type: application/json' \\\n  -d \"{\\\"model\\\":\\\"${NEW_API_MODEL}\\\",\\\"messages\\\":[{\\\"role\\\":\\\"user\\\",\\\"content\\\":\\\"你好，请用一句话介绍你自己。\\\"}]}\""),
      p("把示例地址、令牌和模型名替换成你实例中的实际值。服务地址示例是根地址，命令中已附加 /v1/chat/completions。"),
      h("确认结果"),
      p("请求成功后，响应通常包含 choices 字段。随后在控制台的请求日志中核对模型、耗时、token 用量和费用。具体响应字段取决于接口和上游提供商。"),
      h("接入应用"),
      p("使用兼容的 SDK 时，通常需要配置 API key、以 /v1 结尾的 base URL 和可用模型名。请在服务端保存令牌，避免将可用密钥打包进网页或移动客户端。"),
    ],
  },
  {
    id: "troubleshooting", title: "常见问题与排查", slug: "troubleshooting", icon: "🧭", parentId: null,
    content: [
      p("先记录问题发生时间、请求模型和返回的错误信息，再对照控制台日志排查。对外分享日志时删除令牌、用户隐私和其他敏感内容。"),
      h("401：鉴权失败"),
      p("检查 Authorization 是否使用 Bearer 格式，是否误用了上游密钥，以及 New API 令牌是否已被删除或过期。不要在截图中暴露完整令牌。"),
      h("403：权限或访问限制"),
      p("检查用户状态、令牌限制、分组权限和模型访问范围。具体限制以响应中的错误说明为准。"),
      h("429：额度或速率限制"),
      p("核对用户和令牌额度、实例限流设置以及上游的速率配额。需要重试时采用退避策略，避免立即反复发送相同请求。"),
      h("没有可用渠道或模型不存在"),
      p("确认至少一个启用渠道支持请求模型，并且与用户或令牌的分组一致。检查模型别名、大小写和渠道映射规则。"),
      h("超时或 5xx 错误"),
      p("检查 New API 实例日志、反向代理超时设置和上游服务状态。对于流式请求，还要确认代理允许及时转发响应，且没有不合适的缓冲或超时配置。"),
      h("提交问题前准备"),
      bullet("New API 版本、部署方式与问题发生时间。"),
      bullet("经过脱敏的最小请求示例、HTTP 状态码和错误文本。"),
      bullet("能否稳定复现，以及同一模型通过其他渠道是否正常。"),
    ],
  },
];

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email || password) {
    if (!email || !password) throw new Error("ADMIN_EMAIL 和 ADMIN_PASSWORD 必须同时设置。");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("ADMIN_EMAIL 格式不正确。");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const passwordHash = await hashPassword(password);
      await prisma.user.create({ data: { email, passwordHash } });
      console.log("已创建管理员账号（凭据不会写入日志）。");
    } else console.log("管理员已存在，保留现有密码。");
  } else {
    console.log("未设置 ADMIN_EMAIL / ADMIN_PASSWORD；跳过管理员创建。");
  }
  for (const [position, item] of documents.entries()) {
    const content = item.content as Prisma.InputJsonValue;
    await prisma.document.upsert({
      where: { id: item.id }, update: {}, create: {
        id: item.id, title: item.title, slug: item.slug, icon: item.icon,
        parentId: item.parentId, position, content,
        publishedVersion: 1, publishedAt: new Date(),
        publishedTitle: item.title, publishedSlug: item.slug, publishedIcon: item.icon,
        publishedContent: content, publishedText: contentText(content),
        publishedParentId: item.parentId, publishedPosition: position,
        revisions: { create: { title: item.title, slug: item.slug, icon: item.icon, content, version: 1 } },
      },
    });
  }
  console.log("入门文档已就绪；已存在的内容保持不变。");
}

main().catch((error: unknown) => {
  // Prisma diagnostics can include values. Never echo seed inputs or database connection strings.
  console.error(error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError) ? error.message : "初始化失败，请检查数据库连接和迁移状态。");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
