// ============================================================
// 聊天窗口：气泡、在线状态、已读、轮询新消息
// ============================================================
import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';

class ChatPage extends StatefulWidget {
  final int peerId;
  final String peerName;
  final int meId; // 当前登录用户id（判断消息方向）
  const ChatPage({super.key, required this.peerId, required this.peerName, required this.meId});
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  List<ChatMessage> messages = [];
  UserAccount? peer;
  bool sending = false;
  bool loading = true;
  String? error;
  StreamSubscription? _poll;

  @override
  void initState() {
    super.initState();
    _loadPeer();
    _load();
    _poll = Stream.periodic(const Duration(seconds: 4)).listen((_) => _load(silent: true));
  }

  Future<void> _loadPeer() async {
    try {
      final list = await api.usersByIds([widget.peerId]);
      if (mounted && list.isNotEmpty) setState(() => peer = list.first);
    } catch (_) {}
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final list = await api.history(widget.peerId);
      if (!mounted) return;
      setState(() { messages = list; loading = false; error = null; });
      api.markRead(widget.peerId).catchError((_) {});
      _scrollToBottom();
    } catch (e) {
      if (!mounted || silent) return;
      setState(() { error = '消息加载失败'; loading = false; });
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || sending) return;
    setState(() => sending = true);
    try {
      await api.send(widget.peerId, text);
      _controller.clear();
      await _load(silent: true);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message),
            backgroundColor: const Color(0xFFE5484D), behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
      }
    } catch (_) {}
    if (mounted) setState(() => sending = false);
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
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          UserAvatar(url: peer?.avatar, name: widget.peerName, radius: 18),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.peerName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Row(children: [
              if (online) const OnlineDot(size: 7),
              if (online) const SizedBox(width: 5),
              Text(online ? '在线' : '离线', style: TextStyle(fontSize: 11, color: online ? kOnline : Colors.black38)),
            ]),
          ]),
        ]),
        actions: [
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
                : messages.isEmpty
                    ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.waving_hand_outlined, size: 44, color: Colors.black12),
                        const SizedBox(height: 10),
                        const Text('打个招呼吧～', style: TextStyle(color: Colors.black38)),
                      ]))
                    : _messages()),
        _inputBar(),
      ]),
    );
  }

  Widget _messages() {
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      itemCount: messages.length,
      itemBuilder: (_, i) {
        final m = messages[i];
        final isSelf = m.senderId == widget.meId;
        return Align(
          alignment: isSelf ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
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
              Text(m.content, style: TextStyle(fontSize: 15, height: 1.45, color: isSelf ? Colors.white : Colors.black87)),
              const SizedBox(height: 3),
              Text(_time(m.createTime), style: TextStyle(fontSize: 9, color: isSelf ? Colors.white70 : Colors.black26)),
            ]),
          ),
        );
      },
    );
  }

  Widget _inputBar() => Container(
        padding: EdgeInsets.fromLTRB(14, 10, 14, 10 + MediaQuery.of(context).padding.bottom * 0),
        decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Colors.grey.shade200))),
        child: SafeArea(
          top: false,
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _controller,
                minLines: 1, maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: const InputDecoration(hintText: '说点什么…', filled: true),
              ),
            ),
            const SizedBox(width: 10),
            GestureDetector(
              onTap: _send,
              child: Container(
                width: 46, height: 46,
                decoration: const BoxDecoration(color: kPrimary, shape: BoxShape.circle),
                child: sending
                    ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                    : const Icon(Icons.send_rounded, color: Colors.white, size: 21),
              ),
            ),
          ]),
        ),
      );
}
