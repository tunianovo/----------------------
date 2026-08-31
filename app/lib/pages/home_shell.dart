// ============================================================
// 主框架：底部导航（服务 / 消息 / 我的）
// 全局未读轮询（私聊+群聊）：导航红点 + 新消息横幅；记住上次停留的 tab
// ============================================================
import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'market_page.dart';
import 'chats_page.dart';
import 'me_page.dart';

class HomeShell extends StatefulWidget {
  final UserAccount me;
  final VoidCallback onLogout;
  final VoidCallback onCheckUpdate;
  final void Function(UserAccount) onMeUpdated;
  const HomeShell({super.key, required this.me, required this.onLogout, required this.onCheckUpdate, required this.onMeUpdated});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int tab = 0;
  String role = 'user'; // user 客户端 / tech 技术端
  final GlobalKey<ChatsPageState> _chatsKey = GlobalKey();
  int unreadTotal = 0;
  int lastSeenUnread = -1;
  Timer? _unreadPoll;

  @override
  void initState() {
    super.initState();
    SessionStore.loadRole().then((r) { if (mounted) setState(() => role = r); });
    // 恢复上次退出前停留的页面
    SessionStore.loadTab().then((t) { if (mounted && tab != t) setState(() => tab = t); });
    // 全局未读轮询：任何页面都更新红点；新消息到达且不在消息页时弹横幅
    _pollUnread();
    _unreadPoll = Timer.periodic(const Duration(seconds: 5), (_) => _pollUnread());
  }

  Future<void> _pollUnread() async {
    try {
      final convs = await api.conversations();
      int total = 0;
      for (final cv in convs) {
        total += cv.unread;
      }
      // 群聊未读也计入红点与横幅
      try {
        final groups = await api.myGroups();
        for (final g in groups) {
          total += g.unread;
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() => unreadTotal = total);
      if (lastSeenUnread >= 0 && total > lastSeenUnread && tab != 1) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('收到新消息，共 $total 条未读'),
            backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            duration: const Duration(seconds: 3)));
      }
      lastSeenUnread = total;
      if (tab == 1) lastSeenUnread = 0; // 停在消息页视为已读
    } catch (_) {}
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
  void dispose() {
    _unreadPoll?.cancel();
    super.dispose();
  }

  /// 消息导航图标（带未读红点；用固定 10px 圆点，避免 Badge 拉伸问题）
  Widget _chatIcon(IconData icon) {
    return Stack(clipBehavior: Clip.none, children: [
      Icon(icon),
      if (unreadTotal > 0)
        Positioned(right: -3, top: -3, child: Container(width: 10, height: 10,
            decoration: BoxDecoration(color: const Color(0xFFE5484D), shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.5)))),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: tab,
        children: [
          MarketPage(me: widget.me, isTech: role == 'tech'),
          ChatsPage(key: _chatsKey, me: widget.me),
          MePage(
            me: widget.me,
            role: role,
            onRoleChanged: _switchRole,
            onMeUpdated: widget.onMeUpdated,
            onLogout: widget.onLogout,
            onCheckUpdate: widget.onCheckUpdate,
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) {
          setState(() => tab = i);
          SessionStore.saveTab(i);
          if (i == 1) {
            _chatsKey.currentState?.refresh();
            lastSeenUnread = 0;
          }
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: '服务'),
          NavigationDestination(icon: _chatIcon(Icons.chat_bubble_outline), selectedIcon: _chatIcon(Icons.chat_bubble), label: '消息'),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: '我的'),
        ],
      ),
    );
  }
}
