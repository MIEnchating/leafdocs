import { getSession } from "./auth";
import { HttpError, requireSameOrigin } from "./http";

export async function authorize(request?: Request) {
  if (request) requireSameOrigin(request);
  const session = await getSession();
  if (!session) throw new HttpError(401, "请先登录文档管理后台。");
  return session;
}
