# -*- coding: utf-8 -*-
# Dart 括号配平检查（跳过字符串/注释）
import io
import sys

BS = chr(92)


def check(path):
    c = io.open(path, encoding='utf-8').read()
    line_no = 1
    stack = []
    i = 0
    n = len(c)
    in_str = None
    while i < n:
        ch = c[i]
        if ch == '\n':
            line_no += 1
            if in_str in ("'", '"'):
                in_str = None
            i += 1
            continue
        if in_str:
            if ch == BS:
                i += 2
                continue
            if in_str == "'''" and c[i:i + 3] == "'''":
                in_str = None
                i += 3
                continue
            if in_str == '"""' and c[i:i + 3] == '"""':
                in_str = None
                i += 3
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if c[i:i + 3] == "'''" or c[i:i + 3] == '"""':
            in_str = c[i:i + 3]
            i += 3
            continue
        if ch in ('"', "'"):
            in_str = ch
            i += 1
            continue
        if c[i:i + 2] == '//':
            while i < n and c[i] != '\n':
                i += 1
            continue
        if c[i:i + 2] == '/*':
            j = c.find('*/', i)
            line_no += c.count('\n', i, j if j != -1 else n)
            i = (j + 2) if j != -1 else n
            continue
        if ch in '([{':
            stack.append((line_no, i, ch))
        elif ch in ')]}':
            if not stack:
                print(path + ': 多余的 ' + ch + ' 于行 ' + str(line_no))
                return
            o = stack.pop()
            pair = {'(': ')', '[': ']', '{': '}'}
            if pair[o[2]] != ch:
                print(path + ': 不匹配 ' + o[2] + '(行' + str(o[0]) + ') 被 ' + ch + '(行' + str(line_no) + ') 关闭')
                return
        i += 1
    if stack:
        for o in stack[-3:]:
            print(path + ': 未闭合 ' + o[2] + ' 于行 ' + str(o[0]))
        return
    print(path + ': 平衡 OK')


for f in sys.argv[1:]:
    check(f)
