// ============================================================
// API 客户端：对接 Cloudflare Worker 后端（与网站同一套接口）
// ============================================================
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'cache.dart';

const String kApiBase = 'https://azhegezhege.pages.dev/api';
const String kSiteBase = 'https://azhegezhege.pages.dev';

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

// ---------- 数据模型 ----------

class UserAccount {
  final int id;
  final String username;
  final String realName;
  final int userType; // 0 客户 / 1 技能提供者
  final String skillTag;
  final String phone;
  final String? avatar;
  final bool online;
  final int? lastSeen;
  final String bio;
  final int discoverable;
  UserAccount({
    required this.id,
    required this.username,
    required this.realName,
    required this.userType,
    this.skillTag = '',
    this.phone = '',
    this.avatar,
    this.online = false,
    this.lastSeen,
    this.bio = '',
    this.discoverable = 1,
  });

  factory UserAccount.fromJson(dynamic j) => UserAccount(
        id: (j['id'] as num).toInt(),
        username: (j['username'] ?? '') as String,
        realName: (j['real_name'] ?? j['username'] ?? '用户') as String,
        userType: (j['user_type'] as num?)?.toInt() ?? 0,
        skillTag: (j['skill_tag'] ?? '') as String,
        phone: (j['phone'] ?? '') as String,
        avatar: j['avatar'] as String?,
        online: j['online'] == true,
        lastSeen: (j['last_seen'] as num?)?.toInt(),
        bio: (j['bio'] ?? '') as String,
        discoverable: (j['discoverable'] as num?)?.toInt() ?? 1,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'real_name': realName,
        'user_type': userType,
        'skill_tag': skillTag,
        'phone': phone,
        'avatar': avatar,
      };

  String get displayName => realName.isNotEmpty ? realName : username;
}

class Conversation {
  final int peerId;
  final String name;
  final String? avatar;
  final bool online;
  final String lastMsg;
  final int lastTime;
  final int unread;
  Conversation({
    required this.peerId,
    required this.name,
    this.avatar,
    required this.online,
    required this.lastMsg,
    required this.lastTime,
    required this.unread,
  });

  factory Conversation.fromJson(dynamic j) => Conversation(
        peerId: (j['peer_id'] as num).toInt(),
        name: (j['name'] ?? '用户') as String,
        avatar: j['avatar'] as String?,
        online: j['online'] == true,
        lastMsg: (j['last_msg'] ?? '') as String,
        lastTime: (j['last_time'] as num?)?.toInt() ?? 0,
        unread: (j['unread'] as num?)?.toInt() ?? 0,
      );
}

class ChatMessage {
  final int id;
  final int senderId;
  final int receiverId;
  final String content;
  final int createTime;
  final bool isRead;
  ChatMessage({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.content,
    required this.createTime,
    required this.isRead,
  });

  factory ChatMessage.fromJson(dynamic j) => ChatMessage(
        id: (j['id'] as num).toInt(),
        senderId: (j['sender_id'] as num).toInt(),
        receiverId: (j['receiver_id'] as num).toInt(),
        content: (j['content'] ?? '') as String,
        createTime: (j['create_time'] as num).toInt(),
        isRead: (j['is_read'] as num?)?.toInt() == 1,
      );
}

class ServiceItem {
  final int id;
  final int userId;
  final String sellerName;
  final bool sellerOnline;
  final String title;
  final String desc;
  final double price;
  final String serviceType;
  final String subCategory;
  final List<String> tags;
  final String cover; // 网站静态图相对路径
  ServiceItem({
    required this.id,
    required this.userId,
    required this.sellerName,
    required this.sellerOnline,
    required this.title,
    required this.desc,
    required this.price,
    required this.serviceType,
    required this.subCategory,
    required this.tags,
    required this.cover,
  });

  factory ServiceItem.fromJson(dynamic j) => ServiceItem(
        id: (j['id'] as num).toInt(),
        userId: (j['user_id'] as num).toInt(),
        sellerName: (j['seller_name'] ?? '用户') as String,
        sellerOnline: j['online'] == true,
        title: (j['title'] ?? '') as String,
        desc: (j['service_desc'] ?? '') as String,
        price: (j['price'] as num?)?.toDouble() ?? 0,
        serviceType: (j['service_type'] ?? '') as String,
        subCategory: (j['sub_category'] ?? '') as String,
        tags: ((j['tags'] as List?) ?? []).map((e) => e.toString()).toList(),
        cover: (j['cover'] ?? '') as String,
      );

  String get coverUrl => cover.startsWith('http') ? cover : '$kSiteBase/$cover';
}

