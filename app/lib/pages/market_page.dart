// ============================================================
// 服务市场：浏览服务、查看详情、下单、联系卖家
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../cache.dart';
import '../theme.dart';
import 'chat_page.dart';
import 'projects_page.dart';

class MarketPage extends StatefulWidget {
  final UserAccount me;
  final bool isTech;
  const MarketPage({super.key, required this.me, this.isTech = false});
  @override
  State<MarketPage> createState() => _MarketPageState();
}

class _MarketPageState extends State<MarketPage> {
  List<ServiceItem>? items;
  String? error;
  String keyword = '';
  String category = '全部';
  static const categories = ['全部', '线上数字服务', '手作实物定制', '同城线下劳务'];
  String viewMode = 'services'; // services 服务市场 / tasks 需求大厅
  List<TaskItem>? taskItems;
  String? taskError;
  List<ProjectItem>? cachedProjects;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // 共创项目数据（供搜索联想）
    api.projects().then((ps) { if (mounted) setState(() => cachedProjects = ps); }).catchError((_) {});
    // 本地缓存先渲染（秒开），网络刷新后替换
    if (items == null) {
      final cached = await LocalCache.get('services');
      if (cached != null && mounted) {
        setState(() => items = (cached as List).map(ServiceItem.fromJson).toList());
      }
    }
    try {
      final list = await api.services(mine: widget.isTech);
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

  Future<void> _publish() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _PublishSheet(onDone: _load),
    );
  }

  List<ProjectItem> get _matchedProjects {
    if (keyword.isEmpty) return [];
    return (cachedProjects ?? []).where((p) => p.name.contains(keyword) || p.desc.contains(keyword) || p.needSkills.any((s) => s.contains(keyword))).toList();
  }

  List<ServiceItem> get _filtered {
    var all = items ?? [];
    if (category != '全部') all = all.where((s) => s.serviceType == category).toList();
    if (keyword.isNotEmpty) {
      all = all.where((s) => s.title.contains(keyword) || s.desc.contains(keyword) || s.tags.any((t) => t.contains(keyword))).toList();
    }
    return all;
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
      appBar: AppBar(
        title: Text(widget.isTech ? '技能市场' : '服务市场'),
        actions: [
          if (widget.isTech)
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'services', label: Text('服务')),
                ButtonSegment(value: 'tasks', label: Text('需求大厅')),
              ],
              selected: {viewMode},
              onSelectionChanged: (s) => setState(() { viewMode = s.first; if (s.first == 'tasks') _loadTasks(); }),
              style: SegmentedButton.styleFrom(
                selectedBackgroundColor: kPrimary,
                selectedForegroundColor: Colors.white,
                visualDensity: VisualDensity.compact,
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: widget.isTech ? _publish : _publishDemand,
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: Text(widget.isTech ? '发布服务' : '发布需求'),
      ),
      body: viewMode == 'tasks' ? _tasksView() : RefreshIndicator(
        onRefresh: _load,
        color: kPrimary,
        child: items == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : _buildList(),
      ),
    );
  }

  // ---------- 需求大厅（技术端接单 / 所有人可见） ----------
  Future<void> _loadTasks() async {
    if (taskItems == null) {
      final cached = await LocalCache.get('tasks');
      if (cached != null && mounted) {
        setState(() => taskItems = (cached as List).map(TaskItem.fromJson).toList());
      }
    }
    try {
      final list = await api.tasks();
      if (!mounted) return;
      setState(() { taskItems = list; taskError = null; });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => taskError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => taskError = '加载失败，请下拉重试');
    }
  }

  Future<void> _publishDemand() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _DemandSheet(onDone: () { if (viewMode == 'tasks') _loadTasks(); }),
    );
  }

  Widget _tasksView() {
    final list = taskItems ?? [];
    return RefreshIndicator(
      onRefresh: _loadTasks,
      color: kPrimary,
      child: taskItems == null && taskError == null
          ? const Center(child: CircularProgressIndicator())
          : taskError != null
              ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Column(children: [
                  const Icon(Icons.cloud_off, size: 44, color: Colors.black26),
                  const SizedBox(height: 12),
                  Text(taskError!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black45)),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _loadTasks, child: const Text('重试')),
                ]))])
              : list.isEmpty
                  ? ListView(children: const [Padding(padding: EdgeInsets.symmetric(vertical: 110), child: Column(children: [
                      Icon(Icons.assignment_outlined, size: 56, color: Colors.black12),
                      SizedBox(height: 14),
                      Text('暂无需求，点右下角发布第一条吧', style: TextStyle(color: Colors.black38)),
                    ]))])
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (_, i) {
                        final t = list[i];
                        final mine = t.publisherId == widget.me.id;
                        final taken = t.status != 0;
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
                                Text('¥${t.budget == t.budget.roundToDouble() ? t.budget.toStringAsFixed(0) : t.budget.toStringAsFixed(2)}',
                                    style: const TextStyle(color: kPrimary, fontSize: 16, fontWeight: FontWeight.w800)),
                              ]),
                              const SizedBox(height: 6),
                              Text(t.desc, maxLines: 2, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.4)),
                              const SizedBox(height: 10),
                              Row(children: [
                                UserAvatar(name: t.publisherName, radius: 11),
                                const SizedBox(width: 6),
                                Text(t.publisherName, style: const TextStyle(fontSize: 12, color: Colors.black54)),
                                if (t.publisherOnline) ...[const SizedBox(width: 5), const OnlineDot(size: 6)],
                                if (t.deadline.isNotEmpty) ...[
                                  const SizedBox(width: 8),
                                  Icon(Icons.schedule, size: 13, color: Colors.black38),
                                  const SizedBox(width: 2),
                                  Text(t.deadline, style: const TextStyle(fontSize: 11, color: Colors.black45)),
                                ],
                                const Spacer(),
                                if (taken)
                                  Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(color: const Color(0xFFE8F8EE), borderRadius: BorderRadius.circular(20)),
                                    child: const Text('已接单', style: TextStyle(fontSize: 10, color: Color(0xFF27AE60), fontWeight: FontWeight.w600)))
                                else if (!mine)
                                  FilledButton(
                                    style: FilledButton.styleFrom(minimumSize: const Size(0, 34),
                                        padding: const EdgeInsets.symmetric(horizontal: 14),
                                        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    onPressed: () async {
                                      try {
                                        await api.takeTask(t.id);
                                        if (!mounted) return;
                                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                            content: Text('接单成功！已通知 ${t.publisherName}，去消息里沟通吧'),
                                            backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                                        _loadTasks();
                                      } on ApiException catch (e) {
                                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                            content: Text(e.message), backgroundColor: const Color(0xFFE5484D),
                                            behavior: SnackBarBehavior.floating,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                                      }
                                    },
                                    child: const Text('立即接单'),
                                  )
                                else
                                  const Text('我发布的', style: TextStyle(fontSize: 11, color: Colors.black38)),
                              ]),
                            ]),
                          ),
                        );
                      },
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
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: TextField(
              onChanged: (v) => setState(() => keyword = v.trim()),
              decoration: const InputDecoration(hintText: '搜索服务、技能…', prefixIcon: Icon(Icons.search)),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 52,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final c = categories[i];
                final selected = category == c;
                return ChoiceChip(
                  label: Text(c),
                  selected: selected,
                  selectedColor: kPrimary,
                  labelStyle: TextStyle(fontSize: 12, color: selected ? Colors.white : Colors.black54),
                  showCheckmark: false,
                  visualDensity: VisualDensity.compact,
                  onSelected: (_) => setState(() => category = c),
                );
              },
            ),
          ),
        ),
        if (_matchedProjects.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('相关共创项目', style: TextStyle(fontSize: 12, color: Colors.black38)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: _matchedProjects.take(4).map((pj) {
                      return ActionChip(
                        avatar: const Icon(Icons.groups, size: 15, color: kPrimary),
                        label: Text(pj.name, style: const TextStyle(fontSize: 11)),
                        backgroundColor: const Color(0xFFF0F4FF),
                        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectsPage(me: widget.me))),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          )
        else if (false)
          const SliverToBoxAdapter(child: SizedBox())
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

// ---------- 发布服务表单（技术端） ----------
class _PublishSheet extends StatefulWidget {
  final VoidCallback onDone;
  const _PublishSheet({required this.onDone});
  @override
  State<_PublishSheet> createState() => _PublishSheetState();
}

class _PublishSheetState extends State<_PublishSheet> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _price = TextEditingController();
  final _sub = TextEditingController();
  final _tags = TextEditingController();
  String serviceType = '线上数字服务';
  static const types = ['线上数字服务', '手作实物定制', '同城线下劳务'];
  bool busy = false;

  Future<void> _submit() async {
    final title = _title.text.trim();
    final desc = _desc.text.trim();
    final price = double.tryParse(_price.text.trim());
    if (title.isEmpty || desc.isEmpty || price == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('标题、描述、价格都要填写哦'),
          behavior: SnackBarBehavior.floating));
      return;
    }
    setState(() => busy = true);
    try {
      await api.publishService(
        title: title,
        desc: desc,
        price: price,
        serviceType: serviceType,
        subCategory: _sub.text.trim(),
        tags: _tags.text.split(RegExp('[,，]')).map((e) => e.trim()).where((e) => e.isNotEmpty).toList(),
      );
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('发布成功！你的服务已上架'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
      widget.onDone();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message),
          backgroundColor: const Color(0xFFE5484D), behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 14),
          const Text('发布服务', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          TextField(controller: _title, decoration: const InputDecoration(hintText: '服务标题，如：短视频剪辑与后期')),
          const SizedBox(height: 10),
          TextField(controller: _desc, maxLines: 3, decoration: const InputDecoration(hintText: '服务描述：内容、交付时间、修改次数等')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _price, keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '价格（元）', prefixIcon: Icon(Icons.payments_outlined)))),
            const SizedBox(width: 10),
            Expanded(child: DropdownButtonFormField<String>(
              value: serviceType,
              decoration: const InputDecoration(hintText: '类型'),
              items: types.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 13)))).toList(),
              onChanged: (v) => setState(() => serviceType = v ?? serviceType),
            )),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _sub, decoration: const InputDecoration(hintText: '细分（选填），如：PPT制作'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _tags, decoration: const InputDecoration(hintText: '标签，逗号分隔'))),
          ]),
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : _submit, child: busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('发布上架')),
          const SizedBox(height: 6),
        ]),
      ),
    );
  }
}

