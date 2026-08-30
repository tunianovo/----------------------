import { handler } from "./functions/_handler.js";

// 独立 Worker 部署入口（workers.dev，国内不可达，仅作备用）
export default { fetch: handler };
