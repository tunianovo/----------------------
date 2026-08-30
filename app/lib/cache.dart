// ============================================================
// 本地数据缓存：页面秒开（先渲染上次数据，后台刷新替换）
// "退出前保存，下次上线加载，刷新成功后替换" 的订单等数据都走这里
// ============================================================
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class LocalCache {
  static const _prefix = 'cache_';

  /// 保存列表数据（jsonEncode 后存 SharedPreferences）
  static Future<void> put(String key, dynamic data) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('$_prefix$key', jsonEncode({'t': DateTime.now().millisecondsSinceEpoch, 'd': data}));
    } catch (_) {}
  }

  /// 读取缓存，返回原始 JSON（List 或 Map），无缓存返回 null
  static Future<dynamic> get(String key) async {
    try {
      final p = await SharedPreferences.getInstance();
      final s = p.getString('$_prefix$key');
      if (s == null) return null;
      return jsonDecode(s)['d'];
    } catch (_) {
      return null;
    }
  }

  /// 清除指定缓存
  static Future<void> clear(String key) async {
    final p = await SharedPreferences.getInstance();
    await p.remove('$_prefix$key');
  }
}
