// 构建期补丁：对 flutter create 生成的 android 工程做定制
// 1. 开启核心库脱糖（flutter_local_notifications 要求）
// 2. release 关闭 R8 混淆/收缩（workmanager 的 Room 数据库在混淆下启动崩溃）
// 3. 使用固定签名（keystore.jks，保证用户可覆盖安装更新）
// 4. 应用名称改为 己曜；声明所需权限
const fs = require('fs');
const path = require('path');

const appDir = path.join('android', 'app');

// ---------- build.gradle(.kts) ----------
for (const name of ['build.gradle.kts', 'build.gradle']) {
  const f = path.join(appDir, name);
  if (!fs.existsSync(f)) continue;
  const isKts = name.endsWith('.kts');
  let c = fs.readFileSync(f, 'utf8');

  // 脱糖开关
  if (isKts) {
    c = c.replace(/targetCompatibility = JavaVersion\.VERSION_\d+/g, (m) => m + '\n        isCoreLibraryDesugaringEnabled = true');
  } else {
    c = c.replace(/targetCompatibility( =)? JavaVersion\.VERSION_\d+/g, (m) => m + '\n        coreLibraryDesugaringEnabled true');
  }

  // release 关闭混淆与资源收缩
  c = c.replace(/release \{\n/, 'release {\n            isMinifyEnabled = false\n            isShrinkResources = false\n');
  if (!/isMinifyEnabled/.test(c)) {
    c = c.replace(/buildTypes \{\n/, 'buildTypes {\n        release {\n            isMinifyEnabled = false\n            isShrinkResources = false\n        }\n');
  }

  // 固定签名：替换 release 里的 debug 签名
  const signKts = 'signingConfig = signingConfigs.create("release") {\n                storeFile = file("keystore.jks")\n                storePassword = "jyao2026"\n                keyAlias = "jyao"\n                keyPassword = "jyao2026"\n            }';
  const signGroovy = 'signingConfig signingConfigs {\n                release {\n                    storeFile file("keystore.jks")\n                    storePassword "jyao2026"\n                    keyAlias "jyao"\n                    keyPassword "jyao2026"\n                }\n            }';
  if (isKts) {
    c = c.replace('signingConfig = signingConfigs.debug', signKts);
  } else {
    c = c.replace('signingConfig signingConfigs.debug', signGroovy);
  }

  // 脱糖依赖（追加独立 dependencies 块）
  const depKts = '\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n';
  const depGroovy = "\ndependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'\n}\n";
  c += isKts ? depKts : depGroovy;

  fs.writeFileSync(f, c);
  console.log('patched', f);
}

// ---------- AndroidManifest：应用名 + 权限 ----------
const mf = path.join(appDir, 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(mf)) {
  let m = fs.readFileSync(mf, 'utf8');
  m = m.replace('android:label="jsgx_app"', 'android:label="己曜"');
  const perms = [
    'android.permission.INTERNET',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.VIBRATE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
  ];
  for (const perm of perms) {
    if (!m.includes(perm)) {
      m = m.replace('<application', '<uses-permission android:name="' + perm + '"/><application');
    }
  }
  fs.writeFileSync(mf, m);
  console.log('patched', mf);
}

console.log('gradle patch 完成');
