// ============================================================
// 我的：抖音式个人主页（背景图、头像、标签、技术介绍、作品展示）
// 背景图/头像/作品都只保存在本机，不上传服务器
// ============================================================
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../main.dart';
import '../theme.dart';
import 'orders_page.dart';
import 'projects_page.dart';
import 'settings_page.dart';

class MePage extends StatefulWidget {
  final UserAccount me;
  final String role;
  final void Function(String) onRoleChanged;
  final VoidCallback onLogout;
  final VoidCallback onCheckUpdate;
  final void Function(UserAccount) onMeUpdated;
  const MePage({
    super.key,
    required this.me,
    required this.role,
    required this.onRoleChanged,
    required this.onLogout,
    required this.onCheckUpdate,
    required this.onMeUpdated,
  });
  @override
  State<MePage> createState() => _MePageState();
}

class _MePageState extends State<MePage> with AutomaticKeepAliveClientMixin {
  String? avatarPath;
  String? bgPath;
  List<String> works = [];
  late String bio = widget.me.bio;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadLocal();
  }

  Future<void> _loadLocal() async {
    final p = await SharedPreferences.getInstance();
    final a = p.getString('my_avatar');
    final b = p.getString('my_bg');
    if (!mounted) return;
    setState(() {
      if (a != null && File(a).existsSync()) avatarPath = a;
      if (b != null && File(b).existsSync()) bgPath = b;
    });
    // 作品从服务端拉取（别人的主页也能看到）
    try {
      final w = await api.getWorks(widget.me.id);
      if (mounted) setState(() => works = w);
    } catch (_) {}
  }

  Future<String?> _pickAndSave(String saveName) async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1080, imageQuality: 85);
    if (x == null) return null;
    final dir = await getApplicationDocumentsDirectory();
    final saved = await File(x.path).copy('${dir.path}/$saveName');
    return saved.path;
  }

  Future<void> _pickAvatar() async {
    final path = await _pickAndSave('my_avatar.png');
    if (path == null || !mounted) return;
    (await SharedPreferences.getInstance()).setString('my_avatar', path);
    setState(() => avatarPath = path);
  }

  Future<void> _pickBg() async {
    final path = await _pickAndSave('my_bg.png');
    if (path == null || !mounted) return;
    (await SharedPreferences.getInstance()).setString('my_bg', path);
    setState(() => bgPath = path);
  }

  Future<void> _addWork() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 720, imageQuality: 40);
    if (x == null || !mounted) return;
    final bytes = await x.readAsBytes();
    if (bytes.length > 280 * 1024) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('作品图片过大，请换小图'), behavior: SnackBarBehavior.floating));
      return;
    }
    final list = [...works, 'data:image/jpeg;base64,' + base64Encode(bytes)];
    try {
      await api.saveWorks(list);
      if (!mounted) return;
      setState(() => works = list);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('作品已上传，别人能在你主页看到'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('作品上传失败，请重试'), behavior: SnackBarBehavior.floating));
    }
  }

  Future<void> _removeWork(int index) async {
    final list = [...works]..removeAt(index);
    try {
      await api.saveWorks(list);
      if (!mounted) return;
      setState(() => works = list);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('删除失败，请重试'), behavior: SnackBarBehavior.floating));
    }
  }

  // 编辑标签与介绍（标签同步到服务端，用于共创推荐匹配）
  Future<void> _editProfile() async {
    final tagsCtrl = TextEditingController(text: widget.me.skillTag);
    final bioCtrl = TextEditingController(text: bio);
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 14),
            const Text('编辑资料', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            TextField(controller: tagsCtrl, decoration: const InputDecoration(hintText: '技能标签，逗号分隔（用于共创推荐）')),
            const SizedBox(height: 10),
            TextField(controller: bioCtrl, maxLines: 3, decoration: const InputDecoration(hintText: '介绍一下你的技术/经验')),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('保存')),
            const SizedBox(height: 6),
          ]),
        ),
      ),
    );
    if (ok != true) return;
    try {
      await api.saveSettings(skillTag: tagsCtrl.text.trim(), bio: bioCtrl.text.trim());
      if (!mounted) return;
      setState(() => bio = bioCtrl.text.trim());
      widget.onMeUpdated(UserAccount(
        id: widget.me.id, username: widget.me.username, realName: widget.me.realName,
        userType: widget.me.userType, skillTag: tagsCtrl.text.trim(), phone: widget.me.phone,
        avatar: widget.me.avatar, online: true, lastSeen: widget.me.lastSeen,
        bio: bioCtrl.text.trim(), discoverable: widget.me.discoverable,
      ));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('资料已保存'),
          backgroundColor: kPrimary, behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('保存失败，请重试'), behavior: SnackBarBehavior.floating));
    }
  }

  void _openSettings() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => SettingsPage(
      me: widget.me, role: widget.role, onRoleChanged: widget.onRoleChanged,
      onLogout: widget.onLogout, onCheckUpdate: widget.onCheckUpdate, onMeUpdated: widget.onMeUpdated,
    )));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      body: ListView(padding: EdgeInsets.zero, children: [
        Stack(clipBehavior: Clip.none, children: [
          GestureDetector(
            onTap: _pickBg,
            child: Container(height: 170, width: double.infinity, color: const Color(0xFFDCE7FF),
                child: bgPath != null
                    ? Image.file(File(bgPath!), fit: BoxFit.cover)
                    : const Center(child: Text('点击上传背景图（仅本机保存）', style: TextStyle(fontSize: 11, color: Colors.black26)))),
          ),
          Positioned(top: MediaQuery.of(context).padding.top + 40, right: 12, child: Material(
            color: Colors.black26, borderRadius: BorderRadius.circular(18),
            child: InkWell(borderRadius: BorderRadius.circular(18), onTap: _openSettings,
                child: const Padding(padding: EdgeInsets.all(7), child: Icon(Icons.settings, color: Colors.white, size: 20))),
          )),
          Positioned(bottom: -26, left: 20, child: GestureDetector(
            onTap: _pickAvatar,
            child: Stack(children: [
              Container(padding: const EdgeInsets.all(3), decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: CircleAvatar(radius: 33, backgroundColor: const Color(0xFFEDF2FF),
                  child: ClipOval(child: avatarPath != null
                      ? Image.file(File(avatarPath!), width: 62, height: 62, fit: BoxFit.cover)
                      : Text(widget.me.displayName.characters.first, style: const TextStyle(fontSize: 26, color: kPrimary, fontWeight: FontWeight.w700))))),
              Positioned(right: 0, bottom: 0, child: Container(padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: kPrimary, shape: BoxShape.circle),
                  child: const Icon(Icons.camera_alt, size: 12, color: Colors.white))),
            ]),
          )),
        ]),
        const SizedBox(height: 34),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(widget.me.displayName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                  child: Text(widget.role == 'tech' ? '技术端' : '用户端', style: const TextStyle(fontSize: 10, color: kPrimary, fontWeight: FontWeight.w600))),
            ]),
            const SizedBox(height: 4),
            Text('账号：${widget.me.username}', style: const TextStyle(fontSize: 12, color: Colors.black38)),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 6, children: [
              ...widget.me.skillTag.split(RegExp('[,，]')).where((t) => t.trim().isNotEmpty).map((t) => Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: const Color(0xFFEDF2FF), borderRadius: BorderRadius.circular(20)),
                    child: Text('# ${t.trim()}', style: const TextStyle(fontSize: 12, color: kPrimary)),
                  )),
              if (widget.me.skillTag.trim().isEmpty)
                GestureDetector(onTap: _editProfile, child: const Text('＋ 添加技能标签（用于共创推荐）', style: TextStyle(fontSize: 12, color: Colors.black38))),
            ]),
            if (bio.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(bio, style: const TextStyle(fontSize: 13, color: Colors.black54, height: 1.5)),
            ],
            Align(alignment: Alignment.centerRight, child: TextButton.icon(
                onPressed: _editProfile, icon: const Icon(Icons.edit, size: 14), label: const Text('编辑资料', style: TextStyle(fontSize: 12)))),
          ]),
        ),
        const SizedBox(height: 12),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Card(clipBehavior: Clip.antiAlias, child: Column(children: [
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            leading: const Icon(Icons.receipt_long_outlined, color: kPrimary),
            title: const Text('我的订单', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrdersPage(me: widget.me))),
          ),
          const Divider(height: 1, indent: 16),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            leading: const Icon(Icons.groups_outlined, color: kPrimary),
            title: const Text('共创项目', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: const Text('发布项目 · 推荐人选', style: TextStyle(fontSize: 11)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectsPage(me: widget.me))),
          ),
        ]))),
        const SizedBox(height: 16),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Card(clipBehavior: Clip.antiAlias, child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Text('作品展示', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              const Spacer(),
              const Text('仅本机可见', style: TextStyle(fontSize: 10, color: Colors.black26)),
              IconButton(onPressed: _addWork, icon: const Icon(Icons.add_a_photo_outlined, size: 20, color: kPrimary)),
            ]),
            const SizedBox(height: 6),
            works.isEmpty
                ? const Padding(padding: EdgeInsets.symmetric(vertical: 18), child: Center(child: Text('还没有作品，点右上角相机添加', style: TextStyle(fontSize: 12, color: Colors.black26))))
                : SizedBox(
                    height: 96,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: works.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final data = works[i].split(',').last;
                        return Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.memory(base64Decode(data), width: 96, height: 96, fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(width: 96, height: 96, color: const Color(0xFFEDF2FF))),
                            ),
                            Positioned(
                              top: 2,
                              right: 2,
                              child: GestureDetector(
                                onTap: () => _removeWork(i),
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(color: Colors.black45, shape: BoxShape.circle),
                                  child: const Icon(Icons.close, size: 12, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
          ]),
        ))),
        const SizedBox(height: 24),
        const Center(child: Text('己曜 v1.1.0 · 让每一项技能都有价值', style: TextStyle(fontSize: 11, color: Colors.black26))),
        const SizedBox(height: 24),
      ]),
    );
  }
}