class ProjectItem {
  final int id;
  final String name;
  final String desc;
  final int creatorId;
  final String creatorName;
  final bool creatorOnline;
  final double budget;
  final int memberCount;
  final List<String> needSkills;
  ProjectItem({
    required this.id,
    required this.name,
    required this.desc,
    required this.creatorId,
    required this.creatorName,
    required this.creatorOnline,
    required this.budget,
    required this.memberCount,
    required this.needSkills,
  });

  factory ProjectItem.fromJson(dynamic j) => ProjectItem(
        id: (j['id'] as num).toInt(),
        name: (j['project_name'] ?? '') as String,
        desc: (j['project_desc'] ?? '') as String,
        creatorId: (j['creator_id'] as num).toInt(),
        creatorName: (j['creator_name'] ?? '用户') as String,
        creatorOnline: j['creator_online'] == true,
        budget: (j['total_budget'] as num?)?.toDouble() ?? 0,
        memberCount: (j['member_count'] as num?)?.toInt() ?? 0,
        needSkills: ((j['need_skills'] as List?) ?? []).map((e) => e.toString()).toList(),
      );
}

class TaskItem {
  final int id;
  final String title;
  final String desc;
  final double budget;
  final String deadline;
  final int publisherId;
  final String publisherName;
  final bool publisherOnline;
  final int? takerId;
  final int status; // 0 待接单 1 已接单
  TaskItem({
    required this.id,
    required this.title,
    required this.desc,
    required this.budget,
    required this.deadline,
    required this.publisherId,
    required this.publisherName,
    required this.publisherOnline,
    this.takerId,
    required this.status,
  });

  factory TaskItem.fromJson(dynamic j) => TaskItem(
        id: (j['id'] as num).toInt(),
        title: (j['title'] ?? '') as String,
        desc: (j['task_desc'] ?? '') as String,
        budget: (j['budget'] as num?)?.toDouble() ?? 0,
        deadline: (j['deadline'] ?? '') as String,
        publisherId: (j['publisher_id'] as num).toInt(),
        publisherName: (j['publisher_name'] ?? '用户') as String,
        publisherOnline: j['publisher_online'] == true,
        takerId: (j['taker_id'] as num?)?.toInt(),
        status: (j['status'] as num?)?.toInt() ?? 0,
      );
}

class GroupInfo {
  final int groupId;
  final String name;
  final int memberCount;
  GroupInfo({required this.groupId, required this.name, required this.memberCount});
  factory GroupInfo.fromJson(dynamic j) => GroupInfo(
        groupId: (j['group_id'] as num).toInt(),
        name: (j['name'] ?? '群聊') as String,
        memberCount: (j['member_count'] as num?)?.toInt() ?? 0,
      );
}

class GroupInvite {
  final int inviteId;
  final int groupId;
  final String name;
  final String inviterName;
  GroupInvite({required this.inviteId, required this.groupId, required this.name, required this.inviterName});
  factory GroupInvite.fromJson(dynamic j) => GroupInvite(
        inviteId: (j['invite_id'] as num).toInt(),
        groupId: (j['group_id'] as num).toInt(),
        name: (j['name'] ?? '') as String,
        inviterName: (j['inviter_name'] ?? '用户') as String,
      );
}

class GroupMessage {
  final int id;
  final int groupId;
  final int senderId;
  final String senderName;
  final String content;
  final int createTime;
  GroupMessage({required this.id, required this.groupId, required this.senderId, required this.senderName, required this.content, required this.createTime});
  factory GroupMessage.fromJson(dynamic j) => GroupMessage(
        id: (j['id'] as num).toInt(),
        groupId: (j['group_id'] as num).toInt(),
        senderId: (j['sender_id'] as num).toInt(),
        senderName: (j['sender_name'] ?? '用户') as String,
        content: (j['content'] ?? '') as String,
        createTime: (j['create_time'] as num).toInt(),
      );
}

class OrderItem {
  final int id;  final String? serviceTitle;
  final String? serviceCover;
  final int buyerId;
  final int sellerId;
  final String buyerName;
  final String sellerName;
  final bool amBuyer;
  final double price;
  final int status; // 0 待接单 1 进行中 2 已完成 3 已取消
  final int createdAt;
  final String? snapshotDesc;
  final String? snapshotCover;
  final String? snapshotType;
  final String? snapshotSub;
  OrderItem({
    required this.id,
    this.serviceTitle,
    this.serviceCover,
    required this.buyerId,
    required this.sellerId,
    required this.buyerName,
    required this.sellerName,
    required this.amBuyer,
    required this.price,
    required this.status,
    required this.createdAt,
  });

