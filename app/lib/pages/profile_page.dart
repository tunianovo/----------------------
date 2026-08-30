// ============================================================
// 用户主页：头像、标签、技术介绍、作品展示、在线状态
// 从消息页用户列表 / 聊天窗口头像点击进入
// ============================================================
import 'dart:convert';
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'chat_page.dart';

class ProfilePage extends StatefulWidget {
  final int userId;
  const ProfilePage({super.key, required this.userId});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  UserAccount? user;
  List<String> works = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await api.usersByIds([widget.userId]);
      final w = await api.getWorks(widget.userId);
      if (!mounted) return;
      setState(() {
        user = list.isEmpty ? null : list.first;
        works = w;
        loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        error = '加载失败';
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = session.value;
    final isSelf = me != null && user != null && me.id == user!.id;
    return Scaffold(
      appBar: AppBar(title: const Text('个人主页')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null || user == null
              ? Center(child: Text(error ?? '用户不存在', style: const TextStyle(color: Colors.black38)))
              : ListView(padding: EdgeInsets.zero, children: [
                  // 头部：蓝底 + 头像 + 昵称 + 在线
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(20, 28, 20, 40),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(colors: [Color(0xFF0A6CFF), Color(0xFF00C2FF)]),
                    ),
                    child: Row(children: [
                      CircleAvatar(radius: 34, backgroundColor: Colors.white,
                          child: ClipOval(child: user!.avatar != null && user!.avatar!.isNotEmpty
                              ? Image.network(user!.avatar!, width: 62, height: 62, fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => _initial())
                              : _initial())),
                      const SizedBox(width: 16),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(user!.displayName, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: Colors.white)),
                        const SizedBox(height: 4),
                        Row(children: [
                          if (user!.online) const OnlineDot(size: 8),
                          if (user!.online) const SizedBox(width: 5),
                          Text(user!.online ? '在线' : '离线', style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          const SizedBox(width: 10),
                          Text(user!.userType == 1 ? '技能提供者' : '普通客户', style: const TextStyle(fontSize: 12, color: Colors.white70)),
                        ]),
                      ])),
                    ]),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -24),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        // 技能标签
                        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('技能标签', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 10),
                          if (user!.skillTag.trim().isEmpty)
                            const Text('还没有填写技能标签', style: TextStyle(fontSize: 12, color: Colors.black26))
                          else
                            Wrap(spacing: 8, runSpacing: 8, children: user!.skillTag
                                .split(RegExp('[,，]')).where((t) => t.trim().isNotEmpty)
                                .map((t) => Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                                      child: Text('# ${t.trim()}', style: const TextStyle(fontSize: 12, color: kPrimary)),
                                    )).toList()),
                          if (user!.bio.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text(user!.bio, style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.5)),
                          ],
                        ]))),
                        const SizedBox(height: 14),
                        // 作品展示
                        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('作品展示', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 12),
                          if (works.isEmpty)
                            const Text('暂无作品', style: TextStyle(fontSize: 12, color: Colors.black26))
                          else
                            GridView.builder(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8),
                              itemCount: works.length,
                              itemBuilder: (_, i) {
                                final data = works[i].split(',').last;
                                return ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Image.memory(
                                    base64Decode(data),
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(color: const Color(0xFFEDF2FF)),
                                  ),
                                );
                              },
                            ),
                        ]))),
                        const SizedBox(height: 18),
                        // 操作按钮
                        if (!isSelf && me != null)
                          Row(children: [
                            Expanded(child: FilledButton.icon(
                              onPressed: () => Navigator.push(context, MaterialPageRoute(
                                  builder: (_) => ChatPage(peerId: user!.id, peerName: user!.displayName, meId: me.id))),
                              icon: const Icon(Icons.chat_bubble_outline, size: 18),
                              label: const Text('聊一聊'),
                            )),
                          ])
                        else if (isSelf)
                          const Center(child: Text('这是你的主页', style: TextStyle(fontSize: 12, color: Colors.black26))),
                        const SizedBox(height: 30),
                      ]),
                    ),
                  ),
                ]),
    );
  }

  Widget _initial() => Center(
        child: Text(user!.displayName.characters.first,
            style: const TextStyle(fontSize: 26, color: kPrimary, fontWeight: FontWeight.w700)),
      );
}
