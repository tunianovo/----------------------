// ============================================================
// 我的订单：进行中/历史 分栏、长按取消未接单订单、交易快照详情、客服入口
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../cache.dart';
import '../theme.dart';
import 'chat_page.dart';

class OrdersPage extends StatefulWidget {
  final UserAccount me;
  const OrdersPage({super.key, required this.me});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
  List<OrderItem>? all;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // 本地缓存秒开，刷新成功后替换（即"退出前保存本地、上线后更新"）
    if (all == null) {
      final cached = await LocalCache.get('orders');
      if (cached != null && mounted) {
        setState(() => all = (cached as List).map(OrderItem.fromJson).toList());
      }
    }
    try {
      final list = await api.orders();
      if (!mounted) return;
      setState(() { all = list; error = null; });
    } catch (_) {
      if (!mounted) return;
      setState(() => error = '订单加载失败，请下拉重试');
    }
  }

  List<OrderItem> get _ongoing => (all ?? []).where((o) => o.status == 0 || o.status == 1).toList();
  List<OrderItem> get _history => (all ?? []).where((o) => o.status == 2 || o.status == 3).toList();

  Future<void> _cancel(OrderItem o) async {
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('取消订单'),
          content: Text('确定取消「${o.serviceTitle ?? '该订单'}」吗？\n仅对方接单前可取消。'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('再想想')),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE5484D)),
                onPressed: () => Navigator.pop(ctx, true), child: const Text('取消订单')),
          ],
        ));
    if (ok != true) return;
    try {
      await api.cancelOrder(o.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('订单已取消'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
      _load();
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message),
          backgroundColor: const Color(0xFFE5484D), behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    }
  }

  void _openDetail(OrderItem o) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => _OrderDetailPage(order: o, me: widget.me)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('我的订单'),
        bottom: TabBar(
          controller: _tab,
          labelColor: kPrimary,
          unselectedLabelColor: Colors.black45,
          indicatorColor: kPrimary,
          tabs: const [Tab(text: '进行中'), Tab(text: '历史订单')],
        ),
      ),
      body: all == null && error == null
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Center(child: Text(error!, style: const TextStyle(color: Colors.black45))))])
              : TabBarView(controller: _tab, children: [
                  _list(_ongoing, emptyText: '暂无进行中的订单', cancellable: true),
                  _list(_history, emptyText: '暂无历史订单', cancellable: false),
                ]),
    );
  }

  Widget _list(List<OrderItem> list, {required String emptyText, required bool cancellable}) {
    if (list.isEmpty) {
      return ListView(children: [Padding(padding: const EdgeInsets.symmetric(vertical: 110), child: Column(children: [
        const Icon(Icons.receipt_long_outlined, size: 54, color: Colors.black12),
        const SizedBox(height: 12),
        Text(emptyText, style: const TextStyle(color: Colors.black38)),
      ]))]);
    }
    return RefreshIndicator(
      onRefresh: _load,
      color: kPrimary,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: list.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final o = list[i];
          return GestureDetector(
            onLongPress: (cancellable && o.amBuyer && o.status == 0) ? () => _cancel(o) : null,
            onTap: () => _openDetail(o),
            child: Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                leading: o.snapshotCover != null && o.snapshotCover!.isNotEmpty
                    ? ClipRRect(borderRadius: BorderRadius.circular(10),
                        child: Image.network('$kSiteBase/${o.snapshotCover}', width: 52, height: 52, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _orderIcon()))
                    : _orderIcon(),
                title: Text(o.serviceTitle ?? '订单', maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const SizedBox(height: 2),
                  Text('${o.amBuyer ? '已购 · 卖家' : '来自买家'} ${o.peerName}', style: const TextStyle(fontSize: 12, color: Colors.black45)),
                  if (cancellable && o.amBuyer && o.status == 0)
                    const Text('长按可取消订单', style: TextStyle(fontSize: 10, color: Colors.black26)),
                ]),
                trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('¥${o.price == o.price.roundToDouble() ? o.price.toStringAsFixed(0) : o.price.toStringAsFixed(2)}',
                      style: const TextStyle(color: kPrimary, fontWeight: FontWeight.w800, fontSize: 15)),
                  Text(o.statusText, style: TextStyle(fontSize: 11, color: _statusColor(o.status))),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _orderIcon() => Container(width: 52, height: 52, decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(10)),
      child: const Icon(Icons.design_services, color: kPrimary, size: 22));

  Color _statusColor(int s) => switch (s) { 2 => const Color(0xFF2ECC71), 3 => Colors.black26, _ => const Color(0xFFF5A623) };
}

// ---------- 订单详情（交易快照 + 客服） ----------
class _OrderDetailPage extends StatelessWidget {
  final OrderItem order;
  final UserAccount me;
  const _OrderDetailPage({required this.order, required this.me});

  @override
  Widget build(BuildContext context) {
    final d = DateTime.fromMillisecondsSinceEpoch(order.createdAt);
    return Scaffold(
      appBar: AppBar(title: const Text('订单详情')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('交易快照', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const Spacer(),
            Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                child: Text(order.statusText, style: const TextStyle(fontSize: 11, color: kPrimary, fontWeight: FontWeight.w600))),
          ]),
          const SizedBox(height: 12),
          if (order.snapshotCover != null && order.snapshotCover!.isNotEmpty)
            ClipRRect(borderRadius: BorderRadius.circular(12),
                child: SizedBox(height: 150, width: double.infinity,
                    child: Image.network('$kSiteBase/${order.snapshotCover}', fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(color: const Color(0xFFEDF2FF))))),
          const SizedBox(height: 12),
          Text(order.serviceTitle ?? '服务', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          if ((order.snapshotDesc ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(order.snapshotDesc!, style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.6)),
          ],
          const SizedBox(height: 12),
          Row(children: [
            _kv('价格', '¥${order.price}'),
            const SizedBox(width: 24),
            _kv('类型', order.snapshotType ?? '-'),
            const SizedBox(width: 24),
            _kv('下单时间', '${d.month}/${d.day} ${d.hour}:${d.minute.toString().padLeft(2, '0')}'),
          ]),
        ]))),
        const SizedBox(height: 12),
        Card(child: ListTile(
          leading: UserAvatar(name: order.peerName, radius: 20),
          title: Text('${order.amBuyer ? '卖家' : '买家'}：${order.peerName}', style: const TextStyle(fontSize: 14)),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: order.peerId, peerName: order.peerName, meId: me.id))),
        )),
        const SizedBox(height: 12),
        // 交易分歧时找客服：客服有权调取双方聊天记录
        Card(child: ListTile(
          leading: const Icon(Icons.support_agent, color: kPrimary),
          title: const Text('申请客服介入', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          subtitle: const Text('交易产生分歧时，官方客服可查看双方聊天记录协助处理', style: TextStyle(fontSize: 11)),
          trailing: const Icon(Icons.chevron_right),
          onTap: () async {
            final kefu = await api.userByUsername('kefu01');
            if (!context.mounted) return;
            if (kefu == null) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('客服暂未上线'), behavior: SnackBarBehavior.floating));
              return;
            }
            await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: kefu.id, peerName: '官方客服', meId: me.id)));
          },
        )),
      ]),
    );
  }

  Widget _kv(String k, String v) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(k, style: const TextStyle(fontSize: 11, color: Colors.black38)),
        const SizedBox(height: 2),
        Text(v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      ]);
}
