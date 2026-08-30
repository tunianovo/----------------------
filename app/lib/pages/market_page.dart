// ============================================================
// 服务市场：浏览服务、查看详情、下单、联系卖家
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'chat_page.dart';

class MarketPage extends StatefulWidget {
  final UserAccount me;
  const MarketPage({super.key, required this.me});
  @override
  State<MarketPage> createState() => _MarketPageState();
}

class _MarketPageState extends State<MarketPage> {
  List<ServiceItem>? items;
  String? error;
  String keyword = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await api.services();
      if (!mounted) return;
      setState(() { items = list; error = null; });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => error = '加载失败，请下拉重试');
    }
  }

  List<ServiceItem> get _filtered {
    final all = items ?? [];
    if (keyword.isEmpty) return all;
    return all.where((s) => s.title.contains(keyword) || s.desc.contains(keyword) || s.tags.any((t) => t.contains(keyword))).toList();
  }

  Future<void> _openDetail(ServiceItem s) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _DetailSheet(service: s, me: widget.me),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('服务市场')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: kPrimary,
        child: items == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : _buildList(),
      ),
    );
  }

  Widget _buildList() {
    final list = _filtered;
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => keyword = v.trim()),
              decoration: const InputDecoration(hintText: '搜索服务、技能…', prefixIcon: Icon(Icons.search)),
            ),
          ),
        ),
        if (error != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(children: [
                const Icon(Icons.cloud_off, size: 44, color: Colors.black26),
                const SizedBox(height: 12),
                Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black45)),
                const SizedBox(height: 12),
                FilledButton(onPressed: _load, child: const Text('重试')),
              ]),
            ),
          )
        else if (list.isEmpty)
          const SliverToBoxAdapter(
            child: Padding(padding: EdgeInsets.all(48), child: Center(child: Text('没有找到相关服务', style: TextStyle(color: Colors.black38)))),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverList.separated(
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _ServiceCard(service: list[i], onTap: () => _openDetail(list[i])),
            ),
          ),
      ],
    );
  }
}

// ---------- 服务卡片 ----------
class _ServiceCard extends StatelessWidget {
  final ServiceItem service;
  final VoidCallback onTap;
  const _ServiceCard({required this.service, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (service.coverUrl.isNotEmpty)
              SizedBox(
                height: 140, width: double.infinity,
                child: Image.network(service.coverUrl, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(color: const Color(0xFFEDF2FF), alignment: Alignment.center,
                      child: const Icon(Icons.design_services, size: 40, color: kPrimary))),
              ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(service.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                  Text('¥${_fmtPrice(service.price)}', style: const TextStyle(color: kPrimary, fontSize: 17, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 6),
                Text(service.desc, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.4)),
                const SizedBox(height: 10),
                Row(children: [
                  UserAvatar(name: service.sellerName, radius: 11),
                  const SizedBox(width: 6),
                  Text(service.sellerName, style: const TextStyle(fontSize: 12, color: Colors.black54)),
                  if (service.sellerOnline) ...[
                    const SizedBox(width: 6),
                    const OnlineDot(size: 7),
                  ],
                  const Spacer(),
                  ...service.tags.take(3).map((t) => Container(
                        margin: const EdgeInsets.only(left: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                        child: Text(t, style: const TextStyle(fontSize: 10, color: kPrimary)),
                      )),
                ]),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

String _fmtPrice(double p) => p == p.roundToDouble() ? p.toStringAsFixed(0) : p.toStringAsFixed(2);

// ---------- 服务详情弹层 ----------
class _DetailSheet extends StatelessWidget {
  final ServiceItem service;
  final UserAccount me;
  const _DetailSheet({required this.service, required this.me});

  @override
  Widget build(BuildContext context) {
    final isMine = service.userId == me.id;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          if (service.coverUrl.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(height: 170, width: double.infinity,
                  child: Image.network(service.coverUrl, fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(color: const Color(0xFFEDF2FF)))),
            ),
          const SizedBox(height: 16),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(service.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
            Text('¥${_fmtPrice(service.price)}', style: const TextStyle(color: kPrimary, fontSize: 22, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 4),
          Row(children: [
            Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                child: Text(service.serviceType, style: const TextStyle(fontSize: 11, color: kPrimary))),
            const SizedBox(width: 8),
            Text(service.subCategory, style: const TextStyle(fontSize: 12, color: Colors.black45)),
          ]),
          const SizedBox(height: 14),
          Text(service.desc, style: const TextStyle(fontSize: 14, color: Colors.black87, height: 1.6)),
          const SizedBox(height: 14),
          Wrap(spacing: 8, runSpacing: 8, children: service.tags.map((t) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: const Color(0xFFF0F2F5), borderRadius: BorderRadius.circular(20)),
                child: Text('# $t', style: const TextStyle(fontSize: 12, color: Colors.black54)),
              )).toList()),
          const SizedBox(height: 18),
          Row(children: [
            UserAvatar(name: service.sellerName, radius: 18),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(service.sellerName, style: const TextStyle(fontWeight: FontWeight.w600)),
              Row(children: [
                if (service.sellerOnline) const OnlineDot(size: 7),
                if (service.sellerOnline) const SizedBox(width: 5),
                Text(service.sellerOnline ? '在线' : '离线', style: TextStyle(fontSize: 11, color: service.sellerOnline ? kOnline : Colors.black38)),
              ]),
            ]),
          ]),
          const SizedBox(height: 20),
          if (!isMine)
            Row(children: [
              Expanded(child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48),
                    side: const BorderSide(color: kPrimary), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                onPressed: () async {
                  Navigator.pop(context);
                  // 打开与卖家的聊天（会话不存在也直接进入，发送首条消息后建立）
                  Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: service.userId, peerName: service.sellerName, meId: me.id)));
                },
                icon: const Icon(Icons.chat_bubble_outline, size: 18),
                label: const Text('聊一聊'),
              )),
              const SizedBox(width: 12),
              Expanded(child: FilledButton.icon(
                onPressed: () async {
                  try {
                    await api.createOrder(service.id);
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text('下单成功！已通知 ${service.sellerName}，可在「我的-我的订单」查看'),
                      backgroundColor: kPrimary, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                  } on ApiException catch (e) {
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(e.message), backgroundColor: const Color(0xFFE5484D),
                        behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                  }
                },
                icon: const Icon(Icons.shopping_bag_outlined, size: 18),
                label: const Text('立即下单'),
              )),
            ])
          else
            const Center(child: Text('这是你发布的服务', style: TextStyle(color: Colors.black38, fontSize: 13))),
        ]),
      ),
    );
  }
}
