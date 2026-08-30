// ============================================================
// 消息：会话列表 + 按账号发起新聊天
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../bg_task.dart';
import '../cache.dart';
import '../theme.dart';
import 'chat_page.dart';

class ChatsPage extends StatefulWidget {
  final UserAccount me;
  const ChatsPage({super.key, required this.me});
  @override
  State<ChatsPage> createState() => ChatsPageState();
}

class ChatsPageState extends State<ChatsPage> with AutomaticKeepAliveClientMixin {
  List<Conversation>? items;
  String? error;
  bool loadingCache = true;
  // 用户目录视图
  String chatsView = 'msgs'; // msgs 会话 / users 用户列表
  List<UserAccount>? allUsers;
  String userFilter = '';
  List<GroupInfo> groups = [];
  List<GroupInvite> invites = [];

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
    _loadUsers();
    _loadGroups();
    // requestNotificationPermission(); // v1.1.2 诊断：暂时禁用通知
    // 每5秒轮询新消息/在线状态
    Stream.periodic(const Duration(seconds: 5)).listen((_) { if (mounted) _load(silent: true); });
  }

  // 供外部（切tab时）立即刷新
  void refresh() {
    _load(silent: true);
    if (chatsView == 'users') _loadUsers();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    try {
      final g = await api.myGroups();
      if (!mounted) return;
      setState(() { groups = g; invites = api.pendingInvites; });
    } catch (_) {}
  }

  Future<void> _loadUsers() async {
    try {
      final list = await api.allUsers();
      if (!mounted) return;
      setState(() => allUsers = list);
    } catch (_) {}
  }

  Future<void> _load({bool silent = false}) async {
    if (items == null) {
      final cached = await LocalCache.get('conversations');
      if (cached != null && mounted) {
        setState(() { items = (cached as List).map(Conversation.fromJson).toList(); loadingCache = false; });
      }
    }
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
        Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: u.id, peerName: u.displayName, meId: widget.me.id)));
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
        title: SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'msgs', label: Text('消息')),
            ButtonSegment(value: 'users', label: Text('用户')),
          ],
          selected: {chatsView},
          onSelectionChanged: (s) => setState(() { chatsView = s.first; if (s.first == 'users') _loadUsers(); }),
          style: SegmentedButton.styleFrom(
            selectedBackgroundColor: kPrimary,
            selectedForegroundColor: Colors.white,
            visualDensity: VisualDensity.compact,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(onPressed: _newChat, icon: const Icon(Icons.add_comment_outlined), tooltip: '按账号发起聊天'),
        ],
      ),
      body: chatsView == 'msgs' ? _msgsView() : _usersView(),
    );
  }

  // 用户目录：所有注册用户，按昵称/账号搜索，点谁都能直接聊
  Widget _usersView() {
    final list = (allUsers ?? []).where((u) => u.id != widget.me.id).where((u) {
      if (userFilter.isEmpty) return true;
      return u.displayName.contains(userFilter) || u.username.contains(userFilter) || u.skillTag.contains(userFilter);
    }).toList();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: TextField(
          onChanged: (v) => setState(() => userFilter = v.trim()),
          decoration: const InputDecoration(hintText: '搜索昵称 / 账号 / 技能', prefixIcon: Icon(Icons.search), isDense: true),
        ),
      ),
      Expanded(
        child: allUsers == null
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _loadUsers,
                color: kPrimary,
                child: list.isEmpty
                    ? ListView(children: const [Padding(padding: EdgeInsets.symmetric(vertical: 100), child: Center(child: Text('没有找到用户', style: TextStyle(color: Colors.black38))))])
                    : ListView.separated(
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const Divider(indent: 72, height: 1),
                        itemBuilder: (_, i) {
                          final u = list[i];
                          return ListTile(
                            leading: Stack(children: [
                              UserAvatar(url: u.avatar, name: u.displayName, radius: 22),
                              if (u.online)
                                Positioned(right: 0, bottom: 0, child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                                  child: const OnlineDot(size: 8))),
                            ]),
                            title: Text(u.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                            subtitle: Text(u.userType == 1 ? (u.skillTag.isNotEmpty ? u.skillTag : '技能提供者') : '账号: ${u.username}',
                                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.black45)),
                            trailing: Text(u.online ? '在线' : '', style: const TextStyle(fontSize: 11, color: kOnline)),
                            onTap: () async {
                              await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: u.id, peerName: u.displayName, meId: widget.me.id)));
                              _load(silent: true);
                            },
                          );
                        },
                      ),
              ),
      ),
    ]);
  }

  Widget _msgsView() {
    return Column(children: [
      if (invites.isNotEmpty)
        Container(margin: const EdgeInsets.fromLTRB(12, 8, 12, 0), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(12)),
            child: Column(children: invites.map((inv) => Row(children: [
              const Icon(Icons.group_add, size: 18, color: kPrimary),
              const SizedBox(width: 8),
              Expanded(child: Text(inv.inviterName + ' 邀请你加入「' + inv.name + '」', style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis)),
              TextButton(onPressed: () => _handleInvite(inv.inviteId, false), style: TextButton.styleFrom(visualDensity: VisualDensity.compact), child: const Text('拒绝', style: TextStyle(fontSize: 12, color: Colors.black45))),
              TextButton(onPressed: () => _handleInvite(inv.inviteId, true), style: TextButton.styleFrom(visualDensity: VisualDensity.compact), child: const Text('同意', style: TextStyle(fontSize: 12, color: kPrimary))),
            ])).toList())),
      Expanded(child: RefreshIndicator(
        onRefresh: () async { await _load(); await _loadGroups(); },
        color: kPrimary,
        child: items == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? ListView(children: [Padding(padding: const EdgeInsets.all(48), child: Center(child: Text(error!, style: const TextStyle(color: Colors.black45))))])
                : ((items!.isEmpty && groups.isEmpty) ? _empty() : _chatsWithGroups()),
      )),
    ]);
  }

  Widget _chatsWithGroups() {
    return ListView(
      children: [
        if (groups.isNotEmpty) ...[
          const Padding(padding: EdgeInsets.fromLTRB(16, 10, 16, 4), child: Text('我的群聊', style: TextStyle(fontSize: 12, color: Colors.black38))),
          SizedBox(height: 84, child: ListView.separated(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: groups.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final g = groups[i];
              return InkWell(borderRadius: BorderRadius.circular(12), onTap: () async {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: -g.groupId, peerName: g.name, meId: widget.me.id)));
                refresh();
              }, child: SizedBox(width: 68, child: Column(children: [
                CircleAvatar(radius: 26, backgroundColor: kPrimary.withOpacity(0.12), child: const Icon(Icons.group, color: kPrimary, size: 26)),
                const SizedBox(height: 4),
                Text(g.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11)),
              ])));
            })),
        ],
        if (groups.isNotEmpty) const Divider(),
        _list(),
      ],
    );
  }

  void _showAddMenu() {
    showModalBottomSheet(context: context, backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (_) => SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.person_add_alt_1, color: kPrimary),
              title: const Text('按账号发起新聊天'), onTap: () { Navigator.pop(context); _newChat(); }),
          ListTile(leading: const Icon(Icons.group_add, color: kPrimary),
              title: const Text('发起群聊（邀请需对方同意）'), onTap: () { Navigator.pop(context); _createGroup(); }),
        ]))));
  }

  Future<void> _createGroup() async {
    await _loadUsers();
    final nameCtrl = TextEditingController();
    final selected = <int>{};
    final ok = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) => SafeArea(child: Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: const InputDecoration(hintText: '群名称')),
          const SizedBox(height: 10),
          ConstrainedBox(constraints: const BoxConstraints(maxHeight: 320), child: ListView.builder(
            shrinkWrap: true,
            itemCount: (allUsers ?? []).length,
            itemBuilder: (_, i) {
              final u = allUsers![i];
              final sel = selected.contains(u.id);
              return CheckboxListTile(
                dense: true,
                value: sel,
                activeColor: kPrimary,
                title: Text(u.displayName, style: const TextStyle(fontSize: 14)),
                subtitle: Text(u.username, style: const TextStyle(fontSize: 11)),
                onChanged: (v) { setSheet(() { if (v == true) { selected.add(u.id); } else { selected.remove(u.id); } }); },
              );
            },
          )),
          const SizedBox(height: 10),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text('创建并邀请（已选 ' + selected.length.toString() + ' 人）')),
        ]),
      ))),
    );
    if (ok != true || nameCtrl.text.trim().isEmpty || selected.isEmpty) return;
    try {
      await api.createGroup(nameCtrl.text.trim(), selected.toList());
      if (!mounted) return;
      _toast('群聊已创建，等待被邀请人同意', isError: false);
      _loadGroups();
    } on ApiException catch (e) {
      _toast(e.message, isError: true);
    }
  }

  Future<void> _handleInvite(int inviteId, bool accept) async {
    try {
      await api.handleGroupInvite(inviteId, accept);
      _loadGroups();
      _load(silent: true);
      if (mounted && accept) _toast('已加入群聊', isError: false);
    } on ApiException catch (e) {
      _toast(e.message, isError: true);
    }
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
                Container(margin: const EdgeInsets.only(top: 4), padding: const EdgeInsets.symmetric(horizontal: 5),
                    constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: const Color(0xFFFF3B30), borderRadius: BorderRadius.circular(9)),
                    child: Text('${c.unread}', style: const TextStyle(color: Colors.white, fontSize: 10))),
            ]),
            onTap: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: c.peerId, peerName: c.name, meId: widget.me.id)));
              if (mounted) _load(silent: true);
            },
          );
        },
      );
}
