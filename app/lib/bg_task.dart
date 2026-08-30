// ============================================================
// 后台消息提醒：App 退到后台后，系统定时任务每15分钟轮询一次未读，
// 有新私信就弹系统通知（国内无 FCM，用本地通知 + Workmanager 实现）
// ============================================================
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import 'api.dart';

const String kPollTaskName = 'jyaoMsgPoll';

void writeBgLog(String line) {
  try {
    getApplicationDocumentsDirectory().then((d) {
      final f = File(d.path + '/bg_log.txt');
      final old = f.existsSync() ? f.readAsStringSync() : '';
      f.writeAsStringSync(old + '[' + DateTime.now().toIso8601String() + '] ' + line + '\n');
    });
  } catch (_) {}
}

// 通知插件（前台与后台隔离环境都要新建实例）
final FlutterLocalNotificationsPlugin _notif = FlutterLocalNotificationsPlugin();
bool _notifInited = false;

Future<void> _initNotifications() async {
  if (_notifInited) return;
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _notif.initialize(const InitializationSettings(android: android));
  _notifInited = true;
}

/// 前台请求通知权限（Android 13+ 需要运行时授权），在消息页首次进入时调用
Future<void> requestNotificationPermission() async {
  try {
    await _initNotifications();
    await _notif
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  } catch (_) {}
}

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      if (token == null) return true;
      final res = await http
          .get(Uri.parse('$kApiBase/conversations'), headers: {'Authorization': 'Bearer $token'})
          .timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) return true;
      final convs = jsonDecode(utf8.decode(res.bodyBytes)) as List;
      int unread = 0;
      for (final c in convs) {
        unread += (c['unread'] as num?)?.toInt() ?? 0;
      }
      final last = prefs.getInt('last_notified_unread') ?? 0;
      if (unread > last) {
        await _initNotifications();
        const android = AndroidNotificationDetails('jyao_messages', '私信消息',
            channelDescription: '收到新私信时提醒', importance: Importance.high, priority: Priority.high);
        await _notif.show(1, '己曜', '你有 $unread 条新消息，快来查看吧', const NotificationDetails(android: android));
      }
      await prefs.setInt('last_notified_unread', unread);
    } catch (e) {
      writeBgLog('后台轮询异常: ' + e.toString());
    }
    return true;
  });
}

/// 注册后台定时轮询（系统保证至少15分钟一次）。逐段保护，失败不影响App
Future<void> initBackgroundPolling() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool('bg_notify') == false) return; // 用户在设置里关闭了提醒
  } catch (_) {}
  try {
    await Workmanager().initialize(callbackDispatcher);
  } catch (e) {
    writeBgLog('workmanager initialize失败: ' + e.toString());
    return;
  }
  try {
    await Workmanager().registerPeriodicTask(
      kPollTaskName,
      kPollTaskName,
      frequency: const Duration(minutes: 15),
      existingWorkPolicy: ExistingWorkPolicy.keep,
    );
  } catch (e) {
    writeBgLog('workmanager register失败: ' + e.toString());
  }
}

/// 关闭后台提醒
Future<void> disableBackgroundPolling() async {
  try {
    await Workmanager().cancelByUniqueName(kPollTaskName);
  } catch (_) {}
}
