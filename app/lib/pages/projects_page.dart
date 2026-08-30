// ============================================================
// 共创项目：浏览项目、加入团队（加入后自动与发起人建立会话）
// ============================================================
import 'package:flutter/material.dart';
import '../api.dart';
import '../main.dart';
import '../cache.dart';
import '../theme.dart';
import 'chat_page.dart';

class ProjectsPage extends StatefulWidget {
  final UserAccount me;
  const ProjectsPage({super.key, required this.me});
  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> with AutomaticKeepAliveClientMixin {
  List<ProjectItem>? items;
  String? error;
  final Set<int> joining = {};

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (items == null) {
      final cached = await LocalCache.get('projects');
      if (cached != null && mounted) {
        setState(() => items = (cached as List).map(ProjectItem.fromJson).toList());
      }
    }
    try {
      final list = await api.projects();
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

  Future<void> _join(ProjectItem p) async {
    joining.add(p.id);
    setState(() {});
    try {
      await api.joinProject(p.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('已加入「${p.name}」，已通知发起人，去消息里聊聊吧'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.message), backgroundColor: const Color(0xFFE5484D),
          behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
      await _load(); // 已加入等情况刷新状态
    } finally {
      joining.remove(p.id);
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      appBar: AppBar(title: const Text('共创项目')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: kPrimary,
        child: items == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Column(children: [
                    const Icon(Icons.cloud_off, size: 44, color: Colors.black26),
                    const SizedBox(height: 12),
                    Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black45)),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _load, child: const Text('重试')),
                  ]))])
                : _buildList(),
      ),
    );
  }

  Widget _buildList() {
    final list = items ?? [];
    if (list.isEmpty) {
      return ListView(children: const [
        Padding(padding: EdgeInsets.symmetric(vertical: 120), child: Column(children: [
          Icon(Icons.groups_outlined, size: 56, color: Colors.black12),
          SizedBox(height: 14),
          Text('暂无招募中的项目', style: TextStyle(color: Colors.black38)),
        ])),
      ]);
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: list.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, i) => _ProjectCard(
        project: list[i],
        me: widget.me,
        joining: joining.contains(list[i].id),
        onJoin: () => _join(list[i]),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  final ProjectItem project;
  final UserAccount me;
  final bool joining;
  final VoidCallback onJoin;
  const _ProjectCard({required this.project, required this.me, required this.joining, required this.onJoin});

  @override
  Widget build(BuildContext context) {
    final isCreator = project.creatorId == me.id;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(project.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
            Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: const Color(0xFFE8F8EE), borderRadius: BorderRadius.circular(20)),
                child: Text('招募中', style: const TextStyle(fontSize: 10, color: Color(0xFF27AE60), fontWeight: FontWeight.w600))),
          ]),
          const SizedBox(height: 8),
          Text(project.desc, maxLines: 3, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.5)),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 6, children: project.needSkills.map((s) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                child: Text('招募: $s', style: const TextStyle(fontSize: 11, color: kPrimary)),
              )).toList()),
          const SizedBox(height: 12),
          Row(children: [
            UserAvatar(name: project.creatorName, radius: 13),
            const SizedBox(width: 8),
            Text(project.creatorName, style: const TextStyle(fontSize: 12, color: Colors.black54)),
            if (project.creatorOnline) ...[const SizedBox(width: 5), const OnlineDot(size: 6)],
            const SizedBox(width: 10),
            Icon(Icons.group_outlined, size: 15, color: Colors.black38),
            const SizedBox(width: 3),
            Text('${project.memberCount}人', style: const TextStyle(fontSize: 12, color: Colors.black45)),
            const Spacer(),
            Text('¥${project.budget == project.budget.roundToDouble() ? project.budget.toStringAsFixed(0) : project.budget.toStringAsFixed(2)}',
                style: const TextStyle(color: kPrimary, fontSize: 15, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            if (!isCreator)
              Expanded(child: FilledButton.icon(
                onPressed: joining ? null : onJoin,
                icon: joining
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.how_to_reg_outlined, size: 18),
                label: const Text('加入团队'),
              ))
            else
              Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: project.creatorId, peerName: project.creatorName, meId: me.id))),
                icon: const Icon(Icons.chat_bubble_outline, size: 18),
                label: const Text('我是发起人'),
              )),
            const SizedBox(width: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 48),
                side: BorderSide(color: isCreator ? kPrimary.withOpacity(0.5) : Colors.grey.shade300),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(peerId: project.creatorId, peerName: project.creatorName, meId: me.id))),
              icon: const Icon(Icons.chat_bubble_outline, size: 16),
              label: const Text('聊一聊'),
            ),
          ]),
        ]),
      ),
    );
  }
}
