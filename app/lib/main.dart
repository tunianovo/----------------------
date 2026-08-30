// ============================================================
// 技能共享平台 - 手机客户端入口
// ============================================================
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'theme.dart';
import 'pages/login_page.dart';
import 'pages/home_shell.dart';

final Api api = Api();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = await SessionStore.load();
  if (session != null) {
    api.token = session['token'] as String?;
  }
  runApp(JsgxApp(initialUser: session == null ? null : UserAccount.fromJson(session['user'])));
}

class JsgxApp extends StatelessWidget {
  final UserAccount? initialUser;
  const JsgxApp({super.key, this.initialUser});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '技能共享',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: AppGate(initialUser: initialUser),
    );
  }
}

/// 应用根状态：会话恢复、全局心跳、登录/主界面切换
class AppGate extends StatefulWidget {
  final UserAccount? initialUser;
  const AppGate({super.key, this.initialUser});
  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  UserAccount? me;
  bool restoring = true;
  Timer? _hb;

  @override
  void initState() {
    super.initState();
    me = widget.initialUser;
    _restore();
  }

  Future<void> _restore() async {
    if (api.token == null) {
      setState(() => restoring = false);
      return;
    }
    try {
      final u = await api.me();
      setState(() { me = u; restoring = false; });
      _startHeartbeat();
    } catch (_) {
      // token 失效则清掉回到登录页
      await SessionStore.clear();
      api.token = null;
      setState(() { me = null; restoring = false; });
    }
  }

  void _startHeartbeat() {
    _hb?.cancel();
    api.heartbeat().catchError((_) {});
    _hb = Timer.periodic(const Duration(seconds: 60), (_) => api.heartbeat().catchError((_) {}));
  }

  Future<void> onLogin(UserAccount u) async {
    await SessionStore.save(u, api.token!);
    setState(() => me = u);
    _startHeartbeat();
  }

  Future<void> onLogout() async {
    await SessionStore.clear();
    api.token = null;
    _hb?.cancel();
    setState(() => me = null);
  }

  @override
  void dispose() {
    _hb?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (me == null) {
      return LoginPage(onLogin: onLogin);
    }
    return HomeShell(me: me!, onLogout: onLogout, onMeUpdated: (u) => setState(() => me = u));
  }
}

// ---------- 会话本地存储 ----------
class SessionStore {
  static const _kToken = 'token';
  static const _kUser = 'user';
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
}
