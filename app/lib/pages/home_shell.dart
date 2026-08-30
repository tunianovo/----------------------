// ============================================================
// 主框架：底部导航（服务 / 消息 / 我的）
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import 'market_page.dart';
import 'chats_page.dart';
import 'me_page.dart';

class HomeShell extends StatefulWidget {
  final UserAccount me;
  final VoidCallback onLogout;
  final void Function(UserAccount) onMeUpdated;
  final int initialTab;
  const HomeShell({super.key, required this.me, required this.onLogout, required this.onMeUpdated, this.initialTab = 0});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late int tab = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: tab,
        children: [
          MarketPage(me: widget.me),
          ChatsPage(me: widget.me),
          MePage(me: widget.me, onLogout: widget.onLogout, onMeUpdated: widget.onMeUpdated),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: '服务'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: '消息'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: '我的'),
        ],
      ),
    );
  }
}
