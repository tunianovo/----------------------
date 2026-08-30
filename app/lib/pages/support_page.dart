// ============================================================
// 客服：平台官方客服会话入口（后续可扩展工单/自助FAQ）
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'chat_page.dart';
import 'projects_page.dart';

class SupportPage extends StatefulWidget {
  final UserAccount me;
  const SupportPage({super.key, required this.me});
  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  UserAccount? kefu;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final u = await api.userByUsername('kefu01');
      if (!mounted) return;
      setState(() { kefu = u; loading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('客服')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(children: [
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(color: kPrimary.withOpacity(0.1), shape: BoxShape.circle),
                child: const Icon(Icons.support_agent, size: 34, color: kPrimary),
              ),
              const SizedBox(height: 12),
              const Text('平台官方客服', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('交易纠纷、账号问题、功能建议，都可以直接留言',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Colors.black45)),
              const SizedBox(height: 16),
              if (loading)
                const CircularProgressIndicator()
              else
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size(180, 46)),
                  onPressed: kefu == null
                      ? null
                      : () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: kefu!.id, peerName: kefu!.displayName, meId: widget.me.id))),
                  icon: const Icon(Icons.chat_bubble_outline, size: 18),
                  label: Text(kefu == null ? '客服暂未上线' : '联系官方客服'),
                ),
            ]),
          ),
        ),
        const SizedBox(height: 6),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.quiz_outlined, color: kPrimary),
              title: const Text('常见问题', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              subtitle: const Text('下单后如何沟通？接单如何结算？', style: TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _faq(context),
            ),
            const Divider(height: 1, indent: 16),
            ListTile(
              leading: const Icon(Icons.groups_outlined, color: kPrimary),
              title: const Text('共创项目', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              subtitle: const Text('组队完成项目，技能互补收益共享', style: TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                final me = session.value;
                if (me == null) return;
                Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectsPage(me: me)));
              },
            ),
          ]),
        ),
      ]),
    );
  }

  void _faq(BuildContext context) {
    showModalBottomSheet(context: context, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => SafeArea(child: Padding(padding: const EdgeInsets.all(22), child: Column(mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 14),
          const Text('常见问题', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          _qa('怎么找别人聊天？', '消息页顶部切到「用户」，搜索昵称/账号/技能，点开即可发消息。'),
          _qa('下单后怎么沟通？', '在「我的-我的订单」点订单，或直接在消息里联系对方。'),
          _qa('需求怎么发？', '用户端在服务页点「＋发布需求」，技术端在需求大厅接单。'),
          _qa('资金安全吗？', '目前为信息撮合平台，交易请双方线下协商，注意保留凭证。'),
        ]))));
  }

  Widget _qa(String q, String a) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Q: $q', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        const SizedBox(height: 3),
        Text('A: $a', style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.5)),
      ]));
}
