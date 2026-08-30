import { handler } from "../_handler.js";

// Pages Functions 路由：/api/* -> 剥掉 /api 前缀后复用同一套 handler
export const onRequest = async (ctx) => {
  const url = new URL(ctx.request.url);
  url.pathname = url.pathname.replace(/^\/api/, "") || "/";
  const req = new Request(url, ctx.request);
  return handler(req, ctx.env, ctx);
};