// ---------- 发布需求表单（用户端） ----------
class _DemandSheet extends StatefulWidget {
  final VoidCallback onDone;
  const _DemandSheet({required this.onDone});
  @override
  State<_DemandSheet> createState() => _DemandSheetState();
}

class _DemandSheetState extends State<_DemandSheet> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _budget = TextEditingController();
  final _deadline = TextEditingController();
  bool busy = false;

  Future<void> _submit() async {
    final title = _title.text.trim();
    final desc = _desc.text.trim();
    final budget = double.tryParse(_budget.text.trim());
    if (title.isEmpty || desc.isEmpty || budget == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('标题、描述、预算都要填写哦'),
          behavior: SnackBarBehavior.floating));
      return;
    }
    setState(() => busy = true);
    try {
      await api.createTask(title: title, desc: desc, budget: budget, deadline: _deadline.text.trim());
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('需求发布成功！技术端可以在需求大厅看到并接单'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
      widget.onDone();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message),
          backgroundColor: const Color(0xFFE5484D), behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 14),
          const Text('发布需求', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          TextField(controller: _title, decoration: const InputDecoration(hintText: '需求标题，如：求一份答辩PPT美化')),
          const SizedBox(height: 10),
          TextField(controller: _desc, maxLines: 3, decoration: const InputDecoration(hintText: '需求描述：内容、要求、交付时间等')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _budget, keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '预算（元）', prefixIcon: Icon(Icons.payments_outlined)))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _deadline,
                decoration: const InputDecoration(hintText: '截止时间（选填），如：3天内'))),
          ]),
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : _submit, child: busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('发布需求')),
          const SizedBox(height: 6),
        ]),
      ),
    );
  }
}
