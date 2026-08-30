// ============================================================
// 我的：资料、我的订单、退出登录
// ============================================================
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../main.dart';
import '../cache.dart';
import '../theme.dart';
import 'chat_page.dart';
import 'projects_page.dart';

class MePage extends StatefulWidget {
  final UserAccount me;
  final String role;
  final void Function(String) onRoleChanged;
  final VoidCallback onLogout;
  final VoidCallback onCheckUpdate;
  const MePage({super.key, required this.me, required this.role, required this.onRoleChanged, required this.onLogout, required this.onCheckUpdate});
  @override
  State<MePage> createState() => _MePageState();
}

class _MePageState extends State<MePage> with AutomaticKeepAliveClientMixin {
  List<OrderItem>? orders;
  String? avatarPath;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
    _loadAvatar();
  }

  // 头像只保存在本地（选图后拷贝到应用目录，不上传服务器）
  Future<void> _loadAvatar() async {
    final p = await SharedPreferences.getInstance();
    final path = p.getString('my_avatar');
    if (path != null && File(path).existsSync() && mounted) setState(() => avatarPath = path);
  }

  Future<void> _pickAvatar() async {
    try {
      final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 512, maxHeight: 512, imageQuality: 85);
      if (x == null) return;
      final dir = await getApplicationDocumentsDirectory();
      final saved = await File(x.path).copy('${dir.path}/my_avatar.png');
      final p = await SharedPreferences.getInstance();
      await p.setString('my_avatar', saved.path);
      if (mounted) setState(() => avatarPath = saved.path);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('头像设置失败'), behavior: SnackBarBehavior.floating));
    }
  }

  Future<void> _load() async {
    // 订单：退出前自动存在本地，下次进来先读本地秒开，网络刷新成功后替换
    if (orders == null) {
      final cached = await LocalCache.get('orders');
      if (cached != null && mounted) {
        setState(() => orders = (cached as List).map(OrderItem.fromJson).toList());
      }
    }
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
              // 本地头像（点可更换，仅存本机不上传）
              GestureDetector(
                onTap: _pickAvatar,
                child: Stack(children: [
                  CircleAvatar(radius: 30, backgroundColor: const Color(0xFFEDF2FF),
                    child: ClipOval(child: avatarPath != null
                        ? Image.file(File(avatarPath!), width: 60, height: 60, fit: BoxFit.cover)
                        : Text(widget.me.displayName.characters.first, style: const TextStyle(fontSize: 24, color: kPrimary, fontWeight: FontWeight.w700)))),
                  Positioned(right: -2, bottom: -2, child: Container(padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(color: kPrimary, shape: BoxShape.circle),
                      child: const Icon(Icons.camera_alt, size: 11, color: Colors.white))),
                ]),
              ),
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
        // 身份切换（用户端 / 技术端）
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('身份切换', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('技术端可发布服务、切换到技能市场视角', style: TextStyle(fontSize: 12, color: Colors.black45)),
              const SizedBox(height: 12),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'user', icon: Icon(Icons.person_outline, size: 18), label: Text('用户端')),
                  ButtonSegment(value: 'tech', icon: Icon(Icons.engineering_outlined, size: 18), label: Text('技术端')),
                ],
                selected: {widget.role},
                onSelectionChanged: (s) { if (s.first != widget.role) widget.onRoleChanged(s.first); },
                style: SegmentedButton.styleFrom(
                  selectedBackgroundColor: kPrimary,
                  selectedForegroundColor: Colors.white,
                ),
              ),
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
            contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 2),
            leading: const Icon(Icons.groups_outlined, color: kPrimary),
            title: const Text('共创项目', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text('组队完成项目，技能互补收益共享', style: TextStyle(fontSize: 12)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectsPage(me: widget.me))),
          ),
        ),
        const SizedBox(height: 10),
        Card(
          clipBehavior: Clip.antiAlias,
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 2),
            leading: const Icon(Icons.system_update_outlined, color: kPrimary),
            title: const Text('检查更新', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text('当前版本 v1.0.3', style: TextStyle(fontSize: 12, color: Colors.black38)),
            onTap: widget.onCheckUpdate,
          ),
        ),
        const SizedBox(height: 10),
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
        const Center(child: Text('己曜 v1.0.3', style: TextStyle(fontSize: 11, color: Colors.black26))),
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
