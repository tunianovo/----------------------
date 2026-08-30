# 技能共享 App（安卓客户端）

与网站（azhegezhege.pages.dev）同一套后端与账号体系，功能：账号登录注册、服务市场浏览与下单、私信聊天（在线状态、未读角标）。

## 目录结构
```
jsgx-app/
├── pubspec.yaml            # 依赖与图标配置
├── lib/
│   ├── main.dart           # 入口：会话恢复、全局心跳、登录态切换
│   ├── api.dart            # API 客户端（对接 Cloudflare Worker）
│   ├── theme.dart          # Material 3 主题（Fluent/谷歌简洁风）
│   └── pages/
│       ├── login_page.dart   # 登录/注册
│       ├── home_shell.dart   # 底部导航（服务/消息/我的）
│       ├── market_page.dart  # 服务市场 + 详情/下单
│       ├── chats_page.dart   # 会话列表 + 按账号找人
│       ├── chat_page.dart    # 聊天窗口（在线状态/轮询）
│       └── me_page.dart      # 我的 + 订单
├── assets/icon.png         # App 图标（由 gen_icon.js 生成）
└── gen_icon.js             # 图标生成脚本（node gen_icon.js）
```

## 构建方式
不需要本地安装 Flutter/Android SDK。把本项目同步到网站仓库的 `app/` 目录并推送，
GitHub Actions（`.github/workflows/build-apk.yml`）会自动：
1. 生成 android 平台脚手架
2. 应用图标（flutter_launcher_icons）
3. `flutter build apk --split-per-abi` 出包
4. 上传到 GitHub Release（tag: app-v1.0.0）

APK 出包后下载 arm64 版（适配绝大多数手机），放到网站 `app/jsgx-app.apk` 一并部署即可在下载页使用。

## 本地开发（可选）
安装 Flutter 后：`flutter pub get && flutter run`
