// ============================================================
// 聊天窗口：单聊/群聊、加号菜单（定位/照片/文件）、已读、本地记录
// 单聊 peerId>0；群聊 groupId<0（用负数区分）
// ============================================================
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../main.dart';
import '../cache.dart';
import '../theme.dart';
import 'profile_page.dart';

class ChatPage extends StatefulWidget {
  final int peerId; // 单聊: 对方用户id(>0)；群聊: -(群id)
  final String peerName;
  final int meId;
  const ChatPage({super.key, required this.peerId, required this.peerName, required this.meId});
  bool get isGroup => peerId < 0;
  int get realId => isGroup ? -peerId : peerId;
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  List<ChatMessage> messages = [];
  List<GroupMessage> groupMessages = [];
  UserAccount? peer;
  bool sending = false;
  bool loading = true;
  String? error;
  StreamSubscription? _poll;
  final Set<int> selected = {};
  bool selecting = false;

  @override
  void initState() {
    super.initState();
    _loadPeer();
    _load();
    _poll = Stream.periodic(const Duration(seconds: 4)).listen((_) => _load(silent: true));
  }

  bool _isLocation(String text) => text.startsWith('【位置】') && RegExp(r'^【位置】-?\d+\.\d+,-?\d+\.\d+$').hasMatch(text);
  bool _isImage(String text) => text.startsWith('【图片】');
  bool _isFile(String text) => text.startsWith('【文件】');

  Future<void> _loadPeer() async {
    if (widget.isGroup) return;
    try {
      final list = await api.usersByIds([widget.realId]);
      if (mounted && list.isNotEmpty) setState(() => peer = list.first);
    } catch (_) {}
  }

  Future<void> _load({bool silent = false}) async {
    // 本地缓存秒开：先渲染上次保存的聊天记录，再后台拉新替换
    if (loading) {
      final cached = await LocalCache.get(widget.isGroup ? 'gchat_${widget.realId}' : 'chat_${widget.realId}');
      if (cached is List && cached.isNotEmpty && mounted) {
        setState(() {
          if (widget.isGroup) {
            groupMessages = cached.map(GroupMessage.fromJson).toList();
          } else {
            messages = cached.map(ChatMessage.fromJson).toList();
          }
          loading = false;
        });
        _scrollToBottom();
      }
    }
    try {
      if (widget.isGroup) {
        final list = await api.groupHistory(widget.realId);
        if (!mounted) return;
        setState(() { groupMessages = list; loading = false; error = null; });
        LocalCache.put('gchat_${widget.realId}', list.map((m) => {'id': m.id, 'group_id': m.groupId, 'sender_id': m.senderId, 'sender_name': m.senderName, 'content': m.content, 'create_time': m.createTime}).toList());
      } else {
        final list = await api.history(widget.realId);
        if (!mounted) return;
        setState(() { messages = list; loading = false; error = null; });
        api.markRead(widget.realId).catchError((_) {});
        LocalCache.put('chat_${widget.realId}', list.map((m) => {'id': m.id, 'sender_id': m.senderId, 'receiver_id': m.receiverId, 'content': m.content, 'create_time': m.createTime, 'is_read': m.isRead ? 1 : 0}).toList());
      }
      _scrollToBottom();
    } catch (e) {
      if (!mounted || silent) return;
      setState(() { error = '消息加载失败'; loading = false; });
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || sending) return;
    setState(() => sending = true);
    try {
      if (widget.isGroup) {
        await api.groupSend(widget.realId, text);
      } else {
        await api.send(widget.realId, text);
      }
      _controller.clear();
      await _load(silent: true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message, isError: true);
    } catch (_) {}
    if (mounted) setState(() => sending = false);
  }

