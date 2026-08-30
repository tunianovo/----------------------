// ============================================================
// 主框架：底部导航（服务 / 共创 / 消息 / 我的）
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import 'market_page.dart';
import 'projects_page.dart';
import 'chats_page.dart';
import 'me_page.dart';

class HomeShell extends StatefulWidget {
  final UserAccount me;
  final VoidCallback onLogout;
  final VoidCallback onCheckUpdate;
  const HomeShell({super.key, required this.me, required this.onLogout, required this.onCheckUpdate});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int tab = 0;
  String role = 'user'; // user 客户端 / tech 技术端
  final GlobalKey<ChatsPageState> _chatsKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    SessionStore.loadRole().then((r) { if (mounted) setState(() => role = r); });
  }

  Future<void> _switchRole(String r) async {
    await SessionStore.saveRole(r);
    setState(() => role = r);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(r == 'tech' ? '已切换到技术端（可发布服务）' : '已切换到用户端'),
          backgroundColor: Theme.of(context).colorScheme.primary,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: tab,
        children: [
          MarketPage(me: widget.me, isTech: role == 'tech'),
          ProjectsPage(me: widget.me),
          ChatsPage(key: _chatsKey, me: widget.me),
          MePage(
            me: widget.me,
            role: role,
            onRoleChanged: _switchRole,
            onLogout: widget.onLogout,
            onCheckUpdate: widget.onCheckUpdate,
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) {
          setState(() => tab = i);
          if (i == 2) _chatsKey.currentState?.refresh();
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: '服务'),
          NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: '共创'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: '消息'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: '我的'),
        ],
      ),
    );
  }
}
