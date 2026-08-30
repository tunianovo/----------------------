// ============================================================
// 己曜 - 技能共享平台手机客户端入口
// ============================================================
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'bg_task.dart';
import 'theme.dart';
import 'pages/login_page.dart';
import 'pages/home_shell.dart';

final Api api = Api();

/// 全局会话状态：App内任何地方 401 都会清空并回到登录页
final ValueNotifier<UserAccount?> session = ValueNotifier(null);

/// 当前 App 版本（与 pubspec.yaml 保持一致；用于更新检查）
const String kAppVersion = '1.1.0';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final s = await SessionStore.load();
  if (s != null) api.token = s['token'] as String?;
  session.value = s == null ? null : UserAccount.fromJson(s['user']);
  // 登录过期：清会话回登录页
  api.onUnauthorized = () async {
    await SessionStore.clear();
    api.token = null;
    session.value = null;
  };
  runApp(const JsgxApp());
}

class JsgxApp extends StatelessWidget {
  const JsgxApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '己曜',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const AppGate(),
    );
  }
}

/// 应用根：会话恢复、心跳、登录/主界面切换、更新检查
class AppGate extends StatefulWidget {
  const AppGate({super.key});
  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  bool restoring = true;
  Timer? _hb;

  @override
  void initState() {
    super.initState();
    session.addListener(_onSessionChanged);
    _restore();
  }

  void _onSessionChanged() {
    if (session.value != null) _startHeartbeat();
  }

  Future<void> _restore() async {
    if (api.token == null) {
      setState(() => restoring = false);
      return;
    }
    try {
      final u = await api.me();
      session.value = u;
      setState(() => restoring = false);
      _startHeartbeat();
      _checkUpdate(context);
    } catch (_) {
      await SessionStore.clear();
      api.token = null;
      session.value = null;
      setState(() => restoring = false);
    }
  }

  void _startHeartbeat() {
    _hb?.cancel();
    api.heartbeat().catchError((_) {});
    _hb = Timer.periodic(const Duration(seconds: 60), (_) => api.heartbeat().catchError((_) {}));
  }

  // ---------- 在线更新检查：请求网站上的 version.json 比对版本号 ----------
  Future<void> _checkUpdate(BuildContext context, {bool manual = false}) async {
    try {
      final res = await http.get(Uri.parse('$kSiteBase/app/version.json')).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        if (manual && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('暂未获取到更新信息'),
              behavior: SnackBarBehavior.floating));
        }
        return;
      }
      final info = jsonDecode(utf8.decode(res.bodyBytes));
      final latest = (info['version'] ?? '') as String;
      final notes = (info['notes'] ?? '新版本上线') as String;
      final hasNew = _isNewer(latest, kAppVersion);
      if ((!hasNew && !manual) || !mounted) return;
      if (!hasNew && manual) {
        showDialog(context: context, builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('已是最新版本'),
          content: Text('当前版本 $kAppVersion，无需更新。'),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('好的'))],
        ));
        return;
      }
      showDialog(context: context, builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('发现新版本 $latest'),
        content: Text('$notes\n\n当前版本 $kAppVersion'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('下次再说')),
          FilledButton(
            onPressed: () async {
              final url = (info['url'] ?? '$kSiteBase/app') as String;
              final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
              if (!ok && context.mounted) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('请用浏览器打开下载页：$url'),
                    behavior: SnackBarBehavior.floating));
              }
            },
            child: const Text('去下载'),
          ),
        ],
      ));
    } catch (_) {
      if (manual && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('检查更新失败，请稍后再试'),
            behavior: SnackBarBehavior.floating));
      }
    }
  }

  bool _isNewer(String latest, String current) {
    final a = latest.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final b = current.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    for (var i = 0; i < 3; i++) {
      final x = i < a.length ? a[i] : 0, y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return false;
  }

  Future<void> _login(UserAccount u) async {
    await SessionStore.save(u, api.token!);
    session.value = u;
    _startHeartbeat();
  }

  @override
  void dispose() {
    session.removeListener(_onSessionChanged);
    _hb?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserAccount?>(
      valueListenable: session,
      builder: (context, me, _) {
        if (restoring) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        if (me == null) return LoginPage(onLogin: _login);
        return HomeShell(
          me: me,
          onLogout: () async {
            await SessionStore.clear();
            api.token = null;
            session.value = null;
          },
          onCheckUpdate: () => _checkUpdate(context, manual: true),
        );
      },
    );
  }
}

// ---------- 会话本地存储 ----------
class SessionStore {
  static const _kToken = 'token';
  static const _kUser = 'user';
  static const _kRole = 'role';
  static Future<void> save(UserAccount u, String token) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kToken, token);
    await p.setString(_kUser, jsonEncode(u.toJson()));
  }
  static Future<Map<String, dynamic>?> load() async {
    final p = await SharedPreferences.getInstance();
    final t = p.getString(_kToken);
    final u = p.getString(_kUser);
    if (t == null || u == null) return null;
    return {'token': t, 'user': jsonDecode(u)};
  }
  static Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_kToken);
    await p.remove(_kUser);
  }
  static Future<String> loadRole() async {
    final p = await SharedPreferences.getInstance();
    return p.getString(_kRole) ?? 'user';
  }
  static Future<void> saveRole(String role) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kRole, role);
  }
}
