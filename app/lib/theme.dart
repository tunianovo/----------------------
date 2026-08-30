// ============================================================
// 主题：Material 3，参考微软 Fluent / 谷歌 Material 的简洁风格
// ============================================================
import 'package:flutter/material.dart';

const Color kPrimary = Color(0xFF0A6CFF);
const Color kPrimaryDark = Color(0xFF0053C0);
const Color kBg = Color(0xFFF6F7F9);
const Color kCard = Colors.white;
const Color kOnline = Color(0xFF2ECC71);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: kPrimary);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme.copyWith(primary: kPrimary, secondary: kPrimary),
    scaffoldBackgroundColor: kBg,
    appBarTheme: const AppBarTheme(
      backgroundColor: kBg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.black),
    ),
    cardTheme: CardTheme(
      color: kCard,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFE8EAED))),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFFF0F2F5),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: kPrimary, width: 1.6)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: kPrimary.withOpacity(0.12),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      height: 68,
    ),
    dividerTheme: const DividerThemeData(color: Color(0xFFE8EAED), thickness: 1),
  );
}

// 在线状态小圆点
class OnlineDot extends StatelessWidget {
  final double size;
  const OnlineDot({super.key, this.size = 8});
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(color: kOnline, shape: BoxShape.circle),
      );
}

// 头像（网络图或首字母占位）
class UserAvatar extends StatelessWidget {
  final String? url;
  final String name;
  final double radius;
  const UserAvatar({super.key, this.url, required this.name, this.radius = 22});
  @override
  Widget build(BuildContext context) {
    final circle = ClipOval(
      child: url != null && url!.isNotEmpty
          ? Image.network(url!, width: radius * 2, height: radius * 2, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _fallback())
          : _fallback(),
    );
    return circle;
  }

  Widget _fallback() => Container(
        width: radius * 2,
        height: radius * 2,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [Color(0xFF0A6CFF), Color(0xFF00C2FF)]),
        ),
        child: Text(
          name.isNotEmpty ? name.characters.first : '?',
          style: TextStyle(color: Colors.white, fontSize: radius * 0.85, fontWeight: FontWeight.w600),
        ),
      );
}