  factory OrderItem.fromJson(dynamic j) => OrderItem(
        id: (j['id'] as num).toInt(),
        serviceTitle: j['service_title'] as String?,
        serviceCover: j['service_cover'] as String?,
        buyerId: (j['buyer_id'] as num).toInt(),
        sellerId: (j['seller_id'] as num).toInt(),
        buyerName: (j['buyer_name'] ?? '用户') as String,
        sellerName: (j['seller_name'] ?? '用户') as String,
        amBuyer: j['am_buyer'] == true,
        snapshotDesc: j['snapshot_desc'] as String?,
        snapshotCover: j['snapshot_cover'] as String?,
        snapshotType: j['snapshot_type'] as String?,
        snapshotSub: j['snapshot_sub'] as String?,
        price: (j['order_price'] as num?)?.toDouble() ?? 0,
        status: (j['order_status'] as num?)?.toInt() ?? 0,
        createdAt: (j['created_at'] as num?)?.toInt() ?? 0,
      );

  String get statusText => ['待接单', '进行中', '已完成', '已取消'][status.clamp(0, 3)];
  String get peerName => amBuyer ? sellerName : buyerName;
  int get peerId => amBuyer ? sellerId : buyerId;
}

// ---------- API 客户端 ----------

class Api {
  String? token;
  /// 401（登录过期）时的全局回调，由 App 入口设置：清会话并回到登录页
  void Function()? onUnauthorized;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> _send(String method, String path, {Map<String, String>? query, Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$kApiBase$path').replace(queryParameters: query);
    late http.Response res;
    try {
      if (method == 'POST') {
        res = await http.post(uri, headers: _headers, body: jsonEncode(body ?? {}));
      } else {
        res = await http.get(uri, headers: _headers);
      }
    } catch (e) {
      throw ApiException('网络连接失败，请检查网络');
    }
    if (res.statusCode == 401) {
      onUnauthorized?.call();
      throw ApiException('登录已过期，请重新登录');
    }
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      throw ApiException('服务器返回异常 (${res.statusCode})');
    }
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null ? data['error'] as String : '请求失败 (${res.statusCode})';
      throw ApiException(msg);
    }
    // 成功的列表数据写入本地缓存，供下次秒开
    if (data is List) {
      for (final entry in {'/services': 'services', '/conversations': 'conversations', '/tasks': 'tasks', '/orders': 'orders', '/projects': 'projects'}.entries) {
        if (path.startsWith(entry.key)) {
          LocalCache.put(entry.value, data);
          break;
        }
      }
    }
    return data;
  }

  // ---- 认证 ----
  Future<UserAccount> register({
    required String username,
    required String password,
    String realName = '',
    int userType = 0,
    String skillTag = '',
    String phone = '',
    String smsCode = '',
  }) async {
    final d = await _send('POST', '/register', body: {
      'username': username,
      'password': password,
      'real_name': realName,
      'user_type': userType,
      'skill_tag': skillTag,
      'phone': phone,
      'sms_code': smsCode,
    });
    token = d['token'] as String?;
    return UserAccount.fromJson(d['user']);
  }

  Future<UserAccount> login({required String username, required String password}) async {
    final d = await _send('POST', '/login', body: {'username': username, 'password': password});
    token = d['token'] as String?;
    return UserAccount.fromJson(d['user']);
  }

  Future<UserAccount> me() async {
    final d = await _send('GET', '/me');
    return UserAccount.fromJson(d);
  }

  Future<void> heartbeat() async {
    await _send('POST', '/heartbeat');
  }

  // ---- 用户 ----
  Future<List<UserAccount>> usersByIds(List<int> ids) async {
    if (ids.isEmpty) return [];
    final d = await _send('GET', '/users', query: {'ids': ids.join(',')});
    return (d as List).map(UserAccount.fromJson).toList();
  }

  Future<UserAccount?> userByUsername(String username) async {
    final d = await _send('GET', '/users', query: {'username': username});
    final list = (d as List).map(UserAccount.fromJson).toList();
    return list.isEmpty ? null : list.first;
  }

  // ---- 聊天 ----
  Future<List<Conversation>> conversations() async {
    final d = await _send('GET', '/conversations');
    return (d as List).map(Conversation.fromJson).toList();
  }

  Future<List<ChatMessage>> history(int peerId) async {
    final d = await _send('GET', '/history', query: {'peer_id': '$peerId'});
    return (d as List).map(ChatMessage.fromJson).toList();
  }

  Future<void> send(int receiverId, String content) async {
    await _send('POST', '/send', body: {'receiver_id': receiverId, 'content': content});
  }

  Future<void> markRead(int peerId) async {
    await _send('POST', '/read', body: {'peer_id': peerId});
  }

  // ---- 服务市场 ----
  Future<List<ServiceItem>> services({bool mine = false}) async {
    final d = await _send('GET', '/services', query: mine ? {'mine': '1'} : null);
    return (d as List).map(ServiceItem.fromJson).toList();
  }

  Future<void> publishService({
    required String title,
    required String desc,
    required double price,
    required String serviceType,
    String subCategory = '',
    List<String> tags = const [],
  }) async {
    await _send('POST', '/services', body: {
      'title': title,
      'service_desc': desc,
      'price': price,
      'service_type': serviceType,
      'sub_category': subCategory,
      'tags': tags,
    });
  }

  // ---- 共创项目 ----
  Future<List<ProjectItem>> projects() async {
    final d = await _send('GET', '/projects');
    return (d as List).map(ProjectItem.fromJson).toList();
  }

  Future<void> joinProject(int projectId, {String role = '成员'}) async {
    await _send('POST', '/projects/join', body: {'project_id': projectId, 'role': role});
  }

  // ---- 用户目录（找得到聊过的人） ----
  Future<List<UserAccount>> allUsers() async {
    final d = await _send('GET', '/users');
    return (d as List).map(UserAccount.fromJson).toList();
  }

  // ---- 需求（任务）大厅 ----
  Future<List<TaskItem>> tasks() async {
    final d = await _send('GET', '/tasks');
    return (d as List).map(TaskItem.fromJson).toList();
  }

  Future<void> createTask({
    required String title,
    required String desc,
    required double budget,
    String deadline = '',
  }) async {
    await _send('POST', '/tasks', body: {
      'title': title,
      'task_desc': desc,
      'budget': budget,
      'deadline': deadline,
    });
  }

  Future<void> takeTask(int taskId) async {
    await _send('POST', '/tasks/take', body: {'task_id': taskId});
  }

  // ---- 订单取消 ----
  Future<void> cancelOrder(int orderId) async {
    await _send('POST', '/orders/cancel', body: {'order_id': orderId});
  }

  // ---- 个人设置 ----
  Future<void> saveSettings({bool? discoverable, String? skillTag, String? bio, String? realName}) async {
    await _send('PUT', '/settings', body: {
      if (discoverable != null) 'discoverable': discoverable,
      if (skillTag != null) 'skill_tag': skillTag,
      if (bio != null) 'bio': bio,
      if (realName != null) 'real_name': realName,
    });
  }

  // ---- 群聊 ----
  List<GroupInvite> _lastInvites = [];
  List<GroupInvite> get pendingInvites => _lastInvites;

  Future<List<GroupInfo>> myGroups() async {
    final d = await _send('GET', '/groups/mine');
    final joined = ((d['joined'] ?? []) as List).map(GroupInfo.fromJson).toList();
    _lastInvites = ((d['invites'] ?? []) as List).map(GroupInvite.fromJson).toList();
    return joined;
  }

  Future<void> createGroup(String name, List<int> memberIds) async {
    await _send('POST', '/groups', body: {'name': name, 'member_ids': memberIds});
  }

  Future<void> handleGroupInvite(int inviteId, bool accept) async {
    await _send('POST', '/groups/invites/handle', body: {'invite_id': inviteId, 'accept': accept});
  }

  Future<List<GroupMessage>> groupHistory(int groupId) async {
    final d = await _send('GET', '/group/history', query: {'group_id': '$groupId'});
    return (d as List).map(GroupMessage.fromJson).toList();
  }

  Future<void> groupSend(int groupId, String content) async {
    await _send('POST', '/group/send', body: {'group_id': groupId, 'content': content});
  }

  // ---- 共创发布与推荐 ----
  Future<void> createProject({required String name, required String desc, double budget = 0, List<String> needSkills = const []}) async {
    await _send('POST', '/projects', body: {
      'project_name': name,
      'project_desc': desc,
      'total_budget': budget,
      'need_skills': needSkills,
    });
  }

  Future<List<UserAccount>> recommendFor(int projectId) async {
    final d = await _send('GET', '/projects/recommend', query: {'project_id': '$projectId'});
    return (d as List).map(UserAccount.fromJson).toList();
  }

  // ---- 短信验证码 ----
  /// 返回 null 表示真实短信已发送；返回字符串为开发模式验证码
  Future<String?> sendSmsCode(String phone) async {
    final d = await _send('POST', '/sms/send', body: {'phone': phone});
    return d['dev_code'] as String?;
  }

  // ---- 订单 ----
  Future<void> createOrder(int serviceId) async {
    await _send('POST', '/orders', body: {'service_id': serviceId});
  }

  Future<List<OrderItem>> orders() async {
    final d = await _send('GET', '/orders');
    return (d as List).map(OrderItem.fromJson).toList();
  }
}