  // ---------- 加号菜单：定位 / 照片 / 文件 ----------
  void _showPlusMenu() {
    showModalBottomSheet(context: context, backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (_) => SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            _plusItem(Icons.location_on, '位置', _sendLocation),
            _plusItem(Icons.photo_outlined, '照片', () { Navigator.pop(context); _sendImage(); }),
            _plusItem(Icons.insert_drive_file_outlined, '文件', () { Navigator.pop(context); _sendFile(); }),
          ]),
          const Divider(height: 18),
          // 删除聊天记录：长按替代方案，任何消息都可选中删除
          SizedBox(width: double.infinity, child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44),
                side: const BorderSide(color: Color(0xFFE5484D)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            onPressed: () {
              Navigator.pop(context);
              setState(() { selecting = true; selected.clear(); });
            },
            icon: const Icon(Icons.delete_sweep_outlined, size: 18, color: Color(0xFFE5484D)),
            label: const Text('删除聊天记录', style: TextStyle(color: Color(0xFFE5484D))),
          )),
          const SizedBox(height: 8),
        ]))));
  }

  Widget _plusItem(IconData icon, String label, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10), child: Column(children: [
          Container(width: 52, height: 52, decoration: BoxDecoration(color: const Color(0xFFF0F2F5), borderRadius: BorderRadius.circular(16)),
              child: Icon(icon, color: kPrimary, size: 26)),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 12)),
        ])),
      );

  Future<void> _sendLocation() async {
    Navigator.pop(context);
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        _toast('未授权定位权限，请在系统设置中开启', isError: true);
        return;
      }
      final pos = await Geolocator.getCurrentPosition();
      await _sendRaw('【位置】${pos.latitude.toStringAsFixed(6)},${pos.longitude.toStringAsFixed(6)}');
    } catch (_) {
      _toast('获取定位失败，请重试', isError: true);
    }
  }

  Future<void> _sendImage() async {
    try {
      final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 720, imageQuality: 40);
      if (x == null) return;
      var bytes = await x.readAsBytes();
      if (bytes.length > 280 * 1024) {
        _toast('图片过大，请换一张小图', isError: true);
        return;
      }
      await _sendRaw('【图片】data:image/jpeg;base64,${base64Encode(bytes)}');
    } catch (_) {
      _toast('图片发送失败', isError: true);
    }
  }

  Future<void> _sendFile() async {
    // MVP：文件以 base64 随消息发送（小于约300KB），点气泡可保存到本机
    try {
      final x = await ImagePicker().pickMedia();
      final path = x?.path;
      if (path == null) return;
      final f = File(path);
      final bytes = await f.readAsBytes();
      if (bytes.length > 280 * 1024) {
        _toast('文件过大（需小于300KB），暂不支持', isError: true);
        return;
      }
      final name = path.split('/').last.split('\\').last;
      await _sendRaw('【文件】$name|${(bytes.length / 1024).toStringAsFixed(0)}KB|${base64Encode(bytes)}');
    } catch (_) {
      _toast('文件发送失败', isError: true);
    }
  }

  Future<void> _saveFileMessage(String content) async {
    try {
      final parts = content.substring(4).split('|');
      if (parts.length < 3) return;
      final bytes = base64Decode(parts[2]);
      final dir = await getApplicationDocumentsDirectory();
      final safe = parts[0].replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final saved = await File('${dir.path}/$safe').writeAsBytes(bytes);
      if (mounted) _toast('已保存到应用目录：${saved.path}', isError: false);
    } catch (_) {
      if (mounted) _toast('保存失败', isError: true);
    }
  }

  Future<void> _sendRaw(String content) async {
    setState(() => sending = true);
    try {
      if (widget.isGroup) {
        await api.groupSend(widget.realId, content);
      } else {
        await api.send(widget.realId, content);
      }
      await _load(silent: true);
    } on ApiException catch (e) {
      _toast(e.message, isError: true);
    } catch (_) {}
    if (mounted) setState(() => sending = false);
  }

  void _toast(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg), backgroundColor: isError ? const Color(0xFFE5484D) : kPrimary,
        behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
  }

  String _time(int ts) {
    final d = DateTime.fromMillisecondsSinceEpoch(ts);
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _poll?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final online = peer?.online ?? false;
    final title = widget.peerName;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          GestureDetector(
            onTap: () {
              if (widget.isGroup) {
                _showGroupInfo();
              } else {
                Navigator.push(context, MaterialPageRoute(builder: (_) => ProfilePage(userId: widget.realId)));
              }
            },
            child: CircleAvatar(radius: 18, backgroundColor: widget.isGroup ? kPrimary.withOpacity(0.15) : const Color(0xFFEDF2FF),
                child: widget.isGroup
                    ? const Icon(Icons.group, size: 20, color: kPrimary)
                    : UserAvatar(url: peer?.avatar, name: title, radius: 18))),
          const SizedBox(width: 2),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
            if (!widget.isGroup) Row(children: [
              if (online) const OnlineDot(size: 7),
              if (online) const SizedBox(width: 5),
              Text(online ? '在线' : '离线', style: TextStyle(fontSize: 11, color: online ? kOnline : Colors.black38)),
            ]) else Text('群聊', style: const TextStyle(fontSize: 11, color: Colors.black38)),
          ])),
        ]),
        actions: [
          if (selecting)
            TextButton.icon(
              onPressed: selected.isEmpty ? null : () async {
                final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      title: const Text('删除消息'),
                      content: Text('删除选中的 ${selected.length} 条消息？'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                        FilledButton(style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE5484D)),
                            onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
                      ],
                    ));
                if (ok == true) {
                  await api.deleteMessages(selected.toList());
                  if (!mounted) return;
                  setState(() { selecting = false; selected.clear(); });
                  _load(silent: true);
                }
              },
              icon: const Icon(Icons.delete_outline, size: 18),
              label: Text('删除(${selected.length})', style: const TextStyle(fontSize: 12)),
            )
          else
            IconButton(icon: const Icon(Icons.refresh), onPressed: () { _loadPeer(); _load(); }),
        ],
      ),
      body: Column(children: [
        Expanded(child: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(error!, style: const TextStyle(color: Colors.black38)),
                    TextButton(onPressed: _load, child: const Text('重试')),
                  ]))
                : (widget.isGroup ? _groupMessages() : _privateMessages())),
        _inputBar(),
      ]),
    );
  }

  Widget _privateMessages() {
    if (messages.isEmpty) return _emptyHint();
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      itemCount: messages.length,
      itemBuilder: (_, i) {
        final m = messages[i];
        final isSelf = m.senderId == widget.meId;
        // 已读回执：自己发的最后一条，对方点进聊天页（isRead）即显示已读
        final isLastSelf = isSelf && (i + 1 >= messages.length || messages[i + 1].senderId != widget.meId);
        final isSelected = selected.contains(m.id);
        final bubble = GestureDetector(
          onLongPress: () { setState(() { selecting = true; selected.add(m.id); }); },
          onTap: selecting ? () { setState(() { if (selected.contains(m.id)) { selected.remove(m.id); } else { selected.add(m.id); } }); } : null,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 2),
            padding: const EdgeInsets.all(2),
            decoration: isSelected ? BoxDecoration(color: kPrimary.withOpacity(0.15), borderRadius: BorderRadius.circular(22)) : null,
            child: _bubble(m.content, isSelf, ts: m.createTime),
          ),
        );
        return Column(crossAxisAlignment: isSelf ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
          bubble,
          if (isSelf && isLastSelf && !selecting)
            Padding(padding: const EdgeInsets.only(right: 4, top: 1),
                child: Text(m.isRead ? '已读' : '未读', style: TextStyle(fontSize: 9, color: m.isRead ? kPrimary : Colors.black26))),
        ]);
      },
    );
  }

  Widget _groupMessages() {
    if (groupMessages.isEmpty) return _emptyHint();
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      itemCount: groupMessages.length,
      itemBuilder: (_, i) {
        final m = groupMessages[i];
        final isSelf = m.senderId == widget.meId;
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (!isSelf && (i == 0 || groupMessages[i - 1].senderId != m.senderId))
            Padding(padding: const EdgeInsets.only(left: 4, bottom: 2), child: Text(m.senderName, style: const TextStyle(fontSize: 10, color: Colors.black38))),
          _bubble(m.content, isSelf, ts: m.createTime),
        ]);
      },
    );
  }

  Widget _emptyHint() => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.waving_hand_outlined, size: 44, color: Colors.black12),
        const SizedBox(height: 10),
        const Text('打个招呼吧～ 点输入框旁 + 可发定位/图片/文件', style: TextStyle(color: Colors.black38, fontSize: 12)),
      ]));

  Widget _bubble(String content, bool isSelf, {required int ts}) {
    return Align(
      alignment: isSelf ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          color: isSelf ? kPrimary : Colors.white,
          border: isSelf ? null : Border.all(color: const Color(0xFFE8EAED)),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18), topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isSelf ? 18 : 4), bottomRight: Radius.circular(isSelf ? 4 : 18),
          ),
        ),
        child: Column(crossAxisAlignment: isSelf ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
          if (_isImage(content))
            ClipRRect(borderRadius: BorderRadius.circular(10),
                child: Image.memory(base64Decode(content.substring(4).split(',').last), width: 180, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Text('[图片加载失败]', style: TextStyle(fontSize: 12))))
          else if (_isLocation(content))
            GestureDetector(
              onTap: () {
                final coord = content.substring(4).split(',');
                final url = 'https://uri.amap.com/marker?position=${coord[1]},${coord[0]}&name=对方分享的位置';
                launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
              },
              child: Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(color: isSelf ? Colors.white.withOpacity(0.15) : const Color(0xFFF0F2F5), borderRadius: BorderRadius.circular(10)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.location_on, size: 28, color: isSelf ? Colors.white : kPrimary),
                    const SizedBox(width: 8),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('位置信息', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: isSelf ? Colors.white : Colors.black87)),
                      Text('点击查看地图', style: TextStyle(fontSize: 10, color: isSelf ? Colors.white70 : Colors.black38)),
                    ]),
                  ])),
            )
          else if (_isFile(content))
            GestureDetector(
              onTap: () => _saveFileMessage(content),
              child: Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(color: isSelf ? Colors.white.withOpacity(0.15) : const Color(0xFFF0F2F5), borderRadius: BorderRadius.circular(10)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.insert_drive_file, size: 26, color: isSelf ? Colors.white : kPrimary),
                    const SizedBox(width: 8),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(content.substring(4).split('|')[0], style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: isSelf ? Colors.white : Colors.black87)),
                      Text('${content.substring(4).split('|')[1]} · 点击保存', style: TextStyle(fontSize: 10, color: isSelf ? Colors.white70 : Colors.black38)),
                    ]),
                  ])),
            )
          else
            Text(content, style: TextStyle(fontSize: 15, height: 1.45, color: isSelf ? Colors.white : Colors.black87)),
          const SizedBox(height: 3),
          Text(_time(ts), style: TextStyle(fontSize: 9, color: isSelf ? Colors.white70 : Colors.black26)),
        ]),
      ),
    );
  }

  // 群信息：群名、成员列表、退出群聊
  Future<void> _showGroupInfo() async {
    try {
      final mine = await api.myGroups();
      final g = mine.where((x) => x.groupId == widget.realId).toList();
      if (g.isEmpty) { _toast('群信息加载失败', isError: true); return; }
      final memberIds = (await api.myGroups())
          .where((x) => x.groupId == widget.realId)
          .expand((x) => x.members)
          .map((m) => (m['user_id'] as num).toInt())
          .toList();
      final users = await api.usersByIds(memberIds);
      if (!mounted) return;
      await showModalBottomSheet(context: context, backgroundColor: Colors.white,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
          builder: (sheetCtx) => SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 14),
            Row(children: [
              const Icon(Icons.group, color: kPrimary, size: 26),
              const SizedBox(width: 10),
              Expanded(child: Text(widget.peerName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
              Text('共 ${users.length} 人', style: const TextStyle(fontSize: 12, color: Colors.black45)),
            ]),
            const SizedBox(height: 12),
            ConstrainedBox(constraints: const BoxConstraints(maxHeight: 260), child: ListView.builder(
              shrinkWrap: true,
              itemCount: users.length,
              itemBuilder: (_, i) => ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: UserAvatar(url: users[i].avatar, name: users[i].displayName, radius: 18),
                title: Text(users[i].displayName, style: const TextStyle(fontSize: 14)),
                subtitle: Text('@' + users[i].username, style: const TextStyle(fontSize: 11)),
              ),
            )),
            const SizedBox(height: 14),
            SizedBox(width: double.infinity, child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46),
                  side: const BorderSide(color: Color(0xFFE5484D)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: () async {
                final ok = await showDialog<bool>(context: sheetCtx, builder: (ctx) => AlertDialog(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      title: const Text('退出群聊'),
                      content: const Text('退出后将不再接收该群消息，确定退出吗？'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                        FilledButton(style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE5484D)),
                            onPressed: () => Navigator.pop(ctx, true), child: const Text('退出')),
                      ],
                    ));
                if (ok != true) return;
                try {
                  await api.quitGroup(widget.realId);
                  if (!sheetCtx.mounted) return;
                  Navigator.pop(sheetCtx);
                  if (!mounted) return;
                  Navigator.pop(context); // 返回消息列表
                  _toast('已退出群聊', isError: false);
                } on ApiException catch (e) {
                  if (sheetCtx.mounted) {
                    Navigator.pop(sheetCtx);
                    _toast(e.message, isError: true);
                  }
                }
              },
              icon: const Icon(Icons.logout_rounded, size: 18, color: Color(0xFFE5484D)),
              label: const Text('退出群聊', style: TextStyle(color: Color(0xFFE5484D))),
            )),
          ]))));
    } catch (e) {
      _toast('加载群信息失败', isError: true);
    }
  }

  Widget _inputBar() => Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
        decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Colors.grey.shade200))),
        child: SafeArea(
          top: false,
          child: Row(children: [
            // 加号：定位 / 照片 / 文件
            IconButton(onPressed: _showPlusMenu, icon: const Icon(Icons.add_circle_outline, color: kPrimary, size: 26)),
            Expanded(child: TextField(
              controller: _controller,
              minLines: 1, maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              decoration: const InputDecoration(hintText: '说点什么…', filled: true, contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10)),
            )),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _send,
              child: Container(width: 44, height: 44, decoration: const BoxDecoration(color: kPrimary, shape: BoxShape.circle),
                  child: sending
                      ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                      : const Icon(Icons.send_rounded, color: Colors.white, size: 20)),
            ),
          ]),
        ),
      );
}
