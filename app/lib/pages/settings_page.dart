// ============================================================
// 设置：身份切换、隐私（是否可被发现）、检查更新、账号管理
// ============================================================
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';

class SettingsPage extends StatefulWidget {
  final UserAccount me;
  final String role;
  final void Function(String) onRoleChanged;
  final VoidCallback onLogout;
  final VoidCallback onCheckUpdate;
  final void Function(UserAccount) onMeUpdated;
  const SettingsPage({
    super.key,
    required this.me,
    required this.role,
    required this.onRoleChanged,
    required this.onLogout,
    required this.onCheckUpdate,
    required this.onMeUpdated,
  });
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late bool discoverable = widget.me.discoverable == 1;

  Future<void> _toggleDiscoverable(bool v) async {
    setState(() => discoverable = v);
    try {
      await api.saveSettings(discoverable: v);
      if (!mounted) return;
      widget.onMeUpdated(UserAccount(
        id: widget.me.id, username: widget.me.username, realName: widget.me.realName,
        userType: widget.me.userType, skillTag: widget.me.skillTag, phone: widget.me.phone,
        avatar: widget.me.avatar, online: true, lastSeen: widget.me.lastSeen,
        bio: widget.me.bio, discoverable: v ? 1 : 0,
      ));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(v ? '已开启：别人可以在用户列表和共创推荐中发现你' : '已开启隐私：你将不会出现在用户列表和推荐里'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    } catch (_) {
      if (!mounted) return;
      setState(() => discoverable = !v);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('设置失败，请重试'), behavior: SnackBarBehavior.floating));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const SizedBox(height: 4),
        const Text('身份', style: TextStyle(fontSize: 12, color: Colors.black38, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'user', icon: Icon(Icons.person_outline, size: 18), label: Text('用户端')),
              ButtonSegment(value: 'tech', icon: Icon(Icons.engineering_outlined, size: 18), label: Text('技术端')),
            ],
            selected: {widget.role},
            onSelectionChanged: (s) { if (s.first != widget.role) widget.onRoleChanged(s.first); },
            style: SegmentedButton.styleFrom(selectedBackgroundColor: kPrimary, selectedForegroundColor: Colors.white),
          ),
          const SizedBox(height: 8),
          const Text('技术端可在技能市场发布服务；用户端可发布需求', style: TextStyle(fontSize: 11, color: Colors.black38)),
        ]))),
        const SizedBox(height: 16),
        const Text('隐私', style: TextStyle(fontSize: 12, color: Colors.black38, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(child: SwitchListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          title: const Text('允许别人发现我', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          subtitle: const Text('关闭后你不会出现在用户列表和共创推荐中，仍可主动联系别人', style: TextStyle(fontSize: 11)),
          value: discoverable,
          activeColor: kPrimary,
          onChanged: (v) => _toggleDiscoverable(v),
        )),
        const SizedBox(height: 16),
        const Text('通用', style: TextStyle(fontSize: 12, color: Colors.black38, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(clipBehavior: Clip.antiAlias, child: Column(children: [
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            leading: const Icon(Icons.system_update_outlined, color: kPrimary),
            title: const Text('检查更新', style: TextStyle(fontSize: 14)),
            subtitle: Text('当前版本 v$kAppVersion', style: const TextStyle(fontSize: 11)),
            trailing: const Icon(Icons.chevron_right),
            onTap: widget.onCheckUpdate,
          ),
          const Divider(height: 1, indent: 16),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            leading: const Icon(Icons.info_outline, color: kPrimary),
            title: const Text('关于己曜', style: TextStyle(fontSize: 14)),
            subtitle: const Text('技能共享平台 · 大学生创新创业项目', style: TextStyle(fontSize: 11)),
          ),
        ])),
        const SizedBox(height: 16),
        Card(clipBehavior: Clip.antiAlias, child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: const Icon(Icons.logout_rounded, color: Color(0xFFE5484D)),
          title: const Text('退出登录', style: TextStyle(color: Color(0xFFE5484D), fontWeight: FontWeight.w600)),
          onTap: () async {
            final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  title: const Text('退出登录'),
                  content: const Text('确定要退出当前账号吗？'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('退出')),
                  ],
                ));
            if (ok == true && context.mounted) {
              Navigator.pop(context);
              widget.onLogout();
            }
          },
        )),
        const SizedBox(height: 24),
      ]),
    );
  }
}

// SharedPreferences re-export helper（供主页读写本地资料）
Future<SharedPreferences> prefs() => SharedPreferences.getInstance();
