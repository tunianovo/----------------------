// ============================================================
// 登录 / 注册页
// ============================================================
import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';

class LoginPage extends StatefulWidget {
  final void Function(UserAccount) onLogin;
  const LoginPage({super.key, required this.onLogin});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _realName = TextEditingController();
  final _phone = TextEditingController();
  final _smsCode = TextEditingController();
  bool isRegister = false;
  bool userTypeTech = false;
  bool busy = false;
  bool sendingCode = false;
  int codeCountdown = 0;
  String? error;
  Timer? _timer;

  Future<void> _sendCode() async {
    final phone = _phone.text.trim();
    if (!RegExp(r'^1\d{10}$').hasMatch(phone)) {
      setState(() => error = '请输入正确的11位手机号');
      return;
    }
    setState(() { sendingCode = true; error = null; });
    try {
      final devCode = await api.sendSmsCode(phone);
      if (!mounted) return;
      if (devCode != null && devCode.isNotEmpty) {
        // 开发模式（短信服务未配置）：验证码直接提示出来，方便测试
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('【开发模式】验证码：$devCode（配置短信服务后此提示消失）'),
            backgroundColor: const Color(0xFFF5A623), behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 6)));
        _smsCode.text = devCode;
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('验证码已发送，请查收短信'), backgroundColor: kPrimary, behavior: SnackBarBehavior.floating));
      }
      codeCountdown = 60;
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) { t.cancel(); return; }
        setState(() => codeCountdown--);
        if (codeCountdown <= 0) t.cancel();
      });
    } on ApiException catch (e) {
      setState(() => error = e.message);
    } catch (_) {
      setState(() => error = '验证码发送失败，请重试');
    }
    if (mounted) setState(() => sendingCode = false);
  }

  Future<void> _submit() async {
    final name = _username.text.trim();
    final pwd = _password.text;
    if (name.isEmpty || pwd.isEmpty) {
      setState(() => error = '请输入账号和密码');
      return;
    }
    if (isRegister && pwd.length < 6) {
      setState(() => error = '密码至少 6 位');
      return;
    }
    setState(() { busy = true; error = null; });
    try {
      final u = isRegister
          ? await api.register(
              username: name,
              password: pwd,
              realName: _realName.text.trim(),
              userType: userTypeTech ? 1 : 0,
              phone: _phone.text.trim(),
              smsCode: _smsCode.text.trim(),
            )
          : await api.login(username: name, password: pwd);
      if (!mounted) return;
      widget.onLogin(u);
    } on ApiException catch (e) {
      setState(() { error = e.message; busy = false; });
    } catch (_) {
      setState(() { error = '出错了，请重试'; busy = false; });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  // App 图标 + 标题
                  Center(
                    child: Container(
                      width: 84, height: 84,
                      decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), boxShadow: [
                        BoxShadow(color: kPrimary.withOpacity(0.25), blurRadius: 24, offset: const Offset(0, 8)),
                      ]),
                      child: ClipRRect(borderRadius: BorderRadius.circular(22), child: Image.asset('assets/icon.png')),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Center(child: Text('己曜', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5))),
                  const Center(child: Text('让每一项技能都有价值', style: TextStyle(fontSize: 13, color: Colors.black45))),
                  const SizedBox(height: 32),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('登录')),
                      ButtonSegment(value: true, label: Text('注册')),
                    ],
                    selected: {isRegister},
                    onSelectionChanged: (s) => setState(() { isRegister = s.first; error = null; }),
                    style: SegmentedButton.styleFrom(selectedBackgroundColor: kPrimary, selectedForegroundColor: Colors.white),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _username,
                    decoration: const InputDecoration(hintText: '账号', prefixIcon: Icon(Icons.person_outline)),
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(hintText: '密码', prefixIcon: Icon(Icons.lock_outline)),
                    textInputAction: isRegister ? TextInputAction.next : TextInputAction.done,
                    onSubmitted: (_) => isRegister ? null : _submit(),
                  ),
                  if (isRegister) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _realName,
                      decoration: const InputDecoration(hintText: '昵称（选填）', prefixIcon: Icon(Icons.badge_outlined)),
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                      title: const Text('我是技能提供者（接单）', style: TextStyle(fontSize: 14)),
                      value: userTypeTech,
                      onChanged: (v) => setState(() => userTypeTech = v),
                      activeColor: kPrimary,
                    ),
                  ],
                  const SizedBox(height: 20),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(error!, style: const TextStyle(color: Color(0xFFE5484D), fontSize: 13), textAlign: TextAlign.center),
                    ),
                  FilledButton(
                    onPressed: busy ? null : _submit,
                    child: busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                        : Text(isRegister ? '注册并登录' : '登录'),
                  ),
                  const SizedBox(height: 12),
                  const Center(
                    child: Text('己曜 · 让每一项技能都有价值', style: TextStyle(fontSize: 12, color: Colors.black38)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
