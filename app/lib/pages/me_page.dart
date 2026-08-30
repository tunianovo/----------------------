// ============================================================
// 我的：资料、我的订单、退出登录
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'chat_page.dart';

class MePage extends StatefulWidget {
  final UserAccount me;
  final VoidCallback onLogout;
  final void Function(UserAccount) onMeUpdated;
  const MePage({super.key, required this.me, required this.onLogout, required this.onMeUpdated});
  @override
  State<MePage> createState() => _MePageState();
}

class _MePageState extends State<MePage> with AutomaticKeepAliveClientMixin {
  List<OrderItem>? orders;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await api.orders();
      if (!mounted) return;
      setState(() => orders = list);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // 资料卡
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(children: [
              UserAvatar(url: widget.me.avatar, name: widget.me.displayName, radius: 30),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(widget.me.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 3),
                Text('账号：${widget.me.username}', style: const TextStyle(fontSize: 12, color: Colors.black45)),
                const SizedBox(height: 3),
                Text(widget.me.userType == 1 ? '技能提供者' : '普通客户',
                    style: const TextStyle(fontSize: 11, color: kPrimary, fontWeight: FontWeight.w600)),
              ])),
            ]),
          ),
        ),
        const SizedBox(height: 14),
        // 订单
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.fromLTRB(18, 16, 18, 4),
                child: Text('我的订单', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
            if (orders == null)
              const Padding(padding: EdgeInsets.all(28), child: Center(child: CircularProgressIndicator()))
            else if (orders!.isEmpty)
              const Padding(padding: EdgeInsets.all(28), child: Center(child: Text('还没有订单，去服务市场看看吧', style: TextStyle(color: Colors.black38, fontSize: 13))))
            else
              ...orders!.map(_orderTile),
          ]),
        ),
        const SizedBox(height: 14),
        Card(
          clipBehavior: Clip.antiAlias,
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
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
              if (ok == true) widget.onLogout();
            },
          ),
        ),
        const SizedBox(height: 8),
        const Center(child: Text('己曜 v1.0.1', style: TextStyle(fontSize: 11, color: Colors.black26))),
      ]),
    );
  }

  Widget _orderTile(OrderItem o) {
    final statusColor = switch (o.status) { 2 => const Color(0xFF2ECC71), 3 => Colors.black26, _ => const Color(0xFFF5A623) };
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 2),
      leading: o.serviceCover != null && o.serviceCover!.isNotEmpty
          ? ClipRRect(borderRadius: BorderRadius.circular(10),
              child: Image.network('$kSiteBase/${o.serviceCover}', width: 52, height: 52, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(width: 52, height: 52, color: const Color(0xFFEDF2FF),
                      child: const Icon(Icons.design_services, color: kPrimary, size: 22))))
          : Container(width: 52, height: 52, decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.design_services, color: kPrimary, size: 22)),
      title: Text(o.serviceTitle ?? '服务', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      subtitle: Text('${o.amBuyer ? '已购 · 卖家' : '来自买家'} ${o.peerName}', style: const TextStyle(fontSize: 12, color: Colors.black45)),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('¥${_fmt(o.price)}', style: const TextStyle(color: kPrimary, fontWeight: FontWeight.w800, fontSize: 15)),
        Text(o.statusText, style: TextStyle(fontSize: 11, color: statusColor)),
      ]),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: o.peerId, peerName: o.peerName, meId: widget.me.id))),
    );
  }

  String _fmt(double p) => p == p.roundToDouble() ? p.toStringAsFixed(0) : p.toStringAsFixed(2);
}
