// ============================================================
// 消息：会话列表 + 按账号发起新聊天
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'chat_page.dart';

class ChatsPage extends StatefulWidget {
  final UserAccount me;
  const ChatsPage({super.key, required this.me});
  @override
  State<ChatsPage> createState() => _ChatsPageState();
}

class _ChatsPageState extends State<ChatsPage> with AutomaticKeepAliveClientMixin {
  List<Conversation>? items;
  String? error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
    // 每5秒轮询新消息/在线状态
    Stream.periodic(const Duration(seconds: 5)).listen((_) { if (mounted) _load(silent: true); });
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final list = await api.conversations();
      if (!mounted) return;
      setState(() { items = list; error = null; });
    } catch (e) {
      if (!mounted || silent) return;
      setState(() => error = '加载失败，请下拉重试');
    }
  }

  Future<void> _newChat() async {
    final controller = TextEditingController();
    final username = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('发起新聊天'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: '输入对方注册账号'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('查找')),
        ],
      ),
    );
    if (username == null || username.isEmpty) return;
    try {
      final u = await api.userByUsername(username);
      if (!mounted) return;
      if (u == null) {
        _toast('未找到账号「$username」', isError: true);
      } else if (u.id == widget.me.id) {
        _toast('这是你自己的账号', isError: true);
      } else {
        Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: u.id, peerName: u.displayName)));
      }
    } on ApiException catch (e) {
      _toast(e.message, isError: true);
    }
  }

  void _toast(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: isError ? const Color(0xFFE5484D) : kPrimary,
        behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
  }

  String _time(int ts) {
    if (ts == 0) return '';
    final d = DateTime.fromMillisecondsSinceEpoch(ts);
    final now = DateTime.now();
    if (now.difference(d).inDays == 0) return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return '${d.month}/${d.day}';
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('消息'),
        actions: [
          IconButton(onPressed: _newChat, icon: const Icon(Icons.add_comment_outlined), tooltip: '发起新聊天'),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        color: kPrimary,
        child: items == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? ListView(children: [Padding(padding: const EdgeInsets.all(48), child: Center(child: Text(error!, style: const TextStyle(color: Colors.black45))))])
                : (items!.isEmpty ? _empty() : _list()),
      ),
    );
  }

  Widget _empty() => ListView(children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 120),
          child: Column(children: [
            Icon(Icons.chat_bubble_outline, size: 56, color: Colors.black12),
            const SizedBox(height: 14),
            const Text('暂无消息', style: TextStyle(color: Colors.black38)),
            const SizedBox(height: 6),
            const Text('点右上角 + 按账号找人开聊', style: TextStyle(color: Colors.black26, fontSize: 12)),
          ]),
        ),
      ]);

  Widget _list() => ListView.separated(
        itemCount: items!.length,
        separatorBuilder: (_, __) => const Divider(indent: 76, height: 1),
        itemBuilder: (_, i) {
          final c = items![i];
          return ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: Stack(children: [
              UserAvatar(url: c.avatar, name: c.name, radius: 24),
              if (c.online)
                Positioned(right: 0, bottom: 0, child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: const OnlineDot(size: 9))),
            ]),
            title: Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            subtitle: Text(c.lastMsg, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, color: Colors.black45)),
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(_time(c.lastTime), style: const TextStyle(fontSize: 11, color: Colors.black38)),
              if (c.unread > 0)
                Container(margin: const EdgeInsets.only(top: 4), padding: const EdgeInsets.symmetric(horizontal: 6, minimumSize: const Size(18, 18)),
                    decoration: BoxDecoration(color: const Color(0xFFFF3B30), borderRadius: BorderRadius.circular(9)),
                    child: Text('${c.unread}', style: const TextStyle(color: Colors.white, fontSize: 10))),
            ]),
            onTap: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: c.peerId, peerName: c.name)));
              if (mounted) _load(silent: true);
            },
          );
        },
      );
}
